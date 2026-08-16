// SQLite-Implementierung der Kategorie-Festlegungen (Migration 24).
//
// Eine Zeile je Muster. Kleingeschrieben und getrimmt gespeichert, weil der Vergleich
// ohnehin ohne Groß-/Kleinschreibung läuft: stünde „[anonymisiert]" und „netflix" nebeneinander,
// wären das zwei Zeilen mit derselben Wirkung, von denen das Löschen der einen nichts
// ändert.

import type { Kategoriefestlegung } from "../../core";
import type { KategoriefestlegungRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  muster: string;
  kategorie_id: string;
  angelegt_am: string;
}

/** Die Form, in der ein Muster gespeichert und gesucht wird. */
function schluessel(muster: string): string {
  return muster.trim().toLowerCase();
}

export const sqliteKategoriefestlegungRepository: KategoriefestlegungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT muster, kategorie_id, angelegt_am FROM kategorie_festlegung ORDER BY muster",
    );
    return zeilen.map((z) => ({
      muster: z.muster,
      kategorieId: z.kategorie_id,
      angelegtAm: z.angelegt_am,
    }));
  },

  async speichern(f: Kategoriefestlegung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO kategorie_festlegung (muster, kategorie_id, angelegt_am) VALUES ($1, $2, $3)
       ON CONFLICT(muster) DO UPDATE SET kategorie_id = excluded.kategorie_id,
                                         angelegt_am  = excluded.angelegt_am`,
      [schluessel(f.muster), f.kategorieId, f.angelegtAm],
    );
  },

  async loeschen(muster: string) {
    const db = await getDb();
    await db.execute("DELETE FROM kategorie_festlegung WHERE muster = $1", [schluessel(muster)]);
  },
};
