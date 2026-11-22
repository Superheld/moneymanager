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

    /// **Welches SQLite in SQLCipher steckt, steht nicht in der Nummer von libsqlite3-sys.**
    ///
    /// RUSTSEC-2026-0459 (WAL mit fremder Seitengroesse liest fremden Speicher) ist erst ab
    /// SQLite 3.54.0 behoben. Das Advisory nennt libsqlite3-sys ab 0.39 „gepatcht" — fuer
    /// `bundled`. In der SQLCipher-Variante buendelte 0.39 aber noch SQLite 3.53.4; cargo-deny
    /// waere dort gruen gewesen und die Luecke offen. Deshalb fragt dieser Test das gelinkte
    /// SQLite selbst, statt der Fassungsnummer zu glauben.
    #[tokio::test]
    async fn das_gebuendelte_sqlite_ist_gegen_rustsec_2026_0459_gepatcht() {
        let datei = pfad("fassung");
        // Mit Schluessel: `cipher_provider` antwortet nur auf einer verschluesselten Verbindung.
        let pool = oeffnen(&datei, Some(&als_passwort(SCHLUESSEL))).await.expect("oeffnen");
        let sqlite: String = sqlx::query_scalar("SELECT sqlite_version()").fetch_one(&pool).await.expect("sqlite");
        let cipher: String = sqlx::query_scalar("PRAGMA cipher_version").fetch_one(&pool).await.expect("cipher");
        let anbieter: String = sqlx::query_scalar("PRAGMA cipher_provider").fetch_one(&pool).await.expect("provider");
        println!("SQLite {sqlite}, SQLCipher {cipher}, Krypto {anbieter}");
        pool.close().await;

        let teile: Vec<u32> = sqlite.split('.').map(|t| t.parse().expect("Fassungsteil")).collect();
        assert!(
            teile[..2] >= [3, 54][..],
            "SQLite {sqlite} ist vor 3.54.0 und damit von RUSTSEC-2026-0459 betroffen."
        );
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

    // -----------------------------------------------------------------------------
    // Eine Datei aus einer ALTEN Fassung
    // -----------------------------------------------------------------------------
    //
    // Alle Tests oben schreiben und lesen mit derselben Fassung — sie bleiben gruen, auch
    // wenn ein Heben von libsqlite3-sys das Dateiformat oder die Vorgaben von SQLCipher
    // (Seitengroesse, HMAC, KDF) aendert. Genau dann kaeme der echte Bestand nach dem
    // naechsten Update nicht mehr auf. Dagegen steht hier eine Datei, die mit einer
    // FRUEHEREN Fassung geschrieben wurde und im Repo liegt (`src-tauri/testdaten/`).
    //
    // Geschrieben mit libsqlite3-sys 0.30.1 (SQLCipher 4.5.7, SQLite 3.45.3), im
    // WAL-Modus wie die App: drei Zeilen in der Hauptdatei, zwei weitere nur im `-wal`.
    // Der Schluessel ist erfunden und steht nur hier. Die Dateien enden auf `.bin` statt
    // `.db`, weil `.gitignore` jede `.db` abweist — und das soll so bleiben.
    //
    // **Vor dem naechsten Heben:** mit der dann noch alten Fassung
    // `MONEYMANAGER_TESTVEKTOR=<ordner> cargo test --lib testvektor_schreiben -- --ignored`
    // laufen lassen und die beiden Dateien neben die vorhandenen legen — oder diese
    // stehen lassen, solange sie die aelteste Fassung sind, die noch ein Bestand haben kann.

    /// `"4.5.7 community"` -> `"4.5.7"`, fuer den Dateinamen.
    fn fassung(cipher_version: &str) -> &str {
        cipher_version.split_whitespace().next().unwrap_or("unbekannt")
    }

    /// Rohschluessel in derselben Form wie `Datenschluessel::als_pragma()`.
    const VEKTOR_SCHLUESSEL: &str =
        "\"x'5e1f0c2a9b7d4e6f8a3c1b0d2e4f6a8c9b7d5e3f1a2c4e6b8d0f2a4c6e8b0d2f'\"";

    /// Schreibt den Testvektor mit der Fassung, die gerade gebaut ist. Laeuft nur von Hand.
    #[tokio::test]
    #[ignore = "erzeugt den Testvektor; nur von Hand vor einem Heben von libsqlite3-sys"]
    async fn testvektor_schreiben() {
        use sqlx::sqlite::SqliteJournalMode;

        let ziel = PathBuf::from(
            std::env::var("MONEYMANAGER_TESTVEKTOR").expect("MONEYMANAGER_TESTVEKTOR setzen"),
        );
        std::fs::create_dir_all(&ziel).expect("zielordner");
        let arbeit = pfad("vektor-arbeit");
        let _ = std::fs::remove_file(arbeit.with_extension("db-wal"));

        let opts = SqliteConnectOptions::new()
            .filename(&arbeit)
            .create_if_missing(true)
            .pragma("key", VEKTOR_SCHLUESSEL)
            .journal_mode(SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await.expect("pool");

        pool.execute("CREATE TABLE probe (nr INTEGER PRIMARY KEY, text TEXT NOT NULL, betrag INTEGER NOT NULL)")
            .await
            .expect("tabelle");
        for (nr, text, betrag) in [(1, "erste Zeile", -1250), (2, "zweite Zeile", 99), (3, "Umlaute äöü", 0)] {
            sqlx::query("INSERT INTO probe VALUES (?, ?, ?)")
                .bind(nr)
                .bind(text)
                .bind(betrag)
                .execute(&pool)
                .await
                .expect("insert");
        }
        // Alles bis hier in die Hauptdatei, der Rest bleibt im WAL.
        pool.execute("PRAGMA wal_checkpoint(TRUNCATE)").await.expect("checkpoint");
        for (nr, text, betrag) in [(4, "nur im wal", 4711), (5, "auch im wal", -1)] {
            sqlx::query("INSERT INTO probe VALUES (?, ?, ?)")
                .bind(nr)
                .bind(text)
                .bind(betrag)
                .execute(&pool)
                .await
                .expect("insert");
        }

        let cipher: String = sqlx::query_scalar("PRAGMA cipher_version").fetch_one(&pool).await.expect("cipher");
        let sqlite: String = sqlx::query_scalar("SELECT sqlite_version()").fetch_one(&pool).await.expect("sqlite");
        println!("geschrieben mit SQLCipher {cipher}, SQLite {sqlite}");

        // Kopiert, WAEHREND die Verbindung offen ist — beim Schliessen wuerde das WAL in
        // die Hauptdatei zurueckgeschrieben und geloescht.
        std::fs::copy(&arbeit, ziel.join(format!("sqlcipher-{}-haupt.bin", fassung(&cipher)))).expect("db kopieren");
        std::fs::copy(arbeit.with_extension("db-wal"), ziel.join(format!("sqlcipher-{}-wal.bin", fassung(&cipher)))).expect("wal kopieren");
        pool.close().await;
    }

    /// Legt den Testvektor in einen eigenen Ordner, damit das Oeffnen ihn nicht veraendert.
    fn vektor_auslegen(name: &str, mit_wal: bool) -> PathBuf {
        let ordner = std::env::temp_dir().join(format!("moneymanager-krypto-vektor-{name}"));
        let _ = std::fs::remove_dir_all(&ordner);
        std::fs::create_dir_all(&ordner).expect("ordner");
        let db = ordner.join("bestand.db");
        std::fs::write(&db, include_bytes!("../testdaten/sqlcipher-4.5.7-haupt.bin")).expect("db");
        if mit_wal {
            std::fs::write(ordner.join("bestand.db-wal"), include_bytes!("../testdaten/sqlcipher-4.5.7-wal.bin"))
                .expect("wal");
        }
        db
    }

    async fn zeilen(datei: &PathBuf) -> Vec<(i64, String, i64)> {
        let pool = crate::datenbank::pool_mit_schluessel(datei, VEKTOR_SCHLUESSEL)
            .await
            .expect("Pool auf die alte Datei");
        let z = sqlx::query_as("SELECT nr, text, betrag FROM probe ORDER BY nr")
            .fetch_all(&pool)
            .await
            .expect("Die mit einer frueheren SQLCipher-Fassung geschriebene Datei geht nicht mehr auf.");
        pool.close().await;
        z
    }

    #[test]
    fn der_testvektor_ist_verschluesselt() {
        let kopf = &include_bytes!("../testdaten/sqlcipher-4.5.7-haupt.bin")[..16];
        assert_ne!(kopf, b"SQLite format 3\0", "Der Testvektor ist gar nicht verschluesselt.");
    }

    #[tokio::test]
    async fn eine_datei_der_frueheren_fassung_geht_auf() {
        let z = zeilen(&vektor_auslegen("ohne-wal", false)).await;
        assert_eq!(
            z,
            vec![
                (1, "erste Zeile".to_string(), -1250),
                (2, "zweite Zeile".to_string(), 99),
                (3, "Umlaute äöü".to_string(), 0),
            ]
        );
    }

    #[tokio::test]
    async fn ihr_wal_der_frueheren_fassung_wird_mitgelesen() {
        let z = zeilen(&vektor_auslegen("mit-wal", true)).await;
        let nummern: Vec<i64> = z.iter().map(|(nr, _, _)| *nr).collect();
        assert_eq!(nummern, vec![1, 2, 3, 4, 5], "Was nur im WAL stand, fehlt.");
        assert_eq!(z[3], (4, "nur im wal".to_string(), 4711));
    }
}
