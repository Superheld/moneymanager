// Der Beta-Kanal des Updaters.
//
// Das JS-Plugin (`check()`) kennt nur die Endpunkte aus tauri.conf.json und nimmt keinen
// anderen an. Der normale Weg bleibt deshalb unangetastet und läuft weiter dort; dieses
// Kommando gibt es allein für den Fall, dass jemand Betaversionen eingeschaltet hat. So
// hängt an dieser Datei keine einzige Installation, die den Schalter nicht umgelegt hat.
//
// Zurück kommt dieselbe Form wie aus dem Plugin, samt Ressource: das JS-`Update` darauf
// lädt, prüft die Signatur und installiert genau wie sonst. Hier wird nur der Ort
// gewählt, an dem nachgesehen wird — geprüft wird gegen denselben öffentlichen Schlüssel.

use serde::Serialize;
use tauri::{Manager, ResourceId, Runtime, Url, Webview};
use tauri_plugin_updater::UpdaterExt;

/// Das Manifest des Kanals. Der Release-Workflow schreibt es bei JEDEM Release fort, auch
/// bei einem normalen: der Updater nimmt die erste Antwort, die er bekommt. Läge hier nur
/// die letzte Beta, käme niemand mehr von ihr herunter, sobald die fertige Fassung da ist.
const BETA_ENDPUNKT: &str =
    "https://github.com/Superheld/moneymanager/releases/download/beta-kanal/latest.json";

/// Rückfall, wenn das Manifest des Kanals nicht zu holen ist: dann gilt der normale Weg.
const NORMALER_ENDPUNKT: &str =
    "https://github.com/Superheld/moneymanager/releases/latest/download/latest.json";

/// Dieselbe Form wie `UpdateMetadata` im JS-Plugin.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bereitliegend {
    rid: ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[tauri::command]
pub async fn aktualisierung_beta<R: Runtime>(
    webview: Webview<R>,
) -> Result<Option<Bereitliegend>, String> {
    let endpunkte = [BETA_ENDPUNKT, NORMALER_ENDPUNKT]
        .iter()
        .map(|e| Url::parse(e))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let updater = webview
        .updater_builder()
        .endpoints(endpunkte)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };

    Ok(Some(Bereitliegend {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        // Roh aus dem Manifest: das Datum wird nur durchgereicht, und das Plugin rechnet
        // es sonst über eine eigene Abhängigkeit in genau diese Form zurück.
        date: update
            .raw_json
            .get("pub_date")
            .and_then(|d| d.as_str())
            .map(str::to_owned),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beide_endpunkte_sind_gueltige_https_adressen() {
        for e in [BETA_ENDPUNKT, NORMALER_ENDPUNKT] {
            assert_eq!(Url::parse(e).unwrap().scheme(), "https");
        }
    }
}
