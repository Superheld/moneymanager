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
  konto_id: string | null;
  kategorie_id: string | null;
  vertrag_id: string | null;
}

function zuRegel(z: Zeile): Zahlungsregel {
  return {
    id: z.id,
    bezeichnung: z.bezeichnung,
    betrag: z.betrag,
    rhythmus: z.rhythmus as Rhythmus,
    startdatum: z.startdatum,
    charakter: z.charakter as Charakter,
    kontoId: z.konto_id ?? undefined,
    kategorieId: z.kategorie_id ?? undefined,
    vertragId: z.vertrag_id ?? undefined,
  };
}

export const sqliteZahlungsregelRepository: ZahlungsregelRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, bezeichnung, betrag, rhythmus, startdatum, charakter, konto_id, kategorie_id, vertrag_id
       FROM zahlungsregel ORDER BY startdatum`,
    );
    return zeilen.map(zuRegel);
  },

  async speichern(regel) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, konto_id, kategorie_id, vertrag_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(id) DO UPDATE SET
         bezeichnung  = excluded.bezeichnung,
         betrag       = excluded.betrag,
         rhythmus     = excluded.rhythmus,
         startdatum   = excluded.startdatum,
         charakter    = excluded.charakter,
         konto_id     = excluded.konto_id,
         kategorie_id = excluded.kategorie_id,
         vertrag_id   = excluded.vertrag_id`,
      [
        regel.id,
        regel.bezeichnung,
        regel.betrag,
        regel.rhythmus,
        regel.startdatum,
        regel.charakter,
        regel.kontoId ?? null,
        regel.kategorieId ?? null,
        regel.vertragId ?? null,
      ],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM zahlungsregel WHERE id = $1", [id]);
  },
};
