// SQLite-Implementierung des InventarRepository-Ports.

import type { Inventargegenstand } from "../../core";
import type { InventarRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  bezeichnung: string;
  wiederbeschaffung: number;
  nutzungsdauer_monate: number;
  anschaffung: string;
  kategorie_id: string | null;
  konto_id: string | null;
}

export const sqliteInventarRepository: InventarRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT id, bezeichnung, wiederbeschaffung, nutzungsdauer_monate, anschaffung, kategorie_id, konto_id FROM inventargegenstand ORDER BY bezeichnung",
    );
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      wiederbeschaffung: z.wiederbeschaffung,
      nutzungsdauerMonate: z.nutzungsdauer_monate,
      anschaffung: z.anschaffung,
      kategorieId: z.kategorie_id ?? undefined,
      kontoId: z.konto_id ?? undefined,
    }));
  },
  async speichern(g: Inventargegenstand) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO inventargegenstand (id, bezeichnung, wiederbeschaffung, nutzungsdauer_monate, anschaffung, kategorie_id, konto_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung,
         wiederbeschaffung = excluded.wiederbeschaffung, nutzungsdauer_monate = excluded.nutzungsdauer_monate,
         anschaffung = excluded.anschaffung, kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id`,
      [g.id, g.bezeichnung, g.wiederbeschaffung, g.nutzungsdauerMonate, g.anschaffung, g.kategorieId ?? null, g.kontoId ?? null],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM inventargegenstand WHERE id = $1", [id]);
  },
};
