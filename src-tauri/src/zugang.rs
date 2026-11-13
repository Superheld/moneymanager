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
use sqlx::{AssertSqlSafe, Executor, Row};
use tauri::{AppHandle, Manager, State};

use crate::datenbank::{einfacher_dateiname, Datenbank, Oeffnung};
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

/// Die Datenbankdatei im Datenverzeichnis. **Jeder Pfad in diesem Modul entsteht hier
/// oder in `huellenpfad`** — beide pruefen den Namen, bevor sie ihn anhaengen. `datei`
/// kommt aus dem Webview; siehe `datenbank::einfacher_dateiname`.
fn bestandspfad(app: &AppHandle, datei: &str) -> Result<PathBuf, String> {
    Ok(datenverzeichnis(app)?.join(einfacher_dateiname(datei)?))
}

fn huellenpfad(app: &AppHandle, datei: &str) -> Result<PathBuf, String> {
    let datei = einfacher_dateiname(datei)?;
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
    huelle_ablegen(&vorlaeufig, &ziel, &text)
}

/// Schreiben, AUF DIE PLATTE ZWINGEN, dann umbenennen.
///
/// Ohne `sync_all` ist das Umbenennen nur halb atomar: der NAME wechselt sofort, der
/// INHALT kann noch im Zwischenspeicher des Systems stehen. Faellt in diesem Fenster der
/// Strom aus, heisst die Datei richtig und ist leer — und eine leere Huelle ist genau der
/// verlorene Bestand, den der Umweg ueber die vorlaeufige Datei verhindern soll.
fn huelle_ablegen(vorlaeufig: &Path, ziel: &Path, text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::File::create(vorlaeufig)
        .map_err(|e| format!("Huelle nicht schreibbar: {e}"))?;
    f.write_all(text.as_bytes()).map_err(|e| format!("Huelle nicht schreibbar: {e}"))?;
    f.sync_all().map_err(|e| format!("Huelle nicht gesichert: {e}"))?;
    drop(f);
    std::fs::rename(vorlaeufig, ziel).map_err(|e| format!("Huelle nicht ersetzbar: {e}"))
}

/// Ob eine Datei eine UNVERSCHLUESSELTE SQLite-Datenbank ist.
///
/// Am Dateikopf erkannt und nicht am Oeffnen: Oeffnen wuerde eine Datei anlegen, die es
/// nicht gab, und aus der Frage eine Tatsache machen.
///
/// **Gelesen werden genau die 16 Byte des Kopfs.** Vorher las die Funktion die ganze
/// Datei ein, um ihren Anfang zu vergleichen — bei jedem `zugang_stand`, also bei jedem
/// Start und jedem Neuladen, den gesamten Bestand in den Speicher.
fn ist_klartext(pfad: &Path) -> bool {
    use std::io::Read;
    const KOPF: &[u8; 16] = b"SQLite format 3\0";
    let Ok(mut f) = std::fs::File::open(pfad) else { return false };
    let mut anfang = [0u8; 16];
    f.read_exact(&mut anfang).is_ok() && &anfang == KOPF
}

#[tauri::command]
pub async fn zugang_stand(
    app: AppHandle,
    datei: String,
    db: State<'_, Datenbank>,
) -> Result<Stand, String> {
    let pfad = bestandspfad(&app, &datei)?;
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
    let pfad = bestandspfad(&app, &datei)?;

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
    let alt = crate::datenbank::pool_klartext(pfad).await.map_err(|e| e.to_string())?;
    exportieren(alt, pfad, dk).await
}

/// Den Inhalt von `quelle` unter dem Schluessel `dk` neu schreiben und an die Stelle von
/// `pfad` setzen. Der gemeinsame Kern von Ueberfuehrung (Klartext → verschluesselt) und
/// Schluesselwechsel (alter Schluessel → neuer).
///
/// `quelle` wird hier GESCHLOSSEN, in jedem Fall — der Pool gehoert ab dem Aufruf dieser
/// Funktion.
async fn exportieren(
    quelle: sqlx::SqlitePool,
    pfad: &Path,
    dk: &Datenschluessel,
) -> Result<(), String> {
    let neu = pfad.with_extension("db.verschluesselt");
    let _ = std::fs::remove_file(&neu);

    // **EINE Verbindung, festgehalten.** `ATTACH` gilt nur fuer die Verbindung, die es
    // ausfuehrt — ueber den Pool bekaeme `sqlcipher_export` eine andere und meldete
    // „unknown database". Dieselbe Falle wie bei `PRAGMA key` und `foreign_keys`; sie
    // taucht bei jedem Zustand auf, der an einer Verbindung haengt statt an der Datei.
    let mut conn = match quelle.acquire().await {
        Ok(c) => c,
        Err(e) => {
            quelle.close().await;
            return Err(e.to_string());
        }
    };

    // `sqlcipher_export` kopiert das ganze Schema samt Inhalt in die angehaengte
    // Datenbank — der von SQLCipher vorgesehene Weg. Von Hand Tabelle fuer Tabelle zu
    // kopieren hiesse, Indizes, Trigger und Fremdschluessel nachzubauen.
    let anhaengen = format!(
        "ATTACH DATABASE '{}' AS verschluesselt KEY {}",
        neu.to_string_lossy().replace('\'', "''"),
        dk.als_pragma()
    );
    let ergebnis = match sqlx::query(AssertSqlSafe(anhaengen)).execute(&mut *conn).await {
        Err(e) => Err(e),
        Ok(_) => {
            let export = sqlx::query("SELECT sqlcipher_export('verschluesselt')")
                .fetch_optional(&mut *conn)
                .await
                .map(|_| ());
            let _ = conn.execute("DETACH DATABASE verschluesselt").await;
            export
        }
    };
    drop(conn);
    // Das Schliessen ist nicht nur Aufraeumen: die letzte Verbindung schreibt das WAL in
    // die Hauptdatei zurueck und entfernt es. Erst danach ist die Quelle EINE Datei.
    quelle.close().await;
    if let Err(e) = ergebnis {
        let _ = std::fs::remove_file(&neu);
        return Err(format!("Neuschreiben fehlgeschlagen: {e}"));
    }

    if let Err(e) = pruefen(&neu, dk).await {
        let _ = std::fs::remove_file(&neu);
        return Err(e);
    }

    // WAL und SHM der ALTEN Datei muessen weg sein, BEVOR die neue ihren Platz einnimmt:
    // ein liegengebliebenes `-wal` gehoerte dem Namen nach zur neuen Datei, und SQLite
    // wuerde es beim naechsten Oeffnen auf einen Inhalt anwenden, zu dem es nicht passt.
    for anhang in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{anhang}", pfad.to_string_lossy()));
    }
    // Umbenennen UEBER die alte Datei, nicht loeschen und dann umbenennen: so gibt es
    // keinen Augenblick, in dem unter dem Namen des Bestands nichts liegt.
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
    let datei = einfacher_dateiname(datei)?;
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
    let dk = match auswickeln(&huelle, &passphrase) {
        Ok(dk) => dk,
        Err(SchluesselFehler::PassphraseFalsch) => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    let schwebend = wechselpfad(&app, &datei)?;
    if oeffnen_mit(&app, &datei, &dk, &db).await? {
        // Die Huelle passt zur Datei: ein angefangener Wechsel ist nie bis zur Datei
        // gekommen. Seine vorlaeufige Huelle ist damit gegenstandslos.
        let _ = std::fs::remove_file(&schwebend);
        return Ok(true);
    }

    // **Die Passphrase stimmt, die Datei geht trotzdem nicht auf.** Das ist der eine Fall,
    // den ein unterbrochener Schluesselwechsel hinterlaesst: die Datei traegt schon den
    // neuen Schluessel, die Huelle noch den alten. Die Huelle des neuen liegt dann
    // daneben (`huelle_schwebend`) — genau dafuer wird sie VOR dem Umschreiben abgelegt.
    let Some(neu) = schwebender_schluessel(&schwebend, &passphrase) else { return Ok(false) };
    if !oeffnen_mit(&app, &datei, &neu, &db).await? {
        return Ok(false);
    }
    wechsel_abschliessen(&schwebend, &huellenpfad(&app, &datei)?)?;
    Ok(true)
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

// ---------------------------------------------------------------------------------
// Den Datenschluessel wechseln
// ---------------------------------------------------------------------------------
//
// **Wozu.** Die Passphrase zu wechseln aendert nur die Huelle; der Datenschluessel bleibt,
// und der Wiederherstellungscode IST dieser Schluessel. Wer befuerchtet, dass der Zettel
// in fremde Haende geraten ist, hat mit einer neuen Passphrase nichts gewonnen. Dafuer
// gibt es diesen Weg: neuer Schluessel, neuer Code, der alte oeffnet danach nichts mehr.
//
// **Warum nicht `PRAGMA rekey`.** Es schreibt die Datei an Ort und Stelle um und haengt
// an EINER Verbindung; ob es im WAL-Modus traegt, haengt an der SQLCipher-Fassung. Der
// Weg ueber `sqlcipher_export` ist der, den die Ueberfuehrung des Altbestands schon geht
// und fuer den es Tests gibt: daneben schreiben, pruefen, dann tauschen. Der alte Bestand
// bleibt unberuehrt, bis der neue nachweislich heil ist. Der Preis ist Platz fuer eine
// zweite Kopie waehrend des Wechsels.
//
// **Die Reihenfolge ist wieder der ganze Inhalt:**
//
//   1. Die Huelle des NEUEN Schluessels neben die alte legen (`….wechsel`), auf die Platte
//      gezwungen. Ab hier ist der neue Schluessel nicht mehr nur im Speicher.
//   2. Den Bestand unter dem neuen Schluessel neu schreiben und tauschen.
//   3. Die neue Huelle an die Stelle der alten setzen.
//   4. Die Sicherungen ebenso umschreiben.
//
// Bricht es nach 1 ab, passt die alte Huelle noch und die vorlaeufige wird beim naechsten
// Entsperren weggeworfen. Bricht es nach 2 ab, passt nur die vorlaeufige — das Entsperren
// erkennt den Fall und setzt sie ein (`zugang_entsperren`). Es gibt keinen Zeitpunkt, an
// dem der Schluessel der Datei in keiner Huelle auf der Platte steht.
//
// **Die Sicherungen gehoeren dazu, und das ist nicht Kuer.** Sie sind mit dem Schluessel
// geschrieben, der beim Sichern galt. Blieben sie liegen, oeffnete der alte Code weiter
// jeden frueheren Stand — der Wechsel haette den Bestand von heute geschuetzt und alle
// von gestern offen gelassen. Wegwerfen kommt nicht in Frage (die Jahresstufe ist das
// Archiv), also werden sie umgeschrieben. Was sich mit dem alten Schluessel nicht oeffnen
// laesst, bleibt liegen und wird GEZAEHLT zurueckgemeldet statt verschwiegen.

/// Was ein Schluesselwechsel hinterlaesst.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Schluesselwechsel {
    /// Der NEUE Wiederherstellungscode. Der alte ist ab jetzt wertlos.
    pub wiederherstellungscode: String,
    /// Wie viele Sicherungen auf den neuen Schluessel umgeschrieben wurden.
    pub sicherungen_umgestellt: usize,
    /// Wie viele sich nicht umschreiben liessen und weiter am alten Schluessel haengen.
    pub sicherungen_uebrig: usize,
}

fn wechselpfad(app: &AppHandle, datei: &str) -> Result<PathBuf, String> {
    Ok(wechselpfad_zu(&huellenpfad(app, datei)?))
}

fn wechselpfad_zu(huelle: &Path) -> PathBuf {
    huelle.with_extension("json.wechsel")
}

/// Die vorlaeufige Huelle eines angefangenen Wechsels — oder `None`, wenn keine daliegt
/// oder sie nicht lesbar ist. Ein Fehler ist hier keine Meldung wert: ohne sie bleibt es
/// bei „Passphrase falsch", und das ist dann auch die richtige Auskunft.
fn huelle_schwebend(pfad: &Path) -> Option<Huelle> {
    serde_json::from_str(&std::fs::read_to_string(pfad).ok()?).ok()
}

/// Der Schluessel aus der vorlaeufigen Huelle eines unterbrochenen Wechsels — wenn eine
/// daliegt und die Passphrase zu ihr passt.
fn schwebender_schluessel(schwebend: &Path, passphrase: &str) -> Option<Datenschluessel> {
    auswickeln(&huelle_schwebend(schwebend)?, passphrase).ok()
}

/// Den unterbrochenen Wechsel zu Ende fuehren: die vorlaeufige Huelle wird die gueltige.
/// Erst aufrufen, NACHDEM ihr Schluessel die Datei nachweislich oeffnet.
fn wechsel_abschliessen(schwebend: &Path, huelle: &Path) -> Result<(), String> {
    std::fs::rename(schwebend, huelle).map_err(|e| format!("Huelle nicht ersetzbar: {e}"))
}

/// Eine verschluesselte Datei von `alt` auf `neu` umschreiben.
async fn umschluesseln(
    pfad: &Path,
    alt: &Datenschluessel,
    neu: &Datenschluessel,
) -> Result<(), String> {
    let quelle = crate::datenbank::pool_exportquelle(pfad, &alt.als_pragma())
        .await
        .map_err(|e| e.to_string())?;
    // Ein Pool entsteht auch mit falschem Schluessel — erst der Zugriff faellt um. Ohne
    // diese Probe kaeme der Fehler aus dem Export und saehe nach einer kaputten Datei aus.
    if sqlx::query("SELECT count(*) FROM sqlite_master").fetch_one(&quelle).await.is_err() {
        quelle.close().await;
        return Err("Die Datei laesst sich mit dem bisherigen Schluessel nicht oeffnen.".into());
    }
    exportieren(quelle, pfad, neu).await
}

/// Der Kern des Wechsels auf Dateiebene — ohne Pool der App, damit er pruefbar ist.
///
/// Erwartet, dass NIEMAND die Datei offen hat. Gibt den neuen Schluessel zurueck und die
/// Zaehlung der Sicherungen (umgestellt, uebrig).
async fn schluessel_wechseln_in(
    bestand: &Path,
    huelle: &Path,
    sicherungen: &Path,
    stamm: &str,
    alt: &Datenschluessel,
    passphrase: &str,
) -> Result<(Datenschluessel, usize, usize), String> {
    let neu = Datenschluessel::wuerfeln();
    let schwebend = wechselpfad_zu(huelle);

    // 1. Der neue Schluessel kommt auf die Platte, bevor irgendetwas ihn braucht.
    let neue_huelle = einwickeln(&neu, passphrase).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&neue_huelle).map_err(|e| e.to_string())?;
    huelle_ablegen(&schwebend.with_extension("wechsel.neu"), &schwebend, &text)?;

    // 2. Der Bestand. Scheitert es hier, ist nichts geschehen: die alte Datei steht noch.
    if let Err(e) = umschluesseln(bestand, alt, &neu).await {
        let _ = std::fs::remove_file(&schwebend);
        return Err(e);
    }

    // 3. Ab jetzt gilt der neue Schluessel.
    std::fs::rename(&schwebend, huelle).map_err(|e| format!("Huelle nicht ersetzbar: {e}"))?;

    // 4. Die Sicherungen. Eine einzelne, die nicht will, haelt die anderen nicht auf.
    let (mut umgestellt, mut uebrig) = (0, 0);
    if let Ok(eintraege) = std::fs::read_dir(sicherungen) {
        for eintrag in eintraege.flatten() {
            let name = eintrag.file_name().to_string_lossy().to_string();
            if !(name.starts_with(&format!("{stamm}-")) && name.ends_with(".db")) {
                continue;
            }
            match umschluesseln(&eintrag.path(), alt, &neu).await {
                Ok(()) => umgestellt += 1,
                Err(_) => uebrig += 1,
            }
        }
    }
    Ok((neu, umgestellt, uebrig))
}

/// Den Datenschluessel wechseln — nur gegen die Passphrase. `None` heisst: sie war falsch.
///
/// Die Datenbank ist waehrenddessen ZU: der Pool wird geschlossen, bevor umgeschrieben
/// wird, und danach mit dem neuen Schluessel wieder geoeffnet. Ein Schreibvorgang, der in
/// die alte Datei ginge, waehrend die neue entsteht, waere nach dem Tausch verloren.
#[tauri::command]
pub async fn zugang_schluessel_wechseln(
    app: AppHandle,
    datei: String,
    passphrase: String,
    db: State<'_, Datenbank>,
) -> Result<Option<Schluesselwechsel>, String> {
    let Some(huelle) = huelle_lesen(&app, &datei)? else {
        return Err("Es ist kein Zugang eingerichtet.".into());
    };
    let alt = match auswickeln(&huelle, &passphrase) {
        Ok(dk) => dk,
        Err(SchluesselFehler::PassphraseFalsch) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let bestand = bestandspfad(&app, &datei)?;
    let huellendatei = huellenpfad(&app, &datei)?;
    let sicherungen = datenverzeichnis(&app)?.join("sicherungen");
    let stamm = datei.strip_suffix(".db").unwrap_or(&datei).to_string();

    db.schliessen().await;

    let ergebnis =
        schluessel_wechseln_in(&bestand, &huellendatei, &sicherungen, &stamm, &alt, &passphrase)
            .await;

    // Was auch geschehen ist: die App soll danach wieder offen sein — mit dem Schluessel,
    // der jetzt gilt. Nach einem Fehlschlag ist das der alte.
    let gueltig = match &ergebnis {
        Ok((neu, _, _)) => neu,
        Err(_) => &alt,
    };
    let offen = oeffnen_mit(&app, &datei, gueltig, &db).await?;

    let (neu, umgestellt, uebrig) = ergebnis?;
    if !offen {
        return Err("Der Bestand liess sich nach dem Wechsel nicht oeffnen.".into());
    }
    Ok(Some(Schluesselwechsel {
        wiederherstellungscode: neu.als_wiederherstellungscode(),
        sicherungen_umgestellt: umgestellt,
        sicherungen_uebrig: uebrig,
    }))
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

    #[test]
    fn eine_zu_kurze_oder_fremde_datei_ist_kein_klartext_bestand() {
        let kurz = pfad("kurz");
        std::fs::write(&kurz, b"SQLite").unwrap();
        assert!(!ist_klartext(&kurz), "Sechs Byte sind kein Dateikopf.");

        let fremd = pfad("fremd");
        std::fs::write(&fremd, b"Das ist ganz sicher keine Datenbank, nur Text.").unwrap();
        assert!(!ist_klartext(&fremd));
    }

    #[test]
    fn die_huelle_liegt_vollstaendig_da_und_die_vorlaeufige_ist_weg() {
        let ziel = std::env::temp_dir().join("moneymanager-zugang-huelle.schluessel.json");
        let vorlaeufig = ziel.with_extension("json.neu");
        let _ = std::fs::remove_file(&ziel);

        huelle_ablegen(&vorlaeufig, &ziel, "{\"erste\":1}").expect("erste");
        huelle_ablegen(&vorlaeufig, &ziel, "{\"zweite\":2}").expect("zweite");

        assert_eq!(std::fs::read_to_string(&ziel).unwrap(), "{\"zweite\":2}");
        assert!(!vorlaeufig.exists(), "Die vorlaeufige Datei ist liegengeblieben.");
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

    /// **Die Ueberfuehrung an einer GEWACHSENEN Datenbank pruefen.**
    ///
    /// Die Tests darueber arbeiten mit einer Tabelle. Ein vollstaendiger Bestand hat
    /// Dutzende, dazu Indizes und Fremdschluessel — und genau dort faellt auf, wenn
    /// `sqlcipher_export` etwas nicht mitnimmt.
    ///
    /// Deshalb `#[ignore]` und ein Pfad von aussen. **Gemeint ist eine unverschluesselte
    /// Kopie des SPIELSTANDS** (`npm run seed` schreibt ihn vollstaendig migriert), nicht
    /// der echte Bestand: echte Daten kommen in der Entwicklung nicht vor, auch nicht als
    /// Probe (Wurzel-`CLAUDE.md`, „Eine Aenderung machen"). Bis 2026-11-10 stand hier ein
    /// Rezept mit einer Lesekopie des echten Bestands — aelter als die Regel und seit der
    /// Verschluesselung ohnehin nicht mehr ausfuehrbar.
    ///
    /// ```sh
    /// MONEYMANAGER_PROBE=<kopie-des-spielstands.db> \
    ///   cargo test --manifest-path src-tauri/Cargo.toml --lib \
    ///   ueberfuehrung_an_einem_gewachsenen_bestand -- --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "braucht MONEYMANAGER_PROBE mit dem Pfad einer Klartext-Kopie des Spielstands"]
    async fn ueberfuehrung_an_einem_gewachsenen_bestand() {
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
        // Ausgegeben, damit sich die ueberfuehrte Probe danach auch von aussen oeffnen
        // laesst — etwa um das Werkzeug `bestandslesen` daran zu pruefen. Es ist eine
        // Kopie und ein gewuerfelter Schluessel; beides ist nach dem Lauf wertlos.
        println!("PROBE-CODE {}", dk.als_wiederherstellungscode());
        nachher.close().await;
    }

    /// Ein verschluesselter Bestand mit Inhalt, wie er nach dem Einrichten daliegt.
    async fn verschluesselt(pfad: &Path, dk: &Datenschluessel) {
        altbestand(pfad).await;
        ueberfuehren(pfad, dk).await.expect("ueberfuehren");
    }

    async fn summe(pfad: &Path, dk: &Datenschluessel) -> Result<i64, sqlx::Error> {
        let pool = crate::datenbank::pool_mit_schluessel(pfad, &dk.als_pragma()).await?;
        let s = sqlx::query_scalar("SELECT SUM(betrag) FROM ist_buchung").fetch_one(&pool).await;
        pool.close().await;
        s
    }

    fn wechselordner(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("moneymanager-wechsel-{name}"));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(p.join("sicherungen")).unwrap();
        p
    }

    #[tokio::test]
    async fn nach_dem_umschluesseln_oeffnet_nur_noch_der_neue_schluessel() {
        let p = pfad("umschluesseln");
        let (alt, neu) = (Datenschluessel::wuerfeln(), Datenschluessel::wuerfeln());
        verschluesselt(&p, &alt).await;

        umschluesseln(&p, &alt, &neu).await.expect("umschluesseln");

        assert_eq!(summe(&p, &neu).await.expect("neu"), -2850, "Der Inhalt hat sich veraendert.");
        assert!(summe(&p, &alt).await.is_err(), "Der alte Schluessel oeffnet noch.");
        assert!(!p.with_extension("db.verschluesselt").exists());
    }

    #[tokio::test]
    async fn mit_falschem_schluessel_bleibt_die_datei_wie_sie_war() {
        let p = pfad("umschluesseln-falsch");
        let echt = Datenschluessel::wuerfeln();
        verschluesselt(&p, &echt).await;

        let falsch = Datenschluessel::wuerfeln();
        assert!(umschluesseln(&p, &falsch, &Datenschluessel::wuerfeln()).await.is_err());

        assert_eq!(summe(&p, &echt).await.expect("unveraendert"), -2850);
        assert!(!p.with_extension("db.verschluesselt").exists());
    }

    /// Der ganze Wechsel auf Dateiebene: Bestand, Huelle, Sicherungen.
    #[tokio::test]
    async fn der_wechsel_stellt_bestand_huelle_und_sicherungen_um() {
        let ordner = wechselordner("ganz");
        let bestand = ordner.join("probe.db");
        let huelle = ordner.join("probe.db.schluessel.json");
        let sicherungen = ordner.join("sicherungen");
        let alt = Datenschluessel::wuerfeln();
        verschluesselt(&bestand, &alt).await;
        verschluesselt(&sicherungen.join("probe-2026-01-01.db"), &alt).await;
        // Eine Sicherung aus einer Zeit mit ANDEREM Schluessel — sie darf den Wechsel
        // nicht aufhalten und nicht verschwinden.
        let fremd = Datenschluessel::wuerfeln();
        verschluesselt(&sicherungen.join("probe-2025-01-01.db"), &fremd).await;
        // Und eine Datei, die uns nichts angeht.
        verschluesselt(&sicherungen.join("andere-2026-01-01.db"), &alt).await;

        let (neu, umgestellt, uebrig) =
            schluessel_wechseln_in(&bestand, &huelle, &sicherungen, "probe", &alt, "ein Kennwort")
                .await
                .expect("wechsel");

        assert_eq!((umgestellt, uebrig), (1, 1));
        assert_eq!(summe(&bestand, &neu).await.expect("bestand"), -2850);
        assert!(summe(&bestand, &alt).await.is_err());
        assert_eq!(summe(&sicherungen.join("probe-2026-01-01.db"), &neu).await.expect("sicherung"), -2850);
        assert!(summe(&sicherungen.join("probe-2026-01-01.db"), &alt).await.is_err());
        assert_eq!(summe(&sicherungen.join("probe-2025-01-01.db"), &fremd).await.expect("fremd"), -2850);
        assert_eq!(summe(&sicherungen.join("andere-2026-01-01.db"), &alt).await.expect("andere"), -2850);

        // Die Huelle traegt den neuen Schluessel, die vorlaeufige ist weg.
        let h: Huelle = serde_json::from_str(&std::fs::read_to_string(&huelle).unwrap()).unwrap();
        let aus_huelle = auswickeln(&h, "ein Kennwort").expect("auswickeln");
        assert_eq!(aus_huelle.als_pragma(), neu.als_pragma());
        assert!(!wechselpfad_zu(&huelle).exists());
    }

    /// Scheitert das Umschreiben, darf nichts vom neuen Schluessel zurueckbleiben.
    #[tokio::test]
    async fn ein_gescheiterter_wechsel_hinterlaesst_keine_vorlaeufige_huelle() {
        let ordner = wechselordner("gescheitert");
        let bestand = ordner.join("probe.db");
        let huelle = ordner.join("probe.db.schluessel.json");
        let echt = Datenschluessel::wuerfeln();
        verschluesselt(&bestand, &echt).await;

        let falsch = Datenschluessel::wuerfeln();
        let ergebnis = schluessel_wechseln_in(
            &bestand, &huelle, &ordner.join("sicherungen"), "probe", &falsch, "ein Kennwort",
        )
        .await;

        assert!(ergebnis.is_err());
        assert!(!wechselpfad_zu(&huelle).exists());
        assert!(!huelle.exists(), "Eine Huelle ist entstanden, obwohl nichts gewechselt wurde.");
        assert_eq!(summe(&bestand, &echt).await.expect("unveraendert"), -2850);
    }

    /// Schreibt eine Huelle fuer `dk` an `pfad` — wie das Einrichten es tut.
    fn huelle_fuer(pfad: &Path, dk: &Datenschluessel, passphrase: &str) {
        let h = einwickeln(dk, passphrase).expect("einwickeln");
        let text = serde_json::to_string_pretty(&h).unwrap();
        huelle_ablegen(&pfad.with_extension("tmp"), pfad, &text).expect("ablegen");
    }

    /// **Der Absturz zwischen Umschreiben und Huellentausch** — der eine Zustand, in dem
    /// die gueltige Huelle den Bestand nicht mehr oeffnet. Nachgestellt, indem der Wechsel
    /// genau bis dorthin gefahren wird; danach die Schritte, die `zugang_entsperren` geht.
    #[tokio::test]
    async fn ein_unterbrochener_wechsel_laesst_sich_beim_entsperren_zu_ende_fuehren() {
        let ordner = wechselordner("unterbrochen");
        let bestand = ordner.join("probe.db");
        let huelle = ordner.join("probe.db.schluessel.json");
        let schwebend = wechselpfad_zu(&huelle);
        let (alt, neu) = (Datenschluessel::wuerfeln(), Datenschluessel::wuerfeln());
        verschluesselt(&bestand, &alt).await;
        huelle_fuer(&huelle, &alt, "ein Kennwort");

        // Schritt 1 und 2 des Wechsels — und dann faellt der Strom aus.
        huelle_fuer(&schwebend, &neu, "ein Kennwort");
        umschluesseln(&bestand, &alt, &neu).await.expect("umschluesseln");

        // Was das Entsperren vorfindet: die Passphrase stimmt, die Datei geht nicht auf.
        let h: Huelle = serde_json::from_str(&std::fs::read_to_string(&huelle).unwrap()).unwrap();
        let aus_alter = auswickeln(&h, "ein Kennwort").expect("die Passphrase stimmt ja");
        assert!(summe(&bestand, &aus_alter).await.is_err(), "Der Zustand ist nicht der gemeinte.");

        // Der Rettungsweg.
        assert!(schwebender_schluessel(&schwebend, "falsch geraten").is_none());
        let gerettet = schwebender_schluessel(&schwebend, "ein Kennwort").expect("vorlaeufige Huelle");
        assert_eq!(summe(&bestand, &gerettet).await.expect("oeffnet"), -2850);
        wechsel_abschliessen(&schwebend, &huelle).expect("abschliessen");

        // Danach ist alles, wie nach einem gelungenen Wechsel.
        let h: Huelle = serde_json::from_str(&std::fs::read_to_string(&huelle).unwrap()).unwrap();
        let dk = auswickeln(&h, "ein Kennwort").expect("auswickeln");
        assert_eq!(summe(&bestand, &dk).await.expect("bestand"), -2850);
        assert!(!schwebend.exists());
    }

    /// Der Absturz VOR dem Umschreiben: die vorlaeufige Huelle liegt da, die Datei traegt
    /// noch den alten Schluessel. Die gueltige Huelle muss weiter oeffnen.
    #[tokio::test]
    async fn eine_vorlaeufige_huelle_ohne_umgeschriebene_datei_stoert_nicht() {
        let ordner = wechselordner("nur-huelle");
        let bestand = ordner.join("probe.db");
        let huelle = ordner.join("probe.db.schluessel.json");
        let (alt, neu) = (Datenschluessel::wuerfeln(), Datenschluessel::wuerfeln());
        verschluesselt(&bestand, &alt).await;
        huelle_fuer(&huelle, &alt, "ein Kennwort");
        huelle_fuer(&wechselpfad_zu(&huelle), &neu, "ein Kennwort");

        let h: Huelle = serde_json::from_str(&std::fs::read_to_string(&huelle).unwrap()).unwrap();
        let dk = auswickeln(&h, "ein Kennwort").expect("auswickeln");
        assert_eq!(summe(&bestand, &dk).await.expect("der alte Schluessel gilt weiter"), -2850);
        // Und der vorlaeufige Schluessel oeffnet NICHTS — er darf nie eingesetzt werden.
        assert!(summe(&bestand, &neu).await.is_err());
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
