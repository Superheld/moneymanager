// Der Updater-Port auf `tauri-plugin-updater`.
//
// Warum überhaupt ein Adapter für zwei Funktionsaufrufe: die Oberfläche darf `application/`
// kennen und sonst nichts, und `application/` darf keine Shell kennen. Ohne diese Naht
// stünde ein Tauri-Import in der Seitenleiste — und wäre im jsdom-Test nicht zu ersetzen.
//
// **Nur in der Shell.** Läuft die Web-App ohne Tauri (`npm run dev`, Tests), gibt es keinen
// Updater. Dann liegt eben nichts bereit; das ist die richtige Antwort und kein Sonderfall,
// den jemand behandeln müsste.

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Aktualisierung, AktualisierungPort } from "../application/aktualisierung";

/**
 * Läuft dieser Code in der Tauri-Shell?
 *
 * Dieselbe Prüfung wie in `persistence/transaktion.ts` und aus demselben Grund: geprüft
 * wird die UMGEBUNG, nicht der Import — der Import gelingt auch dort, wo der Aufruf
 * scheitert.
 */
function inTauri(): boolean {
  return typeof globalThis === "object" && "__TAURI_INTERNALS__" in globalThis;
}

/**
 * Was der Updater beim Prüfen zurückgibt — festgehalten, damit `einspielen` nicht ein
 * zweites Mal fragen muss.
 *
 * Ein zweiter `check()` wäre nicht nur eine überflüssige Runde: zwischen Klick und Abruf
 * könnte eine ANDERE Fassung erschienen sein, und dann installierte man etwas, das der
 * Knopf nie angekündigt hat.
 */
let bereit: Awaited<ReturnType<typeof check>> | null = null;

export const tauriAktualisierung: AktualisierungPort = {
  async pruefen(): Promise<Aktualisierung | null> {
    if (!inTauri()) return null;
    bereit = await check();
    if (!bereit) return null;
    return {
      version: bereit.version,
      hinweis: bereit.body || undefined,
      erschienen: bereit.date || undefined,
    };
  },

  async einspielen(): Promise<void> {
    if (!bereit) {
      // Kein Zustand da: entweder wurde nie geprüft, oder die Prüfung sagte „nichts Neues".
      // Beides ist ein Programmierfehler an der Aufrufstelle, kein Betriebsfall.
      throw new Error("Es liegt keine geprüfte Aktualisierung vor.");
    }
    await bereit.downloadAndInstall();
    // Ab hier kommt die App nicht zurück. `relaunch` ersetzt den laufenden Prozess durch
    // die eingespielte Fassung — ohne das läuft nach dem Update weiter der alte Stand,
    // und der Knopf bliebe stehen.
    await relaunch();
  },
};
