// Tauri shell ("shell"-Schicht laut ARCHITEKTUR.md): bewusst dünn.
// Fenster + Plugins; die Fachlogik lebt im TS-Kern (src/core), Persistenz
// läuft über tauri-plugin-sql (SQLite) und wird vom TS-Adapter angesprochen.

mod dateirechte;
mod krypto;
mod schluessel;
mod sicherung;
mod transaktion;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // MUSS als Erstes laufen: alles, was danach eine Datei anlegt — die Datenbank, ihre
    // WAL- und SHM-Beidateien, Zwischenstaende der Plugins — erbt diese Standardrechte.
    // Ein spaeteres `chmod` kaeme fuer die Beidateien zu spaet, weil SQLite sie bei jedem
    // Oeffnen neu erzeugt. Siehe dateirechte.rs.
    dateirechte::standardrechte_einschraenken();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        // Reiner Transport für FinTS: der Bank-Endpunkt sendet kein
        // Access-Control-Allow-Origin, aus der Webview stirbt der POST an CORS.
        // Dieser fetch läuft durch Rust und kennt kein CORS. Keine Domänenlogik —
        // welche URLs erlaubt sind, steht in capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        // Selbstaktualisierung. Der Updater prueft gegen einen Endpunkt aus
        // tauri.conf.json und laedt nur, was mit unserem Schluessel signiert ist
        // (minisign — das hat mit der Apple-Signierung NICHTS zu tun).
        // `process` kommt mit, weil nach dem Einspielen neu gestartet werden muss.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Mehrere Statements atomar: was ueber tauri-plugin-sql nicht geht, weil dort jedes
        // Statement eine andere Pool-Verbindung erwischt. Siehe transaktion.rs.
        .invoke_handler(tauri::generate_handler![
            transaktion::transaktion,
            transaktion::schema_umbau,
            sicherung::sicherung_anlegen,
            sicherung::sicherungen_auflisten,
            sicherung::sicherungen_entfernen,
            sicherung::sicherungsordner
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
