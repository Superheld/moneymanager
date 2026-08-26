// Der Sicherungs-Port auf die Tauri-Kommandos.
//
// Die Uhr sitzt hier, nicht im Use-Case: der Stichtag ist eine Beobachtung der Umwelt.

import { invoke } from "@tauri-apps/api/core";
import type { SicherungPort } from "../../application/sicherung";
import { DATEINAME } from "./datenbankdatei";

/** Der Stichtag von heute, in ORTSZEIT — nicht UTC.
 *
 * Wer abends um halb eins sichert, meint den Tag, den seine Uhr zeigt. Mit `toISOString`
 * wäre die Sicherung je nach Zeitzone die von morgen, und die Staffelung zählte Tage,
 * die es für den Nutzer nie gab. */
export function heute(jetzt: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())}`;
}

export const tauriSicherungPort: SicherungPort = {
  anlegen: (stichtag) => invoke<boolean>("sicherung_anlegen", { quelle: DATEINAME, stichtag }),
  auflisten: () => invoke<string[]>("sicherungen_auflisten", { quelle: DATEINAME }),
  entfernen: (stichtage) =>
    invoke<number>("sicherungen_entfernen", { quelle: DATEINAME, stichtage }),
};

/** Wo die Sicherungen liegen — für den Fall, dass jemand von Hand herangehen will. */
export function sicherungsordner(): Promise<string> {
  return invoke<string>("sicherungsordner");
}
