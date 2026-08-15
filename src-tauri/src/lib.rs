// Tauri shell ("shell"-Schicht laut ARCHITEKTUR.md): bewusst dünn.
// Fenster + Plugins; die Fachlogik lebt im TS-Kern (src/core), Persistenz
// läuft über tauri-plugin-sql (SQLite) und wird vom TS-Adapter angesprochen.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
