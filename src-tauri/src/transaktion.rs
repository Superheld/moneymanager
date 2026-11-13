// Mehrere Statements atomar ausführen — was über tauri-plugin-sql nicht geht.
//
// **Warum es diesen Command überhaupt gibt.** Das Plugin führt jedes `execute` über
// `pool.execute()` aus (wrapper.rs), und `Executor for &Pool` holt sich pro Aufruf eine
// beliebige Verbindung aus einem Pool der sqlx-Standardgrösse. Ein `BEGIN` öffnete damit
// eine Transaktion auf Verbindung A, die folgenden Statements liefen auf B, C, … und
// committeten einzeln, das `COMMIT` träfe irgendeine. Über das Plugin ist eine Transaktion
// deshalb nicht möglich — auch zur Laufzeit nicht, nicht nur in Migrationen.
//
// Hier wird stattdessen `pool.begin()` benutzt: das reserviert EINE Verbindung und hält
// sie bis `commit()` oder `rollback()`. Alle Statements laufen garantiert auf derselben.
//
// **Was hier bewusst NICHT passiert:** keine Domänenlogik, kein Wissen über Tabellen. Der
// Command nimmt SQL und Parameter entgegen wie das Plugin auch — die Shell-Schicht kennt
// die TS-Schichten nicht (CLAUDE.md). Wer hier eine Fachregel einbaut, hat sie an einer
// Stelle, die kein TS-Test erreicht.

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{AssertSqlSafe, Executor, Sqlite, Transaction};
use tauri::State;
use crate::datenbank::{binden, Datenbank};

#[derive(Deserialize)]
pub struct Anweisung {
    pub sql: String,
    #[serde(default)]
    pub werte: Vec<JsonValue>,
}

async fn ausfuehren(
    tx: &mut Transaction<'_, Sqlite>,
    anweisungen: &[Anweisung],
) -> Result<u64, sqlx::Error> {
    let mut betroffen = 0u64;
    for a in anweisungen {
        let query = binden(sqlx::query(AssertSqlSafe(a.sql.as_str())), &a.werte);
        betroffen += tx.execute(query).await?.rows_affected();
    }
    Ok(betroffen)
}

/// Führt alle Anweisungen in EINER Transaktion aus.
///
/// Rückgabe ist die Summe der betroffenen Zeilen. Schlägt ein Statement fehl, wird die
/// ganze Transaktion zurückgerollt und der Fehler durchgereicht — der Aufrufer bekommt
/// nie einen halb geschriebenen Stand.
#[tauri::command]
pub async fn transaktion(
    anweisungen: Vec<Anweisung>,
    db: State<'_, Datenbank>,
) -> Result<u64, String> {
    let pool = db.pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    match ausfuehren(&mut tx, &anweisungen).await {
        Ok(betroffen) => {
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(betroffen)
        }
        Err(e) => {
            // Der Rollback-Fehler darf den eigentlichen nicht verdecken: was schiefging,
            // steht im ersten Fehler, nicht darin, dass das Aufräumen auch scheiterte.
            let _ = tx.rollback().await;
            Err(e.to_string())
        }
    }
}

// ---------------------------------------------------------------------------------
// Die Schemasitzung — eine Verbindung, festgehalten ueber mehrere Aufrufe
// ---------------------------------------------------------------------------------
//
// **Wozu.** Eine Migration braucht dreierlei auf DERSELBEN Verbindung: abgeschaltete
// Fremdschluessel, eine Transaktion um alle ihre Statements, und dazwischen Lesezugriffe,
// die den Zwischenstand sehen (gibt es die Spalte schon? ist die Tabelle noch da?). Der
// Befehl `transaktion` oben kann das nicht — seine Liste steht fest, bevor die erste
// Anweisung laeuft. Und der fruehere `schema_umbau` hielt die Verbindung nur fuer EIN
// Statement: die Fremdschluessel waren aus, aber jedes Statement committete fuer sich.
//
// Deshalb waren Migrationen bis 2026-11-10 „einzeln wiederholbar statt geklammert". Die
// Begruendung dafuer stammte aus der Zeit des SQL-Plugins (kein Zugriff auf eine einzelne
// Verbindung) und galt seit dem eigenen Pool nicht mehr. Wiederholbarkeit ist ein
// Versprechen, das JEDE Migration neu halten muss, und zwar von Hand; eine Transaktion
// haelt es fuer alle. Mit ihr gibt es den halben Zustand nicht mehr: bricht eine
// Migration ab, steht die Datenbank da, wo sie vorher stand.
//
// **Warum SQLite das kann:** auch `CREATE`, `ALTER` und `DROP` sind dort transaktional.
//
// **Die Reihenfolge an der Verbindung ist fest:** erst `foreign_keys = OFF`, dann `BEGIN`
// — innerhalb einer Transaktion ist das Pragma wirkungslos. Das `BEGIN`/`COMMIT` selbst
// schickt `migrate()` (db.ts) als gewoehnliche Statements durch diese Sitzung; so laeuft
// im Test (sql.js, eine Verbindung) wortgleich derselbe Ablauf wie in der App.
//
// **Was eine haengengebliebene Sitzung anrichten wuerde**, und warum an drei Stellen
// geraeumt wird: sie haelt eine Verbindung mit offener Schreibtransaktion. Jeder andere
// Schreibzugriff wartet dann, und `pool.close()` — also das Sperren — auch. Geraeumt wird
// deshalb beim Beenden, vor jedem neuen Beginn (der Webview wurde mittendrin neu geladen)
// und vor jedem Schliessen des Pools (`Datenbank::schliessen`).

use crate::datenbank::{zeile_zu_json, Schemasitzung};
use sqlx::SqlitePool;

const KEINE_SITZUNG: &str = "Es ist keine Schemasitzung offen.";

/// Eine Verbindung festhalten und die Fremdschluessel darauf abschalten.
pub(crate) async fn sitzung_beginnen(
    pool: &SqlitePool,
    sitzung: &Schemasitzung,
) -> Result<(), sqlx::Error> {
    sitzung_raeumen(sitzung).await;
    let mut conn = pool.acquire().await?;
    sqlx::query("PRAGMA foreign_keys = OFF").execute(&mut *conn).await?;
    *sitzung.lock().await = Some(conn);
    Ok(())
}

/// Die Sitzung beenden: was nicht committet ist, wird verworfen, die Fremdschluessel
/// gehen wieder an, die Verbindung zurueck in den Pool. Ohne offene Sitzung geschieht
/// nichts.
///
/// **Das `ROLLBACK` laeuft IMMER, und sein Fehler ist keiner.** Nach einem `COMMIT` gibt
/// es nichts zurueckzurollen, SQLite meldet dann „no transaction is active" — genau der
/// Normalfall. Entscheidend ist der andere: eine Verbindung, die mit offener Transaktion
/// oder ohne Fremdschluessel in den Pool zurueckgeht, nimmt die naechste Schreiboperation
/// mit, und niemand sucht den Fehler dort.
pub(crate) async fn sitzung_raeumen(sitzung: &Schemasitzung) {
    let Some(mut conn) = sitzung.lock().await.take() else { return };
    let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
    if sqlx::query("PRAGMA foreign_keys = ON").execute(&mut *conn).await.is_err() {
        // Laesst sich die Pruefung nicht wieder einschalten, darf die Verbindung nicht
        // zurueck: lieber eine weniger im Pool als eine, die still nichts mehr prueft.
        let _ = conn.detach();
    }
}

#[tauri::command]
pub async fn schemasitzung_beginnen(db: State<'_, Datenbank>) -> Result<(), String> {
    let pool = db.pool().await?;
    sitzung_beginnen(&pool, &db.1).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schemasitzung_execute(
    sql: String,
    werte: Vec<JsonValue>,
    db: State<'_, Datenbank>,
) -> Result<u64, String> {
    let mut halter = db.1.lock().await;
    let conn = halter.as_mut().ok_or(KEINE_SITZUNG)?;
    let ergebnis = binden(sqlx::query(AssertSqlSafe(sql)), &werte)
        .execute(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ergebnis.rows_affected())
}

#[tauri::command]
pub async fn schemasitzung_select(
    sql: String,
    werte: Vec<JsonValue>,
    db: State<'_, Datenbank>,
) -> Result<Vec<JsonValue>, String> {
    let mut halter = db.1.lock().await;
    let conn = halter.as_mut().ok_or(KEINE_SITZUNG)?;
    let zeilen = binden(sqlx::query(AssertSqlSafe(sql)), &werte)
        .fetch_all(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(zeilen.iter().map(zeile_zu_json).collect())
}

#[tauri::command]
pub async fn schemasitzung_beenden(db: State<'_, Datenbank>) -> Result<(), String> {
    sitzung_raeumen(&db.1).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;
    use std::path::PathBuf;

    async fn pool(name: &str) -> SqlitePool {
        let p: PathBuf = std::env::temp_dir().join(format!("moneymanager-sitzung-{name}.db"));
        for anhang in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{anhang}", p.to_string_lossy()));
        }
        crate::datenbank::pool_anlegen_klartext(&p).await.expect("pool")
    }

    async fn in_sitzung(s: &Schemasitzung, sql: &'static str) -> Result<(), sqlx::Error> {
        let mut halter = s.lock().await;
        let conn = halter.as_mut().expect("sitzung");
        sqlx::query(sql).execute(&mut **conn).await.map(|_| ())
    }

    async fn fremdschluessel_in_sitzung(s: &Schemasitzung) -> i64 {
        let mut halter = s.lock().await;
        let conn = halter.as_mut().expect("sitzung");
        sqlx::query_scalar("PRAGMA foreign_keys").fetch_one(&mut **conn).await.expect("pragma")
    }

    /// **Der Test, um dessentwillen es die Sitzung gibt.** Auch Schemaaenderungen sind
    /// in SQLite transaktional — bricht eine Migration ab, ist NICHTS von ihr geschehen.
    #[tokio::test]
    async fn eine_abgebrochene_schemaaenderung_hinterlaesst_nichts() {
        let pool = pool("abbruch").await;
        pool.execute("CREATE TABLE alt (a INTEGER)").await.expect("alt");
        pool.execute("INSERT INTO alt VALUES (1), (2)").await.expect("zeilen");
        let s = Schemasitzung::default();

        sitzung_beginnen(&pool, &s).await.expect("beginnen");
        in_sitzung(&s, "BEGIN").await.expect("begin");
        in_sitzung(&s, "CREATE TABLE neu (a INTEGER, b TEXT)").await.expect("neu");
        in_sitzung(&s, "INSERT INTO neu (a) SELECT a FROM alt").await.expect("kopieren");
        in_sitzung(&s, "DROP TABLE alt").await.expect("drop");
        // … und hier bricht es ab: kein COMMIT.
        sitzung_raeumen(&s).await;

        let tabellen: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .expect("tabellen");
        assert_eq!(tabellen, vec!["alt"], "Die halbe Migration hat Spuren hinterlassen.");
        let zeilen: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alt").fetch_one(&pool).await.expect("zaehlen");
        assert_eq!(zeilen, 2);
        pool.close().await;
    }

    #[tokio::test]
    async fn was_committet_ist_bleibt_auch_nach_dem_raeumen() {
        let pool = pool("commit").await;
        let s = Schemasitzung::default();

        sitzung_beginnen(&pool, &s).await.expect("beginnen");
        in_sitzung(&s, "BEGIN").await.expect("begin");
        in_sitzung(&s, "CREATE TABLE bleibt (a INTEGER)").await.expect("tabelle");
        in_sitzung(&s, "COMMIT").await.expect("commit");
        sitzung_raeumen(&s).await;

        let da: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name='bleibt'")
                .fetch_one(&pool)
                .await
                .expect("nachsehen");
        assert_eq!(da, 1);
        pool.close().await;
    }

    /// In der Sitzung sind die Fremdschluessel AUS, danach auf jeder Verbindung wieder AN.
    #[tokio::test]
    async fn die_fremdschluessel_sind_nur_in_der_sitzung_aus() {
        let pool = pool("fk").await;
        let s = Schemasitzung::default();

        sitzung_beginnen(&pool, &s).await.expect("beginnen");
        assert_eq!(fremdschluessel_in_sitzung(&s).await, 0);
        sitzung_raeumen(&s).await;

        // Mehrfach, damit auch die zurueckgegebene Verbindung drankommt.
        for _ in 0..12 {
            let an: i64 =
                sqlx::query_scalar("PRAGMA foreign_keys").fetch_one(&pool).await.expect("pragma");
            assert_eq!(an, 1, "Eine Verbindung ist ohne Fremdschluessel in den Pool zurueckgegangen.");
        }
        pool.close().await;
    }

    /// Der Webview wird mitten in einer Migration neu geladen: die alte Sitzung haengt
    /// noch, die neue darf weder warten noch auf dem halben Stand aufsetzen.
    #[tokio::test]
    async fn ein_neuer_beginn_raeumt_eine_haengengebliebene_sitzung() {
        let pool = pool("haengt").await;
        let s = Schemasitzung::default();

        sitzung_beginnen(&pool, &s).await.expect("erste");
        in_sitzung(&s, "BEGIN").await.expect("begin");
        in_sitzung(&s, "CREATE TABLE halb (a INTEGER)").await.expect("tabelle");

        sitzung_beginnen(&pool, &s).await.expect("zweite");
        in_sitzung(&s, "BEGIN").await.expect("zweites begin — die Schreibsperre ist frei");
        in_sitzung(&s, "CREATE TABLE halb (a INTEGER)").await.expect("die Tabelle gab es nie");
        in_sitzung(&s, "COMMIT").await.expect("commit");
        sitzung_raeumen(&s).await;

        // Und der Pool laesst sich schliessen — keine Verbindung haengt mehr.
        pool.close().await;
    }
}
