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
use sqlx::{Executor, Sqlite, Transaction};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
pub struct Anweisung {
    pub sql: String,
    #[serde(default)]
    pub werte: Vec<JsonValue>,
}

/// Bindet einen JSON-Wert an eine Query.
///
/// Anders als das Plugin, das jede Zahl als `f64` bindet: Ganzzahlen gehen als `i64`
/// hinein. In einer Anwendung, die Geld als Integer Cent führt, ist der Umweg über
/// Fliesskomma unnötig — und er ist genau die Sorte Detail, die irgendwann einen Cent
/// verschiebt, ohne dass jemand die Stelle wiederfindet.
fn binden<'q>(
    mut query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    werte: &'q [JsonValue],
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for wert in werte {
        query = match wert {
            JsonValue::Null => query.bind(None::<String>),
            JsonValue::Bool(b) => query.bind(*b),
            JsonValue::String(s) => query.bind(s.as_str()),
            JsonValue::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query.bind(i)
                } else {
                    query.bind(n.as_f64().unwrap_or_default())
                }
            }
            // Arrays und Objekte gehen als JSON-Text hinein — dieselbe Wahl wie im Plugin.
            andere => query.bind(andere.to_string()),
        };
    }
    query
}

async fn ausfuehren(
    tx: &mut Transaction<'_, Sqlite>,
    anweisungen: &[Anweisung],
) -> Result<u64, sqlx::Error> {
    let mut betroffen = 0u64;
    for a in anweisungen {
        let query = binden(sqlx::query(&a.sql), &a.werte);
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
    db: String,
    anweisungen: Vec<Anweisung>,
    instanzen: State<'_, DbInstances>,
) -> Result<u64, String> {
    let instanzen = instanzen.0.read().await;
    let pool = instanzen
        .get(&db)
        .ok_or_else(|| format!("Datenbank '{db}' ist nicht geöffnet"))?;

    // Solange nur das sqlite-Feature des Plugins aktiv ist, hat `DbPool` genau eine
    // Variante und der Zweig darunter ist tot. Er bleibt trotzdem stehen: kommt je ein
    // weiteres Feature dazu, ist er sofort richtig, statt still das Falsche zu tun.
    #[allow(irrefutable_let_patterns)]
    let DbPool::Sqlite(pool) = pool else {
        return Err("Nur SQLite wird unterstützt".to_string());
    };

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

/// Führt Schema-Statements auf EINER Verbindung mit abgeschalteten Fremdschlüsseln aus.
///
/// **Warum das nötig ist.** SQLite kann Constraints nicht per `ALTER TABLE` nachrüsten;
/// eine Tabelle bekommt sie nur durch Neubau — anlegen, umkopieren, alte fallen lassen,
/// umbenennen. Mit eingeschalteten Fremdschlüsseln geht dabei zweierlei schief, und beides
/// ist gemessen: `DROP TABLE` scheitert, wenn ein Schlüssel mit RESTRICT darauf zeigt, und
/// es LÖSCHT STILL, wo einer mit CASCADE darauf zeigt — SQLite behandelt den Drop wie das
/// Löschen aller Zeilen. Die offizielle Umbau-Prozedur schaltet die Prüfung deshalb ab.
///
/// Das kann nur, wer die Verbindung festhält: `PRAGMA foreign_keys` gilt pro Verbindung,
/// und über den Pool des Plugins erwischte es eine beliebige.
///
/// **Keine Transaktion.** Migrationen sind hier bewusst einzeln wiederholbar statt in eine
/// Klammer gefasst (siehe `db.ts`): bricht ein Lauf ab, steht die Version noch nicht, und
/// der nächste Start wiederholt sie folgenlos. Eine Transaktion würde das Gegenteil
/// erzwingen — ganz oder gar nicht — und den Wiederanlauf schwerer machen, nicht leichter.
///
/// **Geprüft wird nicht hier, sondern EINMAL nach der ganzen Kette** (`migrate` in
/// `db.ts`). Der Grund ist die Aufrufform: die Migrationsschleife prüft zwischen den
/// Statements den Zwischenzustand — ob eine Tabelle noch da ist, ob eine Spalte schon
/// existiert — und ruft deshalb je Statement einmal hierher. Ein `foreign_key_check` über
/// die ganze Datenbank bei jedem einzelnen Statement wäre der teuerste denkbare Weg zum
/// selben Ergebnis. Wer die Prüfung abschaltet, muss sie nachholen; nur eben am Ende.
#[tauri::command]
pub async fn schema_umbau(
    db: String,
    anweisungen: Vec<Anweisung>,
    instanzen: State<'_, DbInstances>,
) -> Result<u64, String> {
    let instanzen = instanzen.0.read().await;
    let pool = instanzen
        .get(&db)
        .ok_or_else(|| format!("Datenbank '{db}' ist nicht geöffnet"))?;

    #[allow(irrefutable_let_patterns)]
    let DbPool::Sqlite(pool) = pool else {
        return Err("Nur SQLite wird unterstützt".to_string());
    };

    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;

    // Ab hier gilt: was auch schiefgeht, die Prüfung wird wieder eingeschaltet. Eine
    // Verbindung, die ohne Fremdschlüssel in den Pool zurückgeht, nimmt die nächste
    // Schreiboperation mit — und niemand sucht den Fehler dort.
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    let ergebnis = async {
        let mut betroffen = 0u64;
        for a in &anweisungen {
            let query = binden(sqlx::query(&a.sql), &a.werte);
            betroffen += conn.execute(query).await?.rows_affected();
        }
        Ok::<_, sqlx::Error>(betroffen)
    }
    .await;

    let wieder_an = sqlx::query("PRAGMA foreign_keys = ON").execute(&mut *conn).await;

    match ergebnis {
        Err(e) => Err(e.to_string()),
        Ok(betroffen) => {
            wieder_an.map_err(|e| e.to_string())?;
            Ok(betroffen)
        }
    }
}
