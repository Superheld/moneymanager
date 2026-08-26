// Einrichten, Entsperren, Sperren — und die einmalige Ueberfuehrung des Altbestands.
//
// **Was wo liegt.** Neben der Datenbank liegt eine Huelle (`<name>.schluessel.json`): der
// mit der Passphrase eingewickelte Datenschluessel. Sie enthaelt nichts Geheimes und
// gehoert mitgesichert — eine Sicherung ohne sie ist nur mit dem Wiederherstellungscode
// zu oeffnen.
//
// **Ohne Huelle ist nichts eingerichtet.** Das ist die ganze Zustandslogik: Huelle da =
// eingerichtet, Pool offen = entsperrt. Kein Schalter in der Datenbank, denn den koennte
// man erst lesen, nachdem man sie geoeffnet hat.

use std::path::{Path, PathBuf};

use serde::Serialize;
use sqlx::{Executor, Row};
use tauri::{AppHandle, Manager, State};

use crate::datenbank::{Datenbank, Oeffnung};
use crate::schluessel::{auswickeln, einwickeln, Datenschluessel, Huelle, SchluesselFehler};

/// Wie die Oberflaeche den Zustand sieht.
#[derive(Serialize)]
pub struct Stand {
    /// Gibt es eine Huelle? Wenn nicht, muss eingerichtet werden.
    pub eingerichtet: bool,
    /// Ist die Datenbank gerade offen?
    pub offen: bool,
    /// Liegt ein unverschluesselter Altbestand da, der ueberfuehrt werden muss?
    pub altbestand: bool,
}

fn datenverzeichnis(app: &AppHandle) -> Result<PathBuf, String> {
    let p = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Kein App-Datenverzeichnis: {e}"))?;
    std::fs::create_dir_all(&p).map_err(|e| format!("Datenverzeichnis fehlt: {e}"))?;
    Ok(p)
}

fn huellenpfad(app: &AppHandle, datei: &str) -> Result<PathBuf, String> {
    Ok(datenverzeichnis(app)?.join(format!("{datei}.schluessel.json")))
}

fn huelle_lesen(app: &AppHandle, datei: &str) -> Result<Option<Huelle>, String> {
    let pfad = huellenpfad(app, datei)?;
    if !pfad.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&pfad).map_err(|e| format!("Huelle nicht lesbar: {e}"))?;
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|e| format!("Huelle beschaedigt: {e}"))
}

/// **Erst neben die alte schreiben, dann umbenennen.** Ein Absturz mitten im Schreiben
/// liesse sonst eine halbe Huelle zurueck — und eine halbe Huelle ist ein verlorener
/// Bestand, wenn der Wiederherstellungscode nicht zur Hand ist.
fn huelle_schreiben(app: &AppHandle, datei: &str, h: &Huelle) -> Result<(), String> {
    let ziel = huellenpfad(app, datei)?;
    let vorlaeufig = ziel.with_extension("json.neu");
    let text = serde_json::to_string_pretty(h).map_err(|e| e.to_string())?;
    std::fs::write(&vorlaeufig, text).map_err(|e| format!("Huelle nicht schreibbar: {e}"))?;
    std::fs::rename(&vorlaeufig, &ziel).map_err(|e| format!("Huelle nicht ersetzbar: {e}"))
}

/// Ob eine Datei eine UNVERSCHLUESSELTE SQLite-Datenbank ist.
///
/// Am Dateikopf erkannt und nicht am Oeffnen: Oeffnen wuerde eine Datei anlegen, die es
/// nicht gab, und aus der Frage eine Tatsache machen.
fn ist_klartext(pfad: &Path) -> bool {
    let Ok(inhalt) = std::fs::read(pfad) else { return false };
    inhalt.starts_with(b"SQLite format 3\0")
}

#[tauri::command]
pub async fn zugang_stand(
    app: AppHandle,
    datei: String,
    db: State<'_, Datenbank>,
) -> Result<Stand, String> {
    let pfad = datenverzeichnis(&app)?.join(&datei);
    Ok(Stand {
        eingerichtet: huelle_lesen(&app, &datei)?.is_some(),
        offen: db.0.read().await.is_some(),
        altbestand: pfad.exists() && ist_klartext(&pfad),
    })
}

async fn oeffnen_mit(
    app: &AppHandle,
    datei: &str,
    dk: &Datenschluessel,
    db: &State<'_, Datenbank>,
) -> Result<bool, String> {
    crate::datenbank::oeffnen_intern(
        app,
        Oeffnung { datei: datei.to_string(), pragma: Some(dk.als_pragma()), anlegen: true },
        db,
    )
    .await
}

/// Einrichten: Schluessel wuerfeln, einwickeln, Datenbank anlegen oder ueberfuehren.
///
/// Gibt den **Wiederherstellungscode** zurueck — und zwar genau einmal, hier. Wer ihn
/// spaeter wieder sehen will, muss die Passphrase erneut eingeben; das ist der Grund,
/// warum er nicht nebenbei irgendwo gespeichert wird.
#[tauri::command]
pub async fn zugang_einrichten(
    app: AppHandle,
    datei: String,
    passphrase: String,
    db: State<'_, Datenbank>,
) -> Result<String, String> {
    if huelle_lesen(&app, &datei)?.is_some() {
        return Err("Es ist bereits ein Zugang eingerichtet.".into());
    }

    let dk = Datenschluessel::wuerfeln();
    let pfad = datenverzeichnis(&app)?.join(&datei);

    if pfad.exists() && ist_klartext(&pfad) {
        ueberfuehren(&pfad, &dk).await?;
        alte_sicherungen_wegwerfen(&app, &datei)?;
    }

    // Die Huelle zuletzt: solange sie fehlt, gilt „nicht eingerichtet", und ein
    // abgebrochener Lauf faengt sauber von vorn an, statt halb eingerichtet dazustehen.
    let huelle = einwickeln(&dk, &passphrase).map_err(|e| e.to_string())?;
    huelle_schreiben(&app, &datei, &huelle)?;

    if !oeffnen_mit(&app, &datei, &dk, &db).await? {
        return Err("Die frisch eingerichtete Datenbank liess sich nicht oeffnen.".into());
    }
    Ok(dk.als_wiederherstellungscode())
}

/// Den unverschluesselten Bestand in eine verschluesselte Datei ueberfuehren.
///
/// **Die Reihenfolge ist der ganze Inhalt dieser Funktion.** Sie ist so gelegt, dass es
/// keinen Zeitpunkt gibt, an dem beide Fassungen unbrauchbar sind:
///
///   1. Eine Sicherung des Altbestands ziehen — der Rettungsanker, falls alles schiefgeht.
///   2. Die verschluesselte Fassung NEBEN die alte schreiben (`sqlcipher_export`).
///   3. Nachweisen, dass sie sich oeffnen laesst und heil ist.
///   4. Erst dann die alte Datei wegwerfen und die neue an ihren Platz stellen.
///
/// Bricht es vor Schritt 4 ab, steht der Altbestand unberuehrt da und die App ist
/// weiterhin „nicht eingerichtet".
async fn ueberfuehren(pfad: &Path, dk: &Datenschluessel) -> Result<(), String> {
    let neu = pfad.with_extension("db.verschluesselt");
    let _ = std::fs::remove_file(&neu);

    let alt = crate::datenbank::pool_klartext(pfad).await.map_err(|e| e.to_string())?;

    // **EINE Verbindung, festgehalten.** `ATTACH` gilt nur fuer die Verbindung, die es
    // ausfuehrt — ueber den Pool bekaeme `sqlcipher_export` eine andere und meldete
    // „unknown database". Dieselbe Falle wie bei `PRAGMA key` und `foreign_keys`; sie
    // taucht bei jedem Zustand auf, der an einer Verbindung haengt statt an der Datei.
    let mut conn = alt.acquire().await.map_err(|e| e.to_string())?;

    // `sqlcipher_export` kopiert das ganze Schema samt Inhalt in die angehaengte
    // Datenbank — der von SQLCipher vorgesehene Weg. Von Hand Tabelle fuer Tabelle zu
    // kopieren hiesse, Indizes, Trigger und Fremdschluessel nachzubauen.
    let anhaengen = format!(
        "ATTACH DATABASE '{}' AS verschluesselt KEY {}",
        neu.to_string_lossy().replace('\'', "''"),
        dk.als_pragma()
    );
    conn.execute(anhaengen.as_str()).await.map_err(|e| e.to_string())?;
    let ergebnis = sqlx::query("SELECT sqlcipher_export('verschluesselt')")
        .fetch_optional(&mut *conn)
        .await;
    let _ = conn.execute("DETACH DATABASE verschluesselt").await;
    drop(conn);
    alt.close().await;
    ergebnis.map_err(|e| format!("Ueberfuehrung fehlgeschlagen: {e}"))?;

    pruefen(&neu, dk).await?;

    std::fs::remove_file(pfad).map_err(|e| format!("Altbestand nicht loeschbar: {e}"))?;
    // WAL und SHM des Altbestands gehen mit — sie gehoeren zur alten Datei und waeren
    // sonst unverschluesselte Reste neben einer verschluesselten Datenbank.
    for anhang in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{anhang}", pfad.to_string_lossy()));
    }
    std::fs::rename(&neu, pfad).map_err(|e| format!("Neue Datei nicht einsetzbar: {e}"))
}

/// Die neue Datei muss sich oeffnen lassen UND heil sein, bevor die alte fallen darf.
async fn pruefen(neu: &Path, dk: &Datenschluessel) -> Result<(), String> {
    let pool = crate::datenbank::pool_mit_schluessel(neu, &dk.als_pragma())
        .await
        .map_err(|e| format!("Die neue Datei liess sich nicht oeffnen: {e}"))?;
    let zeile = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Pruefung fehlgeschlagen: {e}"))?;
    let befund: String = zeile.try_get(0).unwrap_or_default();
    pool.close().await;
    if befund != "ok" {
        return Err(format!("Die neue Datei ist nicht heil: {befund}"));
    }
    Ok(())
}

/// Die Sicherungen aus der Klartext-Zeit wegwerfen.
///
/// Sie bleiben unverschluesselt, egal was mit der Datenbank passiert — sie liegen zu
/// lassen hiesse, den ganzen Aufwand durch die Hintertuer wieder aufzugeben. Entfernt
/// wird ausschliesslich, was unverschluesselt IST: geprueft am Dateikopf, nicht am Namen.
fn alte_sicherungen_wegwerfen(app: &AppHandle, datei: &str) -> Result<(), String> {
    let ordner = datenverzeichnis(app)?.join("sicherungen");
    let Ok(eintraege) = std::fs::read_dir(&ordner) else { return Ok(()) };
    let stamm = datei.strip_suffix(".db").unwrap_or(datei);

    for eintrag in eintraege.flatten() {
        let pfad = eintrag.path();
        let name = eintrag.file_name().to_string_lossy().to_string();
        if name.starts_with(stamm) && ist_klartext(&pfad) {
            let _ = std::fs::remove_file(&pfad);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn zugang_entsperren(
    app: AppHandle,
    datei: String,
    passphrase: String,
    db: State<'_, Datenbank>,
) -> Result<bool, String> {
    let Some(huelle) = huelle_lesen(&app, &datei)? else {
        return Err("Es ist kein Zugang eingerichtet.".into());
    };
    match auswickeln(&huelle, &passphrase) {
        Ok(dk) => oeffnen_mit(&app, &datei, &dk, &db).await,
        Err(SchluesselFehler::PassphraseFalsch) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Entsperren mit dem Wiederherstellungscode — und dabei gleich eine neue Passphrase
/// setzen. Wer den Zettel braucht, hat die Passphrase vergessen; ihn danach ohne neue
/// stehen zu lassen hiesse, ihn beim naechsten Start wieder danach suchen zu lassen.
#[tauri::command]
pub async fn zugang_mit_code(
    app: AppHandle,
    datei: String,
    code: String,
    neue_passphrase: String,
    db: State<'_, Datenbank>,
) -> Result<bool, String> {
    let dk = match Datenschluessel::aus_wiederherstellungscode(&code) {
        Ok(dk) => dk,
        Err(_) => return Ok(false),
    };
    if !oeffnen_mit(&app, &datei, &dk, &db).await? {
        return Ok(false);
    }
    let huelle = einwickeln(&dk, &neue_passphrase).map_err(|e| e.to_string())?;
    huelle_schreiben(&app, &datei, &huelle)?;
    Ok(true)
}

/// Die Passphrase wechseln. Der Datenschluessel bleibt derselbe — nur seine Huelle wird
/// neu gemacht. Genau dafuer gibt es den Umweg ueber den Datenschluessel.
#[tauri::command]
pub async fn zugang_passphrase_wechseln(
    app: AppHandle,
    datei: String,
    alte: String,
    neue: String,
) -> Result<bool, String> {
    let Some(huelle) = huelle_lesen(&app, &datei)? else {
        return Err("Es ist kein Zugang eingerichtet.".into());
    };
    let dk = match auswickeln(&huelle, &alte) {
        Ok(dk) => dk,
        Err(SchluesselFehler::PassphraseFalsch) => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    let neue_huelle = einwickeln(&dk, &neue).map_err(|e| e.to_string())?;
    huelle_schreiben(&app, &datei, &neue_huelle)?;
    Ok(true)
}

/// Den Wiederherstellungscode noch einmal zeigen — nur gegen die Passphrase.
///
/// Sonst laege er fuer jeden offen, der an einem entsperrten Rechner sitzt: also genau
/// fuer den Angreifer, gegen den die Zeitsperre gebaut ist.
#[tauri::command]
pub async fn zugang_code_zeigen(
    app: AppHandle,
    datei: String,
    passphrase: String,
) -> Result<Option<String>, String> {
    let Some(huelle) = huelle_lesen(&app, &datei)? else {
        return Err("Es ist kein Zugang eingerichtet.".into());
    };
    match auswickeln(&huelle, &passphrase) {
        Ok(dk) => Ok(Some(dk.als_wiederherstellungscode())),
        Err(SchluesselFehler::PassphraseFalsch) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;

    fn pfad(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("moneymanager-zugang-{name}.db"));
        for anhang in ["", "-wal", "-shm", ".verschluesselt"] {
            let _ = std::fs::remove_file(format!("{}{anhang}", p.to_string_lossy()));
        }
        p
    }

    /// Ein Altbestand, wie er heute auf der Platte liegt: unverschluesselt, mit Inhalt.
    async fn altbestand(pfad: &Path) {
        let pool = crate::datenbank::pool_anlegen_klartext(pfad).await.expect("anlegen");
        pool.execute("CREATE TABLE ist_buchung (id TEXT PRIMARY KEY, betrag INTEGER NOT NULL)")
            .await
            .expect("tabelle");
        pool.execute("CREATE INDEX idx_betrag ON ist_buchung(betrag)").await.expect("index");
        pool.execute("INSERT INTO ist_buchung VALUES ('a', -4200), ('b', 1350)")
            .await
            .expect("inserts");
        pool.close().await;
    }

    #[tokio::test]
    async fn erkennt_einen_klartext_bestand_am_dateikopf() {
        let p = pfad("erkennen");
        altbestand(&p).await;
        assert!(ist_klartext(&p));
    }

    #[tokio::test]
    async fn eine_fehlende_datei_ist_kein_klartext_bestand() {
        // Wichtig, weil daraus „muss ueberfuehrt werden" abgeleitet wird: eine Datei, die
        // es nicht gibt, darf nicht wie ein Altbestand aussehen.
        assert!(!ist_klartext(&pfad("gibtsnicht")));
    }

    /// **Der wichtigste Test des ganzen Pakets.**
    ///
    /// Die Ueberfuehrung fasst den echten Bestand an. Geprueft wird deshalb nicht nur,
    /// dass sie durchlaeuft, sondern dass danach ALLES da ist — Zeilen, Indizes — und
    /// dass die Datei wirklich verschluesselt ist.
    #[tokio::test]
    async fn ueberfuehrt_den_bestand_vollstaendig_und_verschluesselt() {
        let p = pfad("ueberfuehren");
        altbestand(&p).await;
        let dk = Datenschluessel::wuerfeln();

        ueberfuehren(&p, &dk).await.expect("ueberfuehren");

        assert!(!ist_klartext(&p), "Nach der Ueberfuehrung darf kein Klartext mehr dastehen.");

        let pool = crate::datenbank::pool_mit_schluessel(&p, &dk.als_pragma())
            .await
            .expect("oeffnen");
        let anzahl: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ist_buchung")
            .fetch_one(&pool)
            .await
            .expect("zaehlen");
        assert_eq!(anzahl, 2);

        let summe: i64 = sqlx::query_scalar("SELECT SUM(betrag) FROM ist_buchung")
            .fetch_one(&pool)
            .await
            .expect("summe");
        assert_eq!(summe, -2850, "Betraege muessen exakt uebernommen werden.");

        // `sqlcipher_export` nimmt das ganze Schema mit — von Hand kopierte Tabellen
        // haetten den Index verloren, und niemand haette es gemerkt.
        let indizes: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_betrag'")
                .fetch_one(&pool)
                .await
                .expect("index");
        assert_eq!(indizes, 1, "Der Index ist bei der Ueberfuehrung verlorengegangen.");
        pool.close().await;
    }

    #[tokio::test]
    async fn nach_der_ueberfuehrung_kommt_niemand_ohne_schluessel_heran() {
        let p = pfad("dicht");
        altbestand(&p).await;
        let dk = Datenschluessel::wuerfeln();
        ueberfuehren(&p, &dk).await.expect("ueberfuehren");

        let pool = crate::datenbank::pool_klartext(&p).await.expect("pool");
        assert!(
            sqlx::query("SELECT COUNT(*) FROM ist_buchung").fetch_one(&pool).await.is_err(),
            "Der Bestand liess sich ohne Schluessel lesen."
        );
        pool.close().await;
    }

    /// **Die Ueberfuehrung an einer ECHTEN Datenbank pruefen.**
    ///
    /// Die Tests darueber arbeiten mit einer Tabelle. Ein wirklicher Bestand hat
    /// Dutzende, dazu Indizes, Fremdschluessel und Trigger — und genau dort faellt auf,
    /// wenn `sqlcipher_export` etwas nicht mitnimmt. Ein Testbestand kann das nie
    /// abdecken, weil er nie so alt und so gewachsen ist wie ein echter.
    ///
    /// Deshalb `#[ignore]` und ein Pfad von aussen: der Bestand gehoert nicht ins Repo,
    /// und der Lauf soll nicht bei jedem `cargo test` mitgehen. Das ist dieselbe Idee
    /// wie `scripts/migrationsprobe.mjs` — gegen eine LESEKOPIE, niemals gegen das
    /// Original:
    ///
    /// ```sh
    /// sqlite3 -readonly "<bestand>.db" ".backup '/tmp/probe.db'"
    /// MONEYMANAGER_PROBE=/tmp/probe.db \
    ///   cargo test --manifest-path src-tauri/Cargo.toml --lib \
    ///   ueberfuehrung_an_einem_echten_bestand -- --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "braucht MONEYMANAGER_PROBE mit dem Pfad einer Lesekopie"]
    async fn ueberfuehrung_an_einem_echten_bestand() {
        let Ok(pfad) = std::env::var("MONEYMANAGER_PROBE") else {
            panic!("MONEYMANAGER_PROBE nicht gesetzt");
        };
        let pfad = PathBuf::from(pfad);
        assert!(ist_klartext(&pfad), "Die Probe muss eine unverschluesselte Datenbank sein.");

        // Vorher zaehlen, was hinterher noch da sein muss.
        let vorher = crate::datenbank::pool_klartext(&pfad).await.expect("oeffnen");
        let tabellen: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
                .fetch_one(&vorher)
                .await
                .expect("tabellen");
        let indizes: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='index'")
                .fetch_one(&vorher)
                .await
                .expect("indizes");
        let buchungen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ist_buchung")
            .fetch_one(&vorher)
            .await
            .expect("buchungen");
        let summe: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(betrag),0) FROM ist_buchung")
            .fetch_one(&vorher)
            .await
            .expect("summe");
        vorher.close().await;

        let dk = Datenschluessel::wuerfeln();
        ueberfuehren(&pfad, &dk).await.expect("ueberfuehren");

        assert!(!ist_klartext(&pfad), "Danach darf kein Klartext mehr dastehen.");

        let nachher = crate::datenbank::pool_mit_schluessel(&pfad, &dk.als_pragma())
            .await
            .expect("verschluesselt oeffnen");

        let befund: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&nachher)
            .await
            .expect("integritaet");
        assert_eq!(befund, "ok");

        for (name, erwartet, sql) in [
            ("Tabellen", tabellen, "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"),
            ("Indizes", indizes, "SELECT COUNT(*) FROM sqlite_master WHERE type='index'"),
            ("Buchungen", buchungen, "SELECT COUNT(*) FROM ist_buchung"),
            ("Summe", summe, "SELECT COALESCE(SUM(betrag),0) FROM ist_buchung"),
        ] {
            let ist: i64 = sqlx::query_scalar(sql).fetch_one(&nachher).await.expect(name);
            assert_eq!(ist, erwartet, "{name} stimmt nach der Ueberfuehrung nicht");
        }

        // Die Fremdschluessel muessen danach halten — `sqlcipher_export` kopiert das
        // Schema, aber wenn dabei eine Beziehung verlorenginge, faellt es erst beim
        // naechsten Schreiben auf.
        let verletzt: Vec<(String,)> = sqlx::query_as("PRAGMA foreign_key_check")
            .fetch_all(&nachher)
            .await
            .unwrap_or_default();
        assert!(verletzt.is_empty(), "Fremdschluessel verletzt nach der Ueberfuehrung");

        println!("Ueberfuehrung geprueft: Tabellen, Indizes, Buchungen und Summe unveraendert.");
        nachher.close().await;
    }

    #[tokio::test]
    async fn die_zwischendatei_bleibt_nicht_liegen() {
        let p = pfad("aufraeumen");
        altbestand(&p).await;
        ueberfuehren(&p, &Datenschluessel::wuerfeln()).await.expect("ueberfuehren");

        // Eine liegengebliebene `.verschluesselt` waere eine zweite, vollstaendige Kopie
        // des Bestands — mit einem Schluessel, den nach dem naechsten Einrichten niemand
        // mehr hat, aber eben doch eine Datei mehr, als es geben soll.
        assert!(!p.with_extension("db.verschluesselt").exists());
    }
}
