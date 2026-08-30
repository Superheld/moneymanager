// Ein `sqlite3` fuer die verschluesselte Datenbank — von Hand, wenn man einen Datenbug
// nachsehen will statt zu raten.
//
// **Warum es das braucht.** Eine SQLCipher-Datei bekommt `sqlite3` nicht auf. Ohne dieses
// Werkzeug bliebe nur, die App zu oeffnen und in der Oberflaeche zu suchen — und genau das
// taugt nicht, wenn die Frage lautet, was in einer Spalte wirklich steht.
//
// **Bis zum 30.08.2026 war es Pflichtteil eines Waechters**, der den echten Bestand bei
// jedem Testlauf und jedem Push las. Der ist ausgebaut (siehe `CLAUDE.md`), und damit hat
// sich der Charakter dieses Werkzeugs geaendert: es laeuft nur noch, wenn jemand es
// aufruft.
//
// **Der Schluessel kommt aus einer Datei ausserhalb des Repos** — dem
// Wiederherstellungscode, abgelegt unter `~/.moneymanager-schluessel/entwicklung.code`
// (oder wo `MONEYMANAGER_CODE_DATEI` hinzeigt). Der Code IST der Datenschluessel in
// lesbarer Form; er braucht keine Passphrase und kein Argon2.
//
// **Wer diese Datei hat, hat den Bestand.** Das war als Dauerzustand eine Schwaechung, die
// den Zweck der Verschluesselung untergrub — deshalb ist sie jetzt OPTIONAL und gehoert
// nach getaner Arbeit geloescht. Kein Testlauf und kein Hook verlangt sie mehr; ohne sie
// laeuft alles ausser diesem Werkzeug.
//
// LIEST NUR. `PRAGMA query_only=ON` steht fest im Code und nicht in den Argumenten.

use std::io::Write;
use std::path::PathBuf;

use moneymanager_lib::datenbank::pool_lesend;
use moneymanager_lib::schluessel::Datenschluessel;
use sqlx::{AssertSqlSafe, Column, Row, TypeInfo};

fn codedatei() -> PathBuf {
    if let Ok(p) = std::env::var("MONEYMANAGER_CODE_DATEI") {
        return PathBuf::from(p);
    }
    let heim = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(heim).join(".moneymanager-schluessel/entwicklung.code")
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(pfad), Some(sql)) = (args.next(), args.next()) else {
        eprintln!("Aufruf: bestandslesen <datenbank> <sql>");
        std::process::exit(2);
    };

    let datei = codedatei();
    let Ok(code) = std::fs::read_to_string(&datei) else {
        eprintln!(
            "Kein Wiederherstellungscode unter {}.\n\
             Der Bestand ist verschluesselt und laesst sich ohne ihn nicht pruefen.\n\
             Code aus der App holen (Einstellungen -> Verschluesselung) und dort ablegen:\n\
             \x20 mkdir -p ~/.moneymanager-schluessel && chmod 700 ~/.moneymanager-schluessel\n\
             \x20 printf '%s' '<code>' > {}\n\
             \x20 chmod 600 {}",
            datei.display(),
            datei.display(),
            datei.display()
        );
        std::process::exit(3);
    };

    let Ok(dk) = Datenschluessel::aus_wiederherstellungscode(code.trim()) else {
        eprintln!("Der Code in {} ergibt keinen Schluessel.", datei.display());
        std::process::exit(4);
    };

    let pool = match pool_lesend(&PathBuf::from(&pfad), &dk.als_pragma()).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Datenbank nicht lesbar: {e}");
            std::process::exit(5);
        }
    };

    let zeilen = match sqlx::query(AssertSqlSafe(sql)).fetch_all(&pool).await {
        Ok(z) => z,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(6);
        }
    };

    // Ausgabeform wie `sqlite3` sie ohne Schalter liefert: Spalten mit `|` getrennt,
    // eine Zeile je Datensatz. Der Aufrufer erwartet genau das.
    let aus = std::io::stdout();
    let mut aus = std::io::BufWriter::new(aus.lock());
    for zeile in &zeilen {
        let mut teile: Vec<String> = Vec::with_capacity(zeile.columns().len());
        for (i, spalte) in zeile.columns().iter().enumerate() {
            teile.push(match spalte.type_info().name() {
                "INTEGER" | "BIGINT" | "INT" | "INT8" => {
                    zeile.try_get::<i64, _>(i).map(|v| v.to_string()).unwrap_or_default()
                }
                "REAL" | "DOUBLE" | "FLOAT" => {
                    zeile.try_get::<f64, _>(i).map(|v| v.to_string()).unwrap_or_default()
                }
                // Ein berechneter Ausdruck wie `COUNT(*)` traegt KEIN deklariertes
                // Typinfo. Ohne den Rueckfall auf i64 kaeme hier eine leere Zeile heraus
                // — und der Waechter haette gemeldet, es gebe nichts zu schuetzen.
                _ => zeile
                    .try_get::<String, _>(i)
                    .or_else(|_| zeile.try_get::<i64, _>(i).map(|v| v.to_string()))
                    .or_else(|_| zeile.try_get::<f64, _>(i).map(|v| v.to_string()))
                    .unwrap_or_default(),
            });
        }
        let _ = writeln!(aus, "{}", teile.join("|"));
    }
    let _ = aus.flush();
    pool.close().await;
}
