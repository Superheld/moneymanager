// SQLite-Implementierung der Merkmalskonfiguration — was ins Training geht.
//
// Zwei Speicherorte für zwei verschiedene Dinge: die aktiven Herkünfte sind fünf Schalter
// und liegen in der Key/Value-Tabelle `einstellung` (genau ihr Zweck), die Ausschlussliste
// ist ein wachsender Datenbestand und hat eine eigene Tabelle mit einer Zeile je Wort.

import type { Merkmalsherkunft } from "../../core";
import type {
  GespeicherterAusschluss,
  MerkmalskonfigurationRepository,
} from "../../application/ports";
import { getDb } from "./db";

/** Schlüssel der aktiven Herkünfte in der Einstellungs-Tabelle. */
const SCHLUESSEL_HERKUENFTE = "merkmalsherkuenfte";

interface AusschlussZeile {
  wort: string;
  herkuenfte: string | null;
  quelle: string;
}

export const sqliteMerkmalskonfigurationRepository: MerkmalskonfigurationRepository = {
  async herkuenfteLesen() {
    const db = await getDb();
    const zeilen = await db.select<{ wert: string }[]>(
      "SELECT wert FROM einstellung WHERE schluessel = $1",
      [SCHLUESSEL_HERKUENFTE],
    );
    const wert = zeilen[0]?.wert;
    // Kein Eintrag heißt „nie gesetzt" und damit „Standard gilt". Ein LEERER Eintrag ist
    // dagegen eine Aussage: jemand hat alle Herkünfte abgeschaltet. Beides zu verwechseln
    // hieße, eine bewusste Entscheidung beim nächsten Start zu überschreiben.
    if (wert === undefined) return null;
    return wert ? (wert.split(",") as Merkmalsherkunft[]) : [];
  },

  async herkuenfteSetzen(herkuenfte) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO einstellung (schluessel, wert) VALUES ($1, $2)
       ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert`,
      [SCHLUESSEL_HERKUENFTE, herkuenfte.join(",")],
    );
  },

  async ausschluesseLesen() {
    const db = await getDb();
    const zeilen = await db.select<AusschlussZeile[]>(
      "SELECT wort, herkuenfte, quelle FROM merkmal_ausschluss ORDER BY wort",
    );
    return zeilen.map((z) => ({
      wort: z.wort,
      // NULL heißt „überall" — das Feld bleibt dann weg statt als leere Liste zu
      // erscheinen, die im Kern etwas anderes bedeuten würde.
      herkuenfte: z.herkuenfte ? (z.herkuenfte.split(",") as Merkmalsherkunft[]) : undefined,
      quelle: z.quelle === "manuell" ? "manuell" : "standard",
    }));
  },

  async ausschlussSetzen(a: GespeicherterAusschluss) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO merkmal_ausschluss (wort, herkuenfte, quelle) VALUES ($1, $2, $3)
       ON CONFLICT(wort) DO UPDATE SET herkuenfte = excluded.herkuenfte, quelle = excluded.quelle`,
      [a.wort.trim().toLowerCase(), a.herkuenfte?.length ? a.herkuenfte.join(",") : null, a.quelle],
    );
  },

  async ausschlussEntfernen(wort: string) {
    const db = await getDb();
    await db.execute("DELETE FROM merkmal_ausschluss WHERE wort = $1", [wort.trim().toLowerCase()]);
  },
};
