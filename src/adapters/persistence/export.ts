// Das Exportziel auf das Tauri-Kommando.
//
// Der Use-Case übergibt einen Dateinamen, das Kommando entscheidet über das Verzeichnis
// (`<App-Datenverzeichnis>/export/`) und meldet den vollen Pfad zurück. Diese Aufteilung
// ist Absicht: ein Use-Case, der ein Verzeichnis benennt, hätte eine Meinung über das
// Dateisystem, und ein Webview, der eines aussuchen darf, könnte überall hinschreiben.

import { invoke } from "@tauri-apps/api/core";
import type { ExportZiel } from "../../application/konfiguration";

export const tauriExportZiel: ExportZiel = {
  schreiben: (name, inhalt) => invoke<string>("export_schreiben", { name, inhalt }),
};
