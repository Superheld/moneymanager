// SQLite-Implementierung des ZahlungsregelRepository-Ports.
// Übersetzt zwischen Datenbankzeilen und dem Core-Aggregat.

import type { Charakter, Rhythmus, Zahlungsregel } from "../../core";
import type { ZahlungsregelRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  bezeichnung: string;
  betrag: number;
  rhythmus: string;
  startdatum: string;
  charakter: string;
}

function zuRegel(z: Zeile): Zahlungsregel {
  return {
    id: z.id,
    bezeichnung: z.bezeichnung,
    betrag: z.betrag,
    rhythmus: z.rhythmus as Rhythmus,
    startdatum: z.startdatum,
    charakter: z.charakter as Charakter,
  };
}

export const sqliteZahlungsregelRepository: ZahlungsregelRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT id, bezeichnung, betrag, rhythmus, startdatum, charakter FROM zahlungsregel ORDER BY startdatum",
    );
    return zeilen.map(zuRegel);
  },

  async speichern(regel) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         bezeichnung = excluded.bezeichnung,
         betrag      = excluded.betrag,
         rhythmus    = excluded.rhythmus,
         startdatum  = excluded.startdatum,
         charakter   = excluded.charakter`,
      [regel.id, regel.bezeichnung, regel.betrag, regel.rhythmus, regel.startdatum, regel.charakter],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM zahlungsregel WHERE id = $1", [id]);
  },
};
