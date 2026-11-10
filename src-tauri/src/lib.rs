// Tauri shell ("shell"-Schicht): bewusst dünn.
// Fenster + Plugins; die Fachlogik lebt im TS-Kern (src/core). Die Persistenz läuft über
// EIGENE Kommandos (datenbank.rs, transaktion.rs) und wird vom TS-Adapter angesprochen.
//
// **Was hier NICHT registriert ist, ist Absicht.** Jedes Plugin ist eine Tür aus dem
// Webview hinaus. `tauri-plugin-opener` stand bis 2026-11-10 hier, ohne dass es jemand
// benutzte — und es öffnet beliebige http(s)-Adressen im Systembrowser, also einen Weg,
// Daten in einer URL hinauszutragen, an der CSP vorbei. Welche Rechte der Webview
// überhaupt haben darf, hält `src/absicherung.test.ts` fest.

mod aktualisierung;
mod dateirechte;
mod export;
// Oeffentlich, weil das Werkzeug `bestandslesen` sie braucht (src/bin/).
pub mod datenbank;
mod krypto;
pub mod schluessel;
mod sicherung;
mod transaktion;
mod zugang;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // MUSS als Erstes laufen: alles, was danach eine Datei anlegt — die Datenbank, ihre
    // WAL- und SHM-Beidateien, Zwischenstaende der Plugins — erbt diese Standardrechte.
    // Ein spaeteres `chmod` kaeme fuer die Beidateien zu spaet, weil SQLite sie bei jedem
    // Oeffnen neu erzeugt. Siehe dateirechte.rs.
    dateirechte::standardrechte_einschraenken();

    tauri::Builder::default()
        // Die Datenbank haengt nicht mehr am SQL-Plugin, sondern an einem eigenen Pool
        // (datenbank.rs). Der Grund ist `PRAGMA key`: es gilt pro Verbindung, und ueber
        // den Pool des Plugins erwischte es eine beliebige. Der Nebengewinn ist, dass
        // `sql:allow-execute` aus den Capabilities faellt — der Webview kann kein
        // beliebiges SQL mehr an eine beliebige Datenbank schicken.
        .manage(datenbank::Datenbank::default())
        // Reiner Transport für FinTS: der Bank-Endpunkt sendet kein
        // Access-Control-Allow-Origin, aus der Webview stirbt der POST an CORS.
        // Dieser fetch läuft durch Rust und kennt kein CORS. Keine Domänenlogik —
        // welche URLs erlaubt sind, steht in capabilities/fints-banken.json und hanseatic.json.
        .plugin(tauri_plugin_http::init())
        // Selbstaktualisierung. Der Updater prueft gegen einen Endpunkt aus
        // tauri.conf.json und laedt nur, was mit unserem Schluessel signiert ist
        // (minisign — das hat mit der Apple-Signierung NICHTS zu tun).
        // `process` kommt mit, weil nach dem Einspielen neu gestartet werden muss.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // `datenbank_oeffnen` fehlt hier mit Absicht (seit 2026-11-10): geoeffnet wird
        // ausschliesslich ueber `zugang_*`, also mit einem Schluessel, den nur Rust kennt.
        // Ein Kommando, das den Wert fuer `PRAGMA key` aus dem Webview annimmt, waere das
        // Gegenteil der Zusage „die Anwendung kennt den Schluessel nie".
        .invoke_handler(tauri::generate_handler![
            datenbank::datenbank_schliessen,
            datenbank::datenbank_ist_offen,
            datenbank::db_select,
            datenbank::db_execute,
            zugang::zugang_stand,
            zugang::zugang_einrichten,
            zugang::zugang_entsperren,
            zugang::zugang_mit_code,
            zugang::zugang_passphrase_wechseln,
            zugang::zugang_code_zeigen,
            transaktion::transaktion,
            transaktion::schema_umbau,
            sicherung::sicherung_anlegen,
            sicherung::sicherungen_auflisten,
            sicherung::sicherungen_entfernen,
            sicherung::sicherungsordner,
            export::export_schreiben,
            aktualisierung::aktualisierung_beta
        ])
        // Was VOR dieser Aenderung entstanden ist, traegt noch die alten offenen Rechte —
        // die `umask` oben wirkt nur auf Neues. Ein Fehlschlag darf den Start nicht
        // verhindern: eine App, die wegen einer Datei nicht hochkommt, an der sie nichts
        // aendern durfte, waere schlechter als eine mit einer zu offenen Datei.
        .setup(|app| {
            use tauri::Manager;
            if let Ok(verzeichnis) = app.path().app_data_dir() {
                dateirechte::bestand_absichern(&verzeichnis);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
