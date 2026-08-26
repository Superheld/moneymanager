// Sicherungskopien der Datenbank — anlegen, auflisten, entfernen.
//
// **Warum `VACUUM INTO` und nicht Kopieren.** Eine Datei zu kopieren, während die App
// läuft, liefert einen Stand OHNE das Write-Ahead-Log: die jüngsten Schreibvorgänge
// stehen dort und nicht in der Hauptdatei. Das Ergebnis sieht vollständig aus und ist es
// nicht — die schlechteste Art, eine Sicherung zu verlieren, weil man es erst beim
// Wiederherstellen merkt. `VACUUM INTO` schreibt einen konsistenten, kompakten Stand aus
// der laufenden Verbindung und kennt das WAL.
//
// **Was hier NICHT entschieden wird.** Welche Sicherungen bleiben, rechnet der Kern
// (`core/sicherung/rotation.ts`). Hier steht nur das Dateisystem: anlegen, auflisten,
// wegwerfen. Der Grund ist derselbe wie überall in diesem Projekt — eine Regel, die im
// Adapter steht, lässt sich nicht ohne Dateien testen.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};

/// Unterhalb des App-Datenverzeichnisses, damit die Sicherungen nicht zwischen den
/// laufenden Datenbankdateien liegen — dort sind sie schon einmal übersehen worden.
const ORDNER: &str = "sicherungen";

fn verzeichnis(app: &AppHandle) -> Result<PathBuf, String> {
    let basis = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Kein App-Datenverzeichnis: {e}"))?;
    let pfad = basis.join(ORDNER);
    fs::create_dir_all(&pfad).map_err(|e| format!("Sicherungsordner nicht anlegbar: {e}"))?;
    Ok(pfad)
}

/// `moneymanager.db` + `2026-08-26` -> `moneymanager-2026-08-26.db`
///
/// Der Name der Quelldatei steckt mit drin, damit Spielstand und echter Bestand
/// nebeneinander liegen können, ohne sich zu überschreiben.
fn dateiname(quelle: &str, stichtag: &str) -> String {
    let stamm = quelle.strip_suffix(".db").unwrap_or(quelle);
    format!("{stamm}-{stichtag}.db")
}

/// Aus `moneymanager-2026-08-26.db` wieder `2026-08-26` — oder `None`, wenn die Datei
/// nicht von uns stammt.
fn stichtag_aus(name: &str, quelle: &str) -> Option<String> {
    let stamm = quelle.strip_suffix(".db").unwrap_or(quelle);
    let rest = name.strip_prefix(stamm)?.strip_prefix('-')?.strip_suffix(".db")?;
    // Genau `YYYY-MM-DD`. Alles andere ist eine fremde Datei, die uns nichts angeht —
    // und die wir vor allem nicht löschen dürfen.
    let ziffern_und_striche = rest.len() == 10
        && rest.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() }
        });
    ziffern_und_striche.then(|| rest.to_string())
}

/// Legt die Sicherung des Tages an, falls es sie noch nicht gibt.
///
/// Gibt `true` zurück, wenn tatsächlich geschrieben wurde. Eine vorhandene Sicherung
/// wird NICHT überschrieben: wer die App am selben Tag zum dritten Mal startet, soll den
/// Stand von heute früh behalten und nicht den von eben — die frühere Fassung ist die,
/// die eine inzwischen kaputtgegangene Änderung noch nicht enthält.
#[tauri::command]
pub async fn sicherung_anlegen(
    app: AppHandle,
    db: String,
    quelle: String,
    stichtag: String,
    instanzen: State<'_, DbInstances>,
) -> Result<bool, String> {
    let ziel = verzeichnis(&app)?.join(dateiname(&quelle, &stichtag));
    if ziel.exists() {
        return Ok(false);
    }

    let instanzen = instanzen.0.read().await;
    let pool = instanzen
        .get(&db)
        .ok_or_else(|| format!("Datenbank '{db}' ist nicht geöffnet"))?;

    #[allow(irrefutable_let_patterns)]
    let DbPool::Sqlite(pool) = pool else {
        return Err("Nur SQLite wird unterstützt".to_string());
    };

    let ziel_text = ziel.to_string_lossy().to_string();
    sqlx::query("VACUUM INTO ?")
        .bind(&ziel_text)
        .execute(pool)
        .await
        .map_err(|e| format!("Sicherung fehlgeschlagen: {e}"))?;

    Ok(true)
}

/// Die Stichtage der vorhandenen Sicherungen, unsortiert.
#[tauri::command]
pub fn sicherungen_auflisten(app: AppHandle, quelle: String) -> Result<Vec<String>, String> {
    let pfad = verzeichnis(&app)?;
    let Ok(eintraege) = fs::read_dir(&pfad) else {
        return Ok(vec![]);
    };
    Ok(eintraege
        .flatten()
        .filter_map(|e| stichtag_aus(&e.file_name().to_string_lossy(), &quelle))
        .collect())
}

/// Entfernt genau die genannten Stichtage. Gibt zurück, wie viele Dateien weg sind.
///
/// Nimmt Stichtage und keine Pfade: ein Kommando, das einen Pfad aus dem Webview
/// entgegennimmt und löscht, wäre ein Löschbefehl für alles, was der Nutzer erreichen
/// kann. Hier kann nur weg, was dem Namensschema entspricht und in diesem einen Ordner
/// liegt.
#[tauri::command]
pub fn sicherungen_entfernen(
    app: AppHandle,
    quelle: String,
    stichtage: Vec<String>,
) -> Result<usize, String> {
    let pfad = verzeichnis(&app)?;
    let mut weg = 0;
    for stichtag in stichtage {
        // Über denselben Weg zurück, den das Auflisten nimmt — ein Stichtag, der das
        // Schema nicht erfüllt, erzeugt gar keinen Dateinamen.
        let name = dateiname(&quelle, &stichtag);
        if stichtag_aus(&name, &quelle).as_deref() != Some(stichtag.as_str()) {
            continue;
        }
        if fs::remove_file(pfad.join(&name)).is_ok() {
            weg += 1;
        }
    }
    Ok(weg)
}

/// Wo die Sicherungen liegen — für den Fall, dass jemand von Hand herangehen will.
#[tauri::command]
pub fn sicherungsordner(app: AppHandle) -> Result<String, String> {
    Ok(verzeichnis(&app)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baut_den_dateinamen_aus_quelle_und_stichtag() {
        assert_eq!(dateiname("moneymanager.db", "2026-08-26"), "moneymanager-2026-08-26.db");
        assert_eq!(
            dateiname("moneymanager-dev.db", "2026-08-26"),
            "moneymanager-dev-2026-08-26.db"
        );
    }

    #[test]
    fn liest_den_stichtag_zurueck() {
        let n = dateiname("moneymanager.db", "2026-08-26");
        assert_eq!(stichtag_aus(&n, "moneymanager.db").as_deref(), Some("2026-08-26"));
    }

    #[test]
    fn haelt_spielstand_und_echten_bestand_auseinander() {
        // Der Spielstand-Name beginnt mit dem echten — ohne den Trennstrich waere
        // `moneymanager-dev-2026-08-26.db` eine Sicherung von `moneymanager.db`
        // mit dem Stichtag `dev-2026-08-26`. Sie wuerde beim Aufraeumen des echten
        // Bestands nicht wiedererkannt und faellt sonst durch jedes Raster.
        let spielstand = dateiname("moneymanager-dev.db", "2026-08-26");
        assert_eq!(stichtag_aus(&spielstand, "moneymanager.db"), None);
        assert_eq!(
            stichtag_aus(&spielstand, "moneymanager-dev.db").as_deref(),
            Some("2026-08-26")
        );
    }

    #[test]
    fn weist_fremde_dateien_ab() {
        for name in [
            "moneymanager.db",
            "moneymanager-.db",
            "moneymanager-2026-08.db",
            "moneymanager-2026-08-26.db-wal",
            "moneymanager-heute.db",
            "moneymanager-2026-8-26.db",
            "fremd-2026-08-26.db",
        ] {
            assert_eq!(stichtag_aus(name, "moneymanager.db"), None, "{name}");
        }
    }
}
