// Der Zugangs-Port auf die Tauri-Kommandos.

import { invoke } from "@tauri-apps/api/core";
import type { ZugangPort, Zugangsstand } from "../../application/zugang";
import { DATEINAME } from "./datenbankdatei";
import { datenbankSchliessen, zugangVergessen } from "./db";

const datei = DATEINAME;

export const tauriZugangPort: ZugangPort = {
  stand: () => invoke<Zugangsstand>("zugang_stand", { datei }),
  einrichten: (passphrase) => invoke<string>("zugang_einrichten", { datei, passphrase }),
  entsperren: (passphrase) => invoke<boolean>("zugang_entsperren", { datei, passphrase }),
  mitCode: (code, neuePassphrase) =>
    invoke<boolean>("zugang_mit_code", { datei, code, neuePassphrase }),
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
