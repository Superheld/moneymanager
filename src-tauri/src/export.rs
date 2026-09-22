// Eine Datei aus der App heraus — der einzige Schreibweg nach draussen.
//
// **Warum ein eigenes Kommando und kein `<a download>`.** Der naheliegende Weg im Web ist
// ein Blob mit `download`-Attribut. Im WKWebView, den Tauri auf macOS benutzt, ist das
// unzuverlaessig: der Download landet je nach Fassung nirgends oder wortlos im
// Papierkorb-Verzeichnis des Webviews. Ein Export, von dem man nicht weiss, wo er liegt,
// ist keiner. Dieselbe Ueberlegung wie beim Datenbankzugang, der aus demselben Grund ueber
// eigene Kommandos laeuft statt ueber ein Plugin.
//
// **Wohin geschrieben wird, entscheidet NICHT der Aufrufer.** Ziel ist der
// DOWNLOAD-Ordner des Nutzers, und der Name muss ein einfacher Dateiname sein. Ein
// Webview, der irgendwohin schreiben darf, ist ein Webview, der ueberall hinschreiben
// kann — und was den Bestand liest, ist derselbe Prozess. Die Abwehr bleibt damit
// dieselbe; nur das Verzeichnis ist ein anderes.
//
// **Bis 2026-09-22 war es `<App-Datenverzeichnis>/export/`**, und das war die falsche
// Haelfte der richtigen Ueberlegung. Der Ort war sicher und unauffindbar: eine Exportdatei
// ist dazu da, WEITERGEGEBEN zu werden — an ein Tabellenprogramm, an den naechsten Rechner,
// in den Anhang einer Mail —, und dafuer muss man sie greifen koennen. Wer sie im
// App-Datenverzeichnis sucht, sucht in einem versteckten Pfad, dessen Namen nur die Karte
// kennt. Der Download-Ordner ist der Ort, an dem jedes andere Programm seine Dateien
// ablegt, und er gehoert dem Nutzer, nicht uns.
//
// Faellt er aus (kein Download-Ordner auffindbar), bleibt der alte Weg als Rueckfall — ein
// Export, der stattfindet und an einem unbequemen Ort landet, ist besser als keiner.
//
// **Es ueberschreibt.** Ein zweiter Export desselben Tages ersetzt den ersten. Das ist bei
// einer Momentaufnahme richtig: der neuere Stand ist der bessere, und eine Datei je Klick
// waere ein Verzeichnis, das niemand aufraeumt. Der Unterschied zu den Sicherungen ist die
// Absicht — dort ist der ALTE Stand der wertvolle.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Das Verzeichnis, in das exportiert wird — angelegt, falls es fehlt.
///
/// Der Download-Ordner ist der Ort, an dem der Nutzer eine Datei sucht; er existiert auf
/// jedem System, das uns interessiert, und muss deshalb im Normalfall nicht angelegt
/// werden. Der Rueckfall ins App-Datenverzeichnis ist fuer den Rest.
fn exportverzeichnis(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(download) = app.path().download_dir() {
        if std::fs::create_dir_all(&download).is_ok() {
            return Ok(download);
        }
    }
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

/// Schreibt `inhalt` in den Download-Ordner und meldet den vollen Pfad.
///
/// Der Pfad geht zurueck an die Oberflaeche, obwohl er jetzt an einem bekannten Ort liegt:
/// „im Download-Ordner" ist eine Auskunft, der genaue Name ist die, mit der man die Datei
/// auch findet, wenn dort dreihundert andere liegen.
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
