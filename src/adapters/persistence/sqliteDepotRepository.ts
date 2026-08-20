// SQLite für Depots (Migration 38).
//
// Drei Tabellen hinter einem Port: `depot` (was es ist), `depotwert` (die Reihe der
// Stichtagswerte) und `depotposition` (die Aufstellung je Stichtag). Sie werden immer
// zusammen gebraucht, deshalb ein Repository und nicht drei.
//
// Zur Spaltenwahl: `stueck`, `kurs` und `einstand_kurs` sind REAL, `wert` und
// `gesamtwert` sind INTEGER. Das ist kein Ausrutscher an der Cent-Regel, sondern ihre
// Anwendung — die Regel gilt für GELD. Eine Stückzahl ist eine Menge, ein Kurs ist eine
// Notierung; beide werden angezeigt, nie summiert.

import type { Depot, Depotposition, Depotwert } from "../../core";
import type { DepotRepository } from "../../application/ports";
import { getDb } from "./db";

interface DepotZeile {
  id: string;
  zugang_id: string;
  schluessel: string;
  bezeichnung: string;
  waehrung: string | null;
}

interface WertZeile {
  depot_id: string;
  stichtag: string;
  gesamtwert: number;
}

interface PositionZeile {
  depot_id: string;
  stichtag: string;
  kennung: string;
  isin: string | null;
  wkn: string | null;
  name: string | null;
  stueck: number | null;
  kurs: number | null;
  wert: number | null;
  waehrung: string | null;
  einstand_datum: string | null;
  einstand_kurs: number | null;
}

export const sqliteDepotRepository: DepotRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<DepotZeile[]>(
      `SELECT id, zugang_id, schluessel, bezeichnung, waehrung FROM depot ORDER BY bezeichnung`,
    );
    return zeilen.map((z) => ({
      id: z.id,
      zugangId: z.zugang_id,
      schluessel: z.schluessel,
      bezeichnung: z.bezeichnung,
      waehrung: z.waehrung ?? undefined,
    }));
  },

  async speichern(d: Depot) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO depot (id, zugang_id, schluessel, bezeichnung, waehrung)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET zugang_id   = excluded.zugang_id,
                                     schluessel  = excluded.schluessel,
                                     bezeichnung = excluded.bezeichnung,
                                     waehrung    = excluded.waehrung`,
      [d.id, d.zugangId, d.schluessel, d.bezeichnung, d.waehrung ?? null],
    );
  },

  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM depotposition WHERE depot_id = $1", [id]);
    await db.execute("DELETE FROM depotwert WHERE depot_id = $1", [id]);
    await db.execute("DELETE FROM depot WHERE id = $1", [id]);
  },

  async werte(depotId?: string) {
    const db = await getDb();
    const zeilen = depotId
      ? await db.select<WertZeile[]>(
          `SELECT depot_id, stichtag, gesamtwert FROM depotwert WHERE depot_id = $1 ORDER BY stichtag`,
          [depotId],
        )
      : await db.select<WertZeile[]>(
          `SELECT depot_id, stichtag, gesamtwert FROM depotwert ORDER BY depot_id, stichtag`,
        );
    return zeilen.map((z) => ({
      depotId: z.depot_id,
      stichtag: z.stichtag,
      gesamtwert: z.gesamtwert,
    }));
  },

  async wertSpeichern(w: Depotwert, erfasstAm: string) {
    const db = await getDb();
    // Ein zweiter Abruf desselben Tages überschreibt: die spätere Aussage der Bank ist
    // die genauere, und zwei Werte für denselben Stichtag wären keine Geschichte, sondern
    // ein Widerspruch.
    await db.execute(
      `INSERT INTO depotwert (depot_id, stichtag, gesamtwert, erfasst_am)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(depot_id, stichtag) DO UPDATE SET gesamtwert = excluded.gesamtwert,
                                                     erfasst_am = excluded.erfasst_am`,
      [w.depotId, w.stichtag, w.gesamtwert, erfasstAm],
    );
  },

  async positionen(depotId: string, stichtag?: string) {
    const db = await getDb();
    const zeilen = stichtag
      ? await db.select<PositionZeile[]>(
          `SELECT * FROM depotposition WHERE depot_id = $1 AND stichtag = $2 ORDER BY kennung`,
          [depotId, stichtag],
        )
      : await db.select<PositionZeile[]>(
          `SELECT * FROM depotposition WHERE depot_id = $1 ORDER BY stichtag, kennung`,
          [depotId],
        );
    return zeilen.map((z) => ({
      depotId: z.depot_id,
      stichtag: z.stichtag,
      kennung: z.kennung,
      isin: z.isin ?? undefined,
      wkn: z.wkn ?? undefined,
      name: z.name ?? undefined,
      stueck: z.stueck ?? undefined,
      kurs: z.kurs ?? undefined,
      wert: z.wert ?? undefined,
      waehrung: z.waehrung ?? undefined,
      einstandDatum: z.einstand_datum ?? undefined,
      einstandKurs: z.einstand_kurs ?? undefined,
    }));
  },

  async positionenErsetzen(depotId: string, stichtag: string, positionen: readonly Depotposition[]) {
    const db = await getDb();
    // Erst löschen, dann schreiben: eine Position, die im neuen Abruf fehlt, ist verkauft.
    // Nur einzufügen ergäbe ein Depot, das nur wachsen kann.
    await db.execute("DELETE FROM depotposition WHERE depot_id = $1 AND stichtag = $2", [
      depotId,
      stichtag,
    ]);
    for (const p of positionen) {
      await db.execute(
        `INSERT INTO depotposition (depot_id, stichtag, kennung, isin, wkn, name, stueck, kurs,
                                    wert, waehrung, einstand_datum, einstand_kurs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          depotId,
          stichtag,
          p.kennung,
          p.isin ?? null,
          p.wkn ?? null,
          p.name ?? null,
          p.stueck ?? null,
          p.kurs ?? null,
          p.wert ?? null,
          p.waehrung ?? null,
          p.einstandDatum ?? null,
          p.einstandKurs ?? null,
        ],
      );
    }
  },
};
