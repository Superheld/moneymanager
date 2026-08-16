// SQLite-Implementierung des TopfRepository-Ports. Eine Tabelle mit typ-Spalte und
// nullbaren typ-spezifischen Feldern; Mapping je Topf-Typ.
//
// Die Spalten `wiederbeschaffung`, `nutzungsdauer_monate` und `inventar_id` stammen vom
// entfallenen Ersatz-Topf. Sie bleiben im Schema stehen (forward-only), werden aber weder
// gelesen noch geschrieben; `alle()` filtert Altbestand vom Typ „ersatz" heraus.

import type { Topf, TopfTyp } from "../../core";
import type { TopfRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  typ: string;
  bezeichnung: string;
  start: string;
  kategorie_id: string | null;
  schaetzbetrag: number | null;
  frist_monate: number | null;
  zufuehrung_pro_monat: number | null;
  sparziel: number | null;
}

function zuTopf(z: Zeile): Topf {
  const basis = {
    id: z.id,
    bezeichnung: z.bezeichnung,
    start: z.start,
    kategorieId: z.kategorie_id ?? undefined,
  };
  switch (z.typ as TopfTyp) {
    case "puffer":
      return { ...basis, typ: "puffer", schaetzbetrag: z.schaetzbetrag ?? 0, fristMonate: z.frist_monate ?? 1 };
    case "spartopf":
      return { ...basis, typ: "spartopf", zufuehrungProMonat: z.zufuehrung_pro_monat ?? 0, sparziel: z.sparziel ?? undefined };
  }
}

export const sqliteTopfRepository: TopfRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, typ, bezeichnung, start, kategorie_id,
              schaetzbetrag, frist_monate, zufuehrung_pro_monat, sparziel
       FROM topf WHERE typ IN ('puffer','spartopf') ORDER BY bezeichnung`,
    );
    return zeilen.map(zuTopf);
  },

  async speichern(t: Topf) {
    const db = await getDb();
    const sb = t.typ === "puffer" ? t.schaetzbetrag : null;
    const fr = t.typ === "puffer" ? t.fristMonate : null;
    const zu = t.typ === "spartopf" ? t.zufuehrungProMonat : null;
    const sz = t.typ === "spartopf" ? t.sparziel ?? null : null;
    await db.execute(
      `INSERT INTO topf (id, typ, bezeichnung, start, kategorie_id,
         schaetzbetrag, frist_monate, zufuehrung_pro_monat, sparziel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET typ = excluded.typ, bezeichnung = excluded.bezeichnung,
         start = excluded.start, kategorie_id = excluded.kategorie_id,
         schaetzbetrag = excluded.schaetzbetrag, frist_monate = excluded.frist_monate,
         zufuehrung_pro_monat = excluded.zufuehrung_pro_monat, sparziel = excluded.sparziel`,
      [t.id, t.typ, t.bezeichnung, t.start, t.kategorieId ?? null, sb, fr, zu, sz],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM topf WHERE id = $1", [id]);
  },
};
