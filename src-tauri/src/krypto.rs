// Ob dieser Stack ueberhaupt verschluesseln kann — der Machbarkeitsnachweis.
//
// **Worum es geht.** SQLCipher ist SQLite mit einem zusaetzlichen `PRAGMA key`. Die
// Schwierigkeit liegt nicht in der Verschluesselung, sondern darin, ueberhaupt an die
// C-Bibliothek heranzukommen, die sqlx benutzt: `tauri-plugin-sql` oeffnet die Datenbank
// selbst und kennt kein `PRAGMA key`. Der Weg dorthin fuehrt ueber Cargo — siehe den
// Eintrag zu `libsqlite3-sys` in Cargo.toml.
//
// Dieses Modul enthaelt (noch) keinen Produktivcode, sondern die Pruefungen, die die
// Frage beantworten. Sie bleiben stehen, wenn der Rest dazukommt: sie sind der Waechter
// dafuer, dass ein Update von sqlx oder Tauri die Verschluesselung nicht stillschweigend
// wieder ausbaut. Genau das waere der schlimmste denkbare Fehler hier — eine App, die
// glaubt zu verschluesseln und es nicht tut.

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::{AssertSqlSafe, Executor, SqlitePool};
    use std::path::PathBuf;

    /// Ein eigener Pfad je Testfall — die Tests laufen nebenlaeufig.
    fn pfad(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("moneymanager-krypto-{name}.db"));
        let _ = std::fs::remove_file(&p);
        p
    }

    /// Oeffnet eine Verbindung und setzt den Schluessel als ERSTES Statement.
    ///
    /// Die Reihenfolge ist nicht verhandelbar: `PRAGMA key` muss vor jedem Zugriff auf
    /// die Datenbank kommen. Danach ist es zu spaet — SQLCipher hat dann schon versucht,
    /// den Kopf der Datei zu lesen, und scheitert.
    ///
    /// **`pragma` ist der FERTIGE Ausdruck, nicht der nackte Wert.** SQLCipher kennt zwei
    /// Formen, und sie sehen fast gleich aus: `'wort'` ist ein Passwort und geht durch
    /// SQLCiphers eigene Ableitung, `x'hex'` ist der Rohschluessel und wird direkt
    /// benutzt. Wer hier noch einmal Anfuehrungszeichen herumlegt, macht aus dem einen
    /// das andere — oder kaputtes SQL. Genau das ist beim ersten Anlauf passiert.
    async fn oeffnen(datei: &PathBuf, pragma: Option<&str>) -> Result<SqlitePool, sqlx::Error> {
        let opts = SqliteConnectOptions::new().filename(datei).create_if_missing(true);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await?;
        if let Some(k) = pragma {
            // Eingesetzt statt gebunden: `PRAGMA` nimmt keine Platzhalter.
            sqlx::query(AssertSqlSafe(format!("PRAGMA key = {k}")))
                .execute(&pool)
                .await?;
        }
        Ok(pool)
    }

    /// Ein Passwort in der Form, die SQLCipher dafuer erwartet.
    fn als_passwort(wort: &str) -> String {
        format!("'{}'", wort.replace('\'', "''"))
    }

    const SCHLUESSEL: &str = "probe-schluessel-nur-fuer-diesen-test";

    #[tokio::test]
    async fn sqlcipher_ist_ueberhaupt_eingebaut() {
        let datei = pfad("vorhanden");
        let pool = oeffnen(&datei, None).await.expect("oeffnen");

        // Nur SQLCipher kennt dieses Pragma. Plain SQLite liefert eine leere Antwort.
        let fassung: Option<String> = sqlx::query_scalar("PRAGMA cipher_version")
            .fetch_optional(&pool)
            .await
            .expect("cipher_version");

        assert!(
            fassung.is_some(),
            "Kein SQLCipher im Build — `PRAGMA cipher_version` antwortet nicht. \
             Dann ist libsqlite3-sys ohne das sqlcipher-Feature im Baum."
        );
        pool.close().await;
    }

    #[tokio::test]
    async fn eine_verschluesselte_datei_traegt_keinen_sqlite_kopf() {
        let datei = pfad("kopf");
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.close().await;

        let inhalt = std::fs::read(&datei).expect("lesen");
        // Eine unverschluesselte SQLite-Datei beginnt mit genau diesen 16 Bytes. Das ist
        // die Probe, die man wirklich machen muss: ein `SELECT`, das durchlaeuft, beweist
        // NICHT, dass verschluesselt wurde — es beweist nur, dass gelesen werden konnte.
        assert!(
            !inhalt.starts_with(b"SQLite format 3\0"),
            "Die Datei traegt den unverschluesselten SQLite-Kopf — es wurde nichts verschluesselt."
        );
    }

    #[tokio::test]
    async fn ohne_schluessel_kommt_man_nicht_heran() {
        let datei = pfad("ohne");
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES ('geheim')").await.expect("insert");
        pool.close().await;

        let pool = oeffnen(&datei, None).await.expect("oeffnen ohne Schluessel");
        let ergebnis: Result<i64, _> = sqlx::query_scalar("SELECT COUNT(*) FROM probe")
            .fetch_one(&pool)
            .await;
        assert!(ergebnis.is_err(), "Ohne Schluessel liess sich lesen — nichts ist geschuetzt.");
        pool.close().await;
    }

    #[tokio::test]
    async fn mit_dem_falschen_schluessel_ebenfalls_nicht() {
        let datei = pfad("falsch");
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.close().await;

        let pool = oeffnen(&datei, Some(&als_passwort("ein-anderer-schluessel"))).await.expect("oeffnen");
        let ergebnis: Result<i64, _> = sqlx::query_scalar("SELECT COUNT(*) FROM probe")
            .fetch_one(&pool)
            .await;
        assert!(ergebnis.is_err(), "Der falsche Schluessel oeffnete die Datenbank.");
        pool.close().await;
    }

    #[tokio::test]
    async fn mit_dem_richtigen_schluessel_steht_alles_wieder_da() {
        let datei = pfad("rundreise");
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES ('wieder da')").await.expect("insert");
        pool.close().await;

        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("wieder oeffnen");
        let wert: String = sqlx::query_scalar("SELECT a FROM probe").fetch_one(&pool).await.expect("lesen");
        assert_eq!(wert, "wieder da");
        pool.close().await;
    }

    /// **Der Test, an dem der ganze Uebergang haengt.**
    ///
    /// Sobald SQLCipher im Build ist, oeffnet die App JEDE Datenbank damit — auch die
    /// vorhandene, die unverschluesselt auf der Platte liegt. Wuerde SQLCipher darauf
    /// bestehen, alles zu entschluesseln, kaeme die App nach dem naechsten Update nicht
    /// mehr hoch, und der Bestand saehe aus wie verloren.
    ///
    /// Sie tut es nicht: ohne `PRAGMA key` verhaelt sich SQLCipher wie gewoehnliches
    /// SQLite. Das ist dokumentiert — und trotzdem gehoert es geprueft, weil die Kosten
    /// eines Irrtums hier der Bestand selbst waeren.
    #[tokio::test]
    async fn eine_unverschluesselte_datenbank_bleibt_lesbar() {
        let datei = pfad("altbestand");

        // So sieht der heutige Bestand aus: angelegt ohne jeden Schluessel.
        let pool = oeffnen(&datei, None).await.expect("anlegen");
        pool.execute("CREATE TABLE ist_buchung (betrag INTEGER)").await.expect("tabelle");
        pool.execute("INSERT INTO ist_buchung VALUES (-1234)").await.expect("insert");
        pool.close().await;

        assert!(
            std::fs::read(&datei).expect("lesen").starts_with(b"SQLite format 3\0"),
            "Der Aufbau des Tests stimmt nicht — diese Datei sollte unverschluesselt sein."
        );

        // Und so oeffnet die App sie nach dem Update.
        let pool = oeffnen(&datei, None).await.expect("wieder oeffnen");
        let betrag: i64 = sqlx::query_scalar("SELECT betrag FROM ist_buchung")
            .fetch_one(&pool)
            .await
            .expect("Der vorhandene Bestand liess sich nicht mehr lesen.");
        assert_eq!(betrag, -1234);
        pool.close().await;
    }

    /// **Die Naht zwischen Schluesselverwaltung und Datenbank.**
    ///
    /// Hier faellt auf, wenn `als_pragma()` die falsche Form liefert: ohne die Klammerung
    /// `x'…'` fasst SQLCipher den Wert als Passwort auf und jagt ihn durch seine eigene
    /// Ableitung. Es funktionierte trotzdem — nur waere dann nicht der Schluessel, den
    /// wir gesichert haben, der die Datei verschluesselt. Der Fehler zeigte sich erst am
    /// Tag, an dem jemand den Wiederherstellungscode braucht.
    #[tokio::test]
    async fn der_datenschluessel_oeffnet_eine_sqlcipher_datenbank() {
        use crate::schluessel::Datenschluessel;

        let datei = pfad("datenschluessel");
        let dk = Datenschluessel::wuerfeln();

        let pool = oeffnen(&datei, Some(&dk.als_pragma())).await.expect("anlegen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES ('mit gewuerfeltem Schluessel')")
            .await
            .expect("insert");
        pool.close().await;

        assert!(
            !std::fs::read(&datei).expect("lesen").starts_with(b"SQLite format 3\0"),
            "Mit einem Rohschluessel muss verschluesselt worden sein."
        );

        let pool = oeffnen(&datei, Some(&dk.als_pragma())).await.expect("wieder oeffnen");
        let wert: String = sqlx::query_scalar("SELECT a FROM probe").fetch_one(&pool).await.expect("lesen");
        assert_eq!(wert, "mit gewuerfeltem Schluessel");
        pool.close().await;
    }

    /// **Der Test, der den Wiederherstellungscode zu einem Versprechen macht.**
    ///
    /// Ein Code, der sich sauber zurueckrechnen laesst, aber die Datenbank nicht
    /// aufschliesst, ist schlimmer als keiner: er wird aufgeschrieben und weggelegt, und
    /// sein Wert zeigt sich erst in dem Moment, in dem nichts anderes mehr hilft.
    #[tokio::test]
    async fn der_wiederherstellungscode_oeffnet_die_echte_datenbank() {
        use crate::schluessel::Datenschluessel;

        let datei = pfad("code-oeffnet");
        let dk = Datenschluessel::wuerfeln();
        let code = dk.als_wiederherstellungscode();

        let pool = oeffnen(&datei, Some(&dk.als_pragma())).await.expect("anlegen");
        pool.execute("CREATE TABLE probe (a TEXT)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES ('gerettet')").await.expect("insert");
        pool.close().await;
        drop(dk); // Die Passphrase ist vergessen, der Schluessel weg — nur der Zettel bleibt.

        let aus_zettel = Datenschluessel::aus_wiederherstellungscode(&code).expect("Code");
        let pool = oeffnen(&datei, Some(&aus_zettel.als_pragma())).await.expect("oeffnen");
        let wert: String = sqlx::query_scalar("SELECT a FROM probe")
            .fetch_one(&pool)
            .await
            .expect("Der Wiederherstellungscode oeffnete die Datenbank NICHT.");
        assert_eq!(wert, "gerettet");
        pool.close().await;
    }

    /// **Die Frage, die den Zuschnitt aller weiteren Scheiben entscheidet.**
    ///
    /// `PRAGMA key` gilt PRO VERBINDUNG. `tauri-plugin-sql` oeffnet aber einen Pool und
    /// holt sich fuer jedes Statement eine beliebige Verbindung daraus — genau die Falle,
    /// die bei `PRAGMA foreign_keys` schon zugeschlagen hat (siehe transaktion.rs).
    ///
    /// Wenn ein `PRAGMA key` ueber den Pool nur die eine Verbindung erwischt, die es
    /// gerade bekommen hat, dann laesst sich eine verschluesselte Datenbank ueber das
    /// Plugin GAR NICHT betreiben — und der eigene Persistenz-Adapter (S-10f) waere keine
    /// Kuer mehr, sondern Voraussetzung.
    #[tokio::test]
    async fn ein_pragma_key_ueber_einen_pool_mit_mehreren_verbindungen() {
        use crate::schluessel::Datenschluessel;

        let datei = pfad("pool");
        let dk = Datenschluessel::wuerfeln();

        // Anlegen wie gehabt, mit genau einer Verbindung.
        let pool = oeffnen(&datei, Some(&dk.als_pragma())).await.expect("anlegen");
        pool.execute("CREATE TABLE probe (a INTEGER)").await.expect("tabelle");
        pool.execute("INSERT INTO probe VALUES (1)").await.expect("insert");
        pool.close().await;

        // Und jetzt so, wie das Plugin es tut: mehrere Verbindungen im Pool.
        let opts = SqliteConnectOptions::new().filename(&datei).create_if_missing(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .min_connections(0)
            .connect_with(opts)
            .await
            .expect("pool");

        sqlx::query(AssertSqlSafe(format!("PRAGMA key = {}", dk.als_pragma())))
            .execute(&pool)
            .await
            .expect("key auf irgendeiner Verbindung");

        // Genug Abfragen, dass der Pool weitere Verbindungen aufmachen muss.
        let mut fehler = 0;
        for _ in 0..20 {
            if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM probe")
                .fetch_one(&pool)
                .await
                .is_err()
            {
                fehler += 1;
            }
        }
        pool.close().await;

        // Diese Zusicherung haelt das MESSERGEBNIS fest, nicht einen Wunsch. Schlaegt sie
        // eines Tages um, hat sich sqlx' oder SQLCiphers Verhalten geaendert — und die
        // Architektur der Persistenz haengt daran.
        assert!(
            fehler > 0,
            "Ein einzelnes PRAGMA key hat den ganzen Pool bedient. Dann waere der Umweg              ueber einen eigenen Adapter nicht noetig — diese Annahme gehoert geprueft."
        );
    }

    #[tokio::test]
    async fn der_klartext_steht_nicht_in_der_datei() {
        let datei = pfad("klartext");
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        pool.execute("CREATE TABLE umsatz (empfaenger TEXT)").await.expect("tabelle");
        pool.execute("INSERT INTO umsatz VALUES ('MUSTERMANN-UNIKAT-ZEICHENKETTE')")
            .await
            .expect("insert");
        pool.close().await;

        let inhalt = std::fs::read(&datei).expect("lesen");
        // Der eigentliche Punkt der ganzen Uebung: was in der Datenbank steht, darf in der
        // Datei nicht auffindbar sein. Auch Tabellen- und Spaltennamen nicht.
        for gesucht in ["MUSTERMANN-UNIKAT-ZEICHENKETTE", "umsatz", "empfaenger"] {
            assert!(
                !inhalt.windows(gesucht.len()).any(|f| f == gesucht.as_bytes()),
                "'{gesucht}' steht im Klartext in der Datei."
            );
        }
    }
}
