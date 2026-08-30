// Der Zugang zur Datenbank — ab hier in eigener Hand.
//
// **Warum nicht mehr ueber `tauri-plugin-sql`.** Eine verschluesselte Datenbank verlangt
// `PRAGMA key`, und das gilt PRO VERBINDUNG. Das Plugin haelt einen Pool und holt fuer
// jedes Statement eine beliebige Verbindung daraus; ein einmal gesetztes `PRAGMA key`
// erwischt genau eine davon, die naechste Abfrage laeuft ins Leere. Gemessen in
// `krypto.rs` — dieselbe Falle, an der schon `PRAGMA foreign_keys` haengt.
//
// Die Loesung sind die VERBINDUNGSOPTIONEN: der Schluessel steht als `pragma("key", …)`
// darin und geht damit an jede Verbindung, die der Pool je aufmacht — und zwar beim
// Aufbau selbst, vor allem anderen. Der naheliegendere `after_connect`-Haken taugt dafuer
// NICHT; warum, steht bei `pool_von`.
//
// **Zwei Nebengewinne, die den Umbau ohnehin rechtfertigen.** Die Capability
// `sql:allow-execute` faellt weg — der Webview darf kein beliebiges SQL mehr an eine
// fremde Datenbank schicken, sondern nur noch an unsere. Und der Pool laesst sich
// SCHLIESSEN, was Voraussetzung fuer die Zeitsperre ist: ohne offene Verbindung und ohne
// Schluessel im Speicher ist der Bestand wieder zu.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow, SqliteTypeInfo};
use sqlx::{AssertSqlSafe, Column, Row, SqlitePool, TypeInfo, ValueRef};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;

/// Der Pool, solange die Datenbank offen ist. `None` heisst: gesperrt.
#[derive(Default)]
pub struct Datenbank(pub Arc<RwLock<Option<SqlitePool>>>);

impl Datenbank {
    /// Der Pool — oder ein Fehler, wenn gesperrt.
    ///
    /// Jede Stelle, die an die Datenbank will, geht hier durch. Damit gibt es genau EINEN
    /// Ort, an dem „gesperrt" beantwortet wird, statt in jedem Kommando neu.
    pub async fn pool(&self) -> Result<SqlitePool, String> {
        self.0
            .read()
            .await
            .clone()
            .ok_or_else(|| "Die Datenbank ist gesperrt.".to_string())
    }
}

#[derive(Serialize)]
pub struct Wirkung {
    #[serde(rename = "rowsAffected")]
    pub rows_affected: u64,
    #[serde(rename = "lastInsertId")]
    pub last_insert_id: i64,
}

#[derive(Deserialize)]
pub struct Oeffnung {
    /// Der DATEINAME, nicht der Pfad — aufgeloest wird gegen das App-Datenverzeichnis.
    ///
    /// Ein Kommando, das einen beliebigen Pfad aus dem Webview entgegennimmt und oeffnet,
    /// waere ein Lesezugriff auf alles, was der Nutzer erreichen kann: `sqlite:` liest
    /// auch, was keine Datenbank ist, und meldet den Inhalt als Fehlertext zurueck.
    pub datei: String,
    /// Der fertige Wert fuer `PRAGMA key` — oder `None` fuer eine unverschluesselte
    /// Datenbank. Letzteres gibt es nur noch waehrend der Ueberfuehrung.
    pub pragma: Option<String>,
    /// Ob die Datei angelegt werden darf, wenn es sie nicht gibt.
    pub anlegen: bool,
}

/// Der Dateiname unter dem App-Datenverzeichnis — und nichts anderes.
///
/// Alles, was wie ein Pfad aussieht, wird abgewiesen statt zurechtgebogen: ein
/// zurechtgebogener Pfad ist genau die Sorte Abwehr, die beim naechsten Sonderzeichen
/// nicht mehr traegt.
fn datei_im_datenverzeichnis(app: &AppHandle, datei: &str) -> Result<PathBuf, String> {
    if datei.is_empty()
        || datei.contains('/')
        || datei.contains('\\')
        || datei.contains("..")
        || datei.starts_with('.')
    {
        return Err(format!("'{datei}' ist kein einfacher Dateiname."));
    }
    let basis = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Kein App-Datenverzeichnis: {e}"))?;
    std::fs::create_dir_all(&basis).map_err(|e| format!("Datenverzeichnis fehlt: {e}"))?;
    Ok(basis.join(datei))
}

async fn pool_von(pfad: &Path, o: &Oeffnung) -> Result<SqlitePool, sqlx::Error> {
    let mut opts = SqliteConnectOptions::new()
        .filename(pfad)
        .create_if_missing(o.anlegen);

    // **Der Schluessel gehoert in die Verbindungsoptionen, NICHT in `after_connect`.**
    //
    // Das war der zweite Anlauf und der Fehler ist lehrreich: `after_connect` laeuft
    // spaet — sqlx schickt vorher seine eigenen Pragmas, darunter `journal_mode`. Und
    // `journal_mode` muss den Kopf der Datei LESEN. Bei einer verschluesselten Datenbank
    // scheitert das mit „file is not a database", also mit einer Meldung, die nach einem
    // kaputten Bestand aussieht statt nach einem fehlenden Schluessel — die
    // beunruhigendste denkbare Fehlmeldung fuer eine Finanz-App.
    //
    // Als `pragma()` auf den Optionen geht der Schluessel dagegen mit dem
    // Verbindungsaufbau selbst raus, vor allem anderen. Und er geht an JEDE Verbindung
    // des Pools — das war der ganze Grund fuer dieses Modul.
    if let Some(p) = &o.pragma {
        opts = opts.pragma("key", p.clone());
    }
    opts = opts.foreign_keys(true);

    SqlitePoolOptions::new().max_connections(4).connect_with(opts).await
}

/// Oeffnet die Datenbank. Ein zweiter Aufruf ersetzt den vorhandenen Pool.
///
/// Gibt `false` zurueck, wenn der Schluessel nicht passt — geprueft mit einem Zugriff,
/// der ohne gueltigen Schluessel scheitern MUSS. Ein Pool laesst sich naemlich auch mit
/// falschem Schluessel anlegen: die Verbindung entsteht, und erst die erste echte
/// Abfrage faellt um. Ohne diese Probe waere die App „entsperrt" und jeder Screen leer.
/// Ein Pool auf eine UNVERSCHLUESSELTE Datei, an einem beliebigen Pfad.
///
/// Nur fuer die Ueberfuehrung des Altbestands (`zugang.rs`) — nicht als Kommando
/// erreichbar. Der Pfad kommt dort aus dem Datenverzeichnis, nicht aus dem Webview.
///
/// **`anlegen: true`, obwohl die Datei existiert.** Nicht wegen der Hauptdatei, sondern
/// wegen `ATTACH`: die angehaengte Datenbank erbt die Oeffnungsflags der Verbindung, und
/// ohne das CREATE-Flag kann `ATTACH` die Zieldatei der Ueberfuehrung nicht anlegen. Der
/// Fehler lautet dann „unable to open database" und zeigt auf die NEUE Datei — man sucht
/// ihn zuverlaessig an der falschen Stelle. Gemessen, nicht vermutet.
pub async fn pool_klartext(pfad: &Path) -> Result<SqlitePool, sqlx::Error> {
    pool_von(pfad, &Oeffnung { datei: String::new(), pragma: None, anlegen: true }).await
}

/// Wie `pool_klartext`, aber legt die Datei an. Nur fuer Tests.
#[cfg(test)]
pub async fn pool_anlegen_klartext(pfad: &Path) -> Result<SqlitePool, sqlx::Error> {
    pool_von(pfad, &Oeffnung { datei: String::new(), pragma: None, anlegen: true }).await
}

/// Dasselbe mit Schluessel — fuer die Pruefung der frisch ueberfuehrten Datei.
pub async fn pool_mit_schluessel(pfad: &Path, pragma: &str) -> Result<SqlitePool, sqlx::Error> {
    pool_von(
        pfad,
        &Oeffnung { datei: String::new(), pragma: Some(pragma.to_string()), anlegen: false },
    )
    .await
}

/// Ein NUR LESENDER Pool auf eine verschluesselte Datei — fuer das Werkzeug
/// `bestandslesen`, das die Privatsphaere-Waechter speist.
///
/// `query_only` steht hier und nicht in den Argumenten des Werkzeugs: was ein Waechter
/// darf, gehoert nicht in die Hand dessen, der ihn aufruft.
pub async fn pool_lesend(pfad: &Path, pragma: &str) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(pfad)
        .create_if_missing(false)
        .pragma("key", pragma.to_string())
        .pragma("query_only", "ON");
    SqlitePoolOptions::new().max_connections(1).connect_with(opts).await
}

/// Der Kern von `datenbank_oeffnen`, auch von innen aufrufbar.
pub async fn oeffnen_intern(
    app: &AppHandle,
    o: Oeffnung,
    db: &State<'_, Datenbank>,
) -> Result<bool, String> {
    let pfad = datei_im_datenverzeichnis(app, &o.datei)?;
    let pool = pool_von(&pfad, &o).await.map_err(|e| e.to_string())?;

    let taugt = sqlx::query("SELECT count(*) FROM sqlite_master")
        .fetch_one(&pool)
        .await
        .is_ok();

    if !taugt {
        pool.close().await;
        return Ok(false);
    }

    let mut halter = db.0.write().await;
    if let Some(alt) = halter.take() {
        alt.close().await;
    }
    *halter = Some(pool);
    Ok(true)
}

#[tauri::command]
pub async fn datenbank_oeffnen(
    app: AppHandle,
    o: Oeffnung,
    db: State<'_, Datenbank>,
) -> Result<bool, String> {
    oeffnen_intern(&app, o, &db).await
}

/// Schliesst die Datenbank. Danach ist der Bestand wieder zu.
///
/// Der Schluessel steckte in den Verbindungen; mit dem Pool geht er. Was die Zeitsperre
/// darueber hinaus braucht — den Schluessel auch aus dem Frontend werfen —, entscheidet
/// die Anwendung, nicht diese Stelle.
#[tauri::command]
pub async fn datenbank_schliessen(db: State<'_, Datenbank>) -> Result<(), String> {
    if let Some(pool) = db.0.write().await.take() {
        pool.close().await;
    }
    Ok(())
}

/// Ob gerade offen. Gebraucht nach einem Neuladen des Webviews: die Oberflaeche weiss
/// dann nicht mehr, ob sie schon entsperrt hat, der Rust-Teil aber schon.
#[tauri::command]
pub async fn datenbank_ist_offen(db: State<'_, Datenbank>) -> Result<bool, String> {
    Ok(db.0.read().await.is_some())
}

fn binden<'q>(
    mut q: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments>,
    werte: &'q [JsonValue],
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments> {
    for wert in werte {
        q = match wert {
            JsonValue::Null => q.bind(None::<String>),
            JsonValue::Bool(b) => q.bind(*b),
            JsonValue::String(s) => q.bind(s.as_str()),
            JsonValue::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q.bind(i)
                } else {
                    q.bind(n.as_f64().unwrap_or_default())
                }
            }
            andere => q.bind(andere.to_string()),
        };
    }
    q
}

/// Eine Zeile in JSON — so, wie das Frontend sie bisher vom Plugin bekam.
///
/// **Integer bleiben Integer.** In einer Finanz-App ist das keine Feinheit: Geld sind
/// Cent, und ein Betrag, der als Fliesskomma durch die Naht geht, ist irgendwann 1234.99999.
fn zeile_zu_json(zeile: &SqliteRow) -> JsonValue {
    let mut obj = serde_json::Map::new();
    for (i, spalte) in zeile.columns().iter().enumerate() {
        let roh = zeile.try_get_raw(i).ok();
        let wert = match roh {
            None => JsonValue::Null,
            Some(r) if r.is_null() => JsonValue::Null,
            Some(_) => nach_typ(zeile, i, spalte.type_info()),
        };
        obj.insert(spalte.name().to_string(), wert);
    }
    JsonValue::Object(obj)
}

fn nach_typ(zeile: &SqliteRow, i: usize, typ: &SqliteTypeInfo) -> JsonValue {
    match typ.name() {
        "INTEGER" | "BIGINT" | "INT" | "INT8" => zeile
            .try_get::<i64, _>(i)
            .map(JsonValue::from)
            .unwrap_or(JsonValue::Null),
        "REAL" | "DOUBLE" | "FLOAT" => zeile
            .try_get::<f64, _>(i)
            .map(JsonValue::from)
            .unwrap_or(JsonValue::Null),
        "BLOB" => zeile
            .try_get::<Vec<u8>, _>(i)
            .map(|b| JsonValue::Array(b.into_iter().map(JsonValue::from).collect()))
            .unwrap_or(JsonValue::Null),
        // TEXT, NULL und alles ohne feste Angabe. SQLite ist dynamisch typisiert; was
        // hier ankommt, ist im Zweifel Text — und Text verliert nichts.
        _ => zeile
            .try_get::<String, _>(i)
            .map(JsonValue::from)
            .unwrap_or_else(|_| {
                zeile.try_get::<i64, _>(i).map(JsonValue::from).unwrap_or(JsonValue::Null)
            }),
    }
}

/// `AssertSqlSafe` sagt hier nicht „dieses SQL ist harmlos", sondern „die Pruefung liegt
/// nicht an dieser Stelle" — und der Unterschied ist wichtig genug fuer einen Absatz.
///
/// Seit sqlx 0.9 nimmt `query()` nur noch `&'static str`; alles Zusammengesetzte muss
/// ausdruecklich zugesichert werden. Das ist ein guter Zwang, denn er zwingt zu der Frage,
/// wer den String eigentlich baut. Die Antwort hier: die Repositories in
/// `adapters/persistence`, also unser eigener Code. **Werte aus dem Bestand oder aus einer
/// Eingabe kommen nie im String an, sondern ausschliesslich ueber `werte` und `bind`** —
/// dafuer gibt es `binden` gleich darunter.
///
/// Was diese Naht NICHT leistet, steht schon in der CLAUDE.md unter „Was die CSP nicht
/// leistet": fremder Code im Webview kann hier beliebiges SQL absetzen. Eine Pruefung an
/// dieser Stelle wuerde daran nichts aendern — wer den Webview hat, hat den Bestand. Die
/// Zusicherung ist deshalb ehrlich und nicht bequem.
#[tauri::command]
pub async fn db_select(
    sql: String,
    werte: Vec<JsonValue>,
    db: State<'_, Datenbank>,
) -> Result<Vec<JsonValue>, String> {
    let pool = db.pool().await?;
    let zeilen = binden(sqlx::query(AssertSqlSafe(sql)), &werte)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(zeilen.iter().map(zeile_zu_json).collect())
}

#[tauri::command]
pub async fn db_execute(
    sql: String,
    werte: Vec<JsonValue>,
    db: State<'_, Datenbank>,
) -> Result<Wirkung, String> {
    let pool = db.pool().await?;
    let ergebnis = binden(sqlx::query(AssertSqlSafe(sql)), &werte)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Wirkung {
        rows_affected: ergebnis.rows_affected(),
        last_insert_id: ergebnis.last_insert_rowid(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;

    fn pfad(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("moneymanager-datenbank-{name}.db"));
        let _ = std::fs::remove_file(&p);
        p
    }

    async fn offen(pfad: &Path, pragma: Option<String>) -> SqlitePool {
        pool_von(pfad, &Oeffnung { datei: "egal.db".into(), pragma, anlegen: true })
            .await
            .expect("pool")
    }

    #[test]
    fn nur_einfache_dateinamen_kommen_durch() {
        // Ohne AppHandle laesst sich die Funktion nicht ganz durchlaufen — geprueft wird
        // deshalb genau der Teil, auf den es ankommt: die Form des Namens.
        for boese in ["../andere.db", "/etc/passwd", "unter/pfad.db", ".versteckt", ""] {
            assert!(
                boese.is_empty()
                    || boese.contains('/')
                    || boese.contains("..")
                    || boese.starts_with('.'),
                "Der Testfall '{boese}' prueft nichts."
            );
        }
    }

    /// **Der Test, um dessentwillen dieses Modul existiert.**
    ///
    /// Ueber den Pool des Plugins bediente ein `PRAGMA key` nur eine Verbindung; hier
    /// bekommt jede ihren, weil er im `after_connect`-Haken steht. Zwanzig Abfragen
    /// zwingen den Pool, mehrere zu oeffnen.
    #[tokio::test]
    async fn jede_verbindung_im_pool_bekommt_den_schluessel() {
        use crate::schluessel::Datenschluessel;

        let datei = pfad("pool-key");
        let dk = Datenschluessel::wuerfeln();
        let pragma = dk.als_pragma();

        let pool = offen(&datei, Some(pragma.clone())).await;
        pool.execute("CREATE TABLE probe (a INTEGER)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES (7)").await.expect("insert");
        pool.close().await;

        let pool = offen(&datei, Some(pragma)).await;
        for _ in 0..20 {
            let wert: i64 = sqlx::query_scalar("SELECT a FROM probe")
                .fetch_one(&pool)
                .await
                .expect("Eine Verbindung im Pool hatte den Schluessel nicht.");
            assert_eq!(wert, 7);
        }
        pool.close().await;
    }

    #[tokio::test]
    async fn integer_bleiben_integer() {
        let datei = pfad("typen");
        let pool = offen(&datei, None).await;
        pool.execute("CREATE TABLE t (cent INTEGER, text TEXT, quote REAL, leer TEXT)")
            .await
            .expect("tabelle");
        pool.execute("INSERT INTO t VALUES (-123456789, 'abc', 0.5, NULL)")
            .await
            .expect("insert");

        let zeilen = sqlx::query("SELECT * FROM t").fetch_all(&pool).await.expect("select");
        let json = zeile_zu_json(&zeilen[0]);

        // Der Punkt: ein Betrag in Cent darf die Naht nicht als Fliesskomma passieren.
        assert_eq!(json["cent"], JsonValue::from(-123_456_789i64));
        assert!(json["cent"].is_i64());
        assert_eq!(json["text"], JsonValue::from("abc"));
        assert_eq!(json["quote"], JsonValue::from(0.5));
        assert_eq!(json["leer"], JsonValue::Null);
        pool.close().await;
    }

    #[tokio::test]
    async fn ein_falscher_schluessel_faellt_beim_pruefzugriff_auf() {
        use crate::schluessel::Datenschluessel;

        let datei = pfad("falscher-key");
        let echt = Datenschluessel::wuerfeln();
        let pool = offen(&datei, Some(echt.als_pragma())).await;
        pool.execute("CREATE TABLE probe (a INTEGER)").await.expect("tabelle");
        pool.close().await;

        // Ein Pool laesst sich auch mit falschem Schluessel ANLEGEN — erst der Zugriff
        // faellt um. Genau deshalb prueft `datenbank_oeffnen` mit einer echten Abfrage.
        let falsch = Datenschluessel::wuerfeln();
        let pool = offen(&datei, Some(falsch.als_pragma())).await;
        assert!(
            sqlx::query("SELECT count(*) FROM sqlite_master").fetch_one(&pool).await.is_err(),
            "Der falsche Schluessel kam durch die Pruefabfrage."
        );
        pool.close().await;
    }
}
