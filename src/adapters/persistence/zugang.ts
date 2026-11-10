// Der Zugangs-Port auf die Tauri-Kommandos.

import { invoke } from "@tauri-apps/api/core";
import type { ZugangPort, Zugangsstand } from "../../application/zugang";
import { DATEINAME } from "./datenbankdatei";
import { datenbankSchliessen, zugangVergessen } from "./db";

const datei = DATEINAME;

/**
 * Nach jeder gelungenen Öffnung den gemerkten Zugang vergessen.
 *
 * Damit laufen Tagessicherung und Migrationen je Öffnung — und eine Zusage, die zwischen
 * Sperren und Entsperren gescheitert ist, überlebt das Entsperren nicht (siehe `getDb`).
 */
async function geoeffnet<T>(ergebnis: Promise<T>, gelungen: (wert: T) => boolean): Promise<T> {
  const wert = await ergebnis;
  if (gelungen(wert)) zugangVergessen();
  return wert;
}

export const tauriZugangPort: ZugangPort = {
  stand: () => invoke<Zugangsstand>("zugang_stand", { datei }),
  einrichten: (passphrase) =>
    geoeffnet(invoke<string>("zugang_einrichten", { datei, passphrase }), () => true),
  entsperren: (passphrase) =>
    geoeffnet(invoke<boolean>("zugang_entsperren", { datei, passphrase }), (ok) => ok),
  mitCode: (code, neuePassphrase) =>
    geoeffnet(invoke<boolean>("zugang_mit_code", { datei, code, neuePassphrase }), (ok) => ok),
  passphraseWechseln: (alte, neue) =>
    invoke<boolean>("zugang_passphrase_wechseln", { datei, alte, neue }),
  codeZeigen: (passphrase) => invoke<string | null>("zugang_code_zeigen", { datei, passphrase }),

  // **Beides zusammen, nie einzeln.** Rust schliesst den Pool, und der gemerkte Zugang in
  // `db.ts` muss mit — sonst gäbe `getDb()` weiter die zwischengespeicherte Zusage
  // zurück, und der nächste Zugriff liefe gegen eine geschlossene Datenbank statt in den
  // Sperrbildschirm.
  sperren: async () => {
    await datenbankSchliessen();
    zugangVergessen();
  },
};
