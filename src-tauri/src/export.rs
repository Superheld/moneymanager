// Eine Datei aus der App heraus — der einzige Schreibweg nach draussen.
//
// **Warum ein eigenes Kommando und kein `<a download>`.** Der naheliegende Weg im Web ist
// ein Blob mit `download`-Attribut. Im WKWebView, den Tauri auf macOS benutzt, ist das
// unzuverlaessig: der Download landet je nach Fassung nirgends oder wortlos im
// Papierkorb-Verzeichnis des Webviews. Ein Export, von dem man nicht weiss, wo er liegt,
// ist keiner. Dieselbe Ueberlegung wie beim Datenbankzugang, der aus demselben Grund ueber
// eigene Kommandos laeuft statt ueber ein Plugin.
//
// **Wohin geschrieben wird, entscheidet NICHT der Aufrufer.** Ziel ist immer
// `<App-Datenverzeichnis>/export/`, und der Name muss ein einfacher Dateiname sein. Ein
// Webview, der irgendwohin schreiben darf, ist ein Webview, der ueberall hinschreiben
// kann — und was den Bestand liest, ist derselbe Prozess.
//
// **Es ueberschreibt.** Ein zweiter Export desselben Tages ersetzt den ersten. Das ist bei
// einer Momentaufnahme richtig: der neuere Stand ist der bessere, und eine Datei je Klick
// waere ein Verzeichnis, das niemand aufraeumt. Der Unterschied zu den Sicherungen ist die
// Absicht — dort ist der ALTE Stand der wertvolle.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Das Verzeichnis, in das exportiert wird — angelegt, falls es fehlt.
fn exportverzeichnis(app: &AppHandle) -> Result<PathBuf, String> {
    let basis = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Kein App-Datenverzeichnis: {e}"))?
        .join("export");
    std::fs::create_dir_all(&basis).map_err(|e| format!("Exportverzeichnis fehlt: {e}"))?;
    Ok(basis)
}

/// Prueft den Namen und weist alles ab, was wie ein Pfad aussieht.
///
/// Dieselbe Abwehr wie in `datenbank::datei_im_datenverzeichnis`, und aus demselben Grund
/// wortgleich streng: ein zurechtgebogener Pfad ist die Sorte Abwehr, die beim naechsten
/// Sonderzeichen nicht mehr traegt.
fn geprueft(name: &str) -> Result<&str, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.starts_with('.')
    {
        return Err(format!("'{name}' ist kein einfacher Dateiname."));
    }
    Ok(name)
}

/// Schreibt `inhalt` nach `<App-Datenverzeichnis>/export/<name>` und meldet den Pfad.
///
/// Der Pfad geht zurueck an die Oberflaeche, weil ein Export, dessen Ablageort man nicht
/// erfaehrt, den Benutzer suchen laesst — im Datenverzeichnis einer Tauri-App findet ihn
/// niemand von selbst.
#[tauri::command]
pub async fn export_schreiben(app: AppHandle, name: String, inhalt: String) -> Result<String, String> {
    let datei = exportverzeichnis(&app)?.join(geprueft(&name)?);
    std::fs::write(&datei, inhalt).map_err(|e| format!("Export nicht schreibbar: {e}"))?;
    Ok(datei.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::geprueft;

    #[test]
    fn nur_einfache_dateinamen_kommen_durch() {
        for gut in ["kategorien.json", "export-2026-08-30.json", "a"] {
            assert!(geprueft(gut).is_ok(), "'{gut}' sollte durchgehen.");
        }
        // Der Webview darf sich das Ziel nicht selbst aussuchen: er liest denselben
        // Bestand, den er sonst nirgendwohin tragen kann (siehe CSP).
        for boese in ["../heimlich.json", "/etc/passwd", "unter/pfad.json", ".versteckt", ""] {
            assert!(geprueft(boese).is_err(), "'{boese}' haette abgewiesen werden muessen.");
        }
    }
}
