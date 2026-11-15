// SQLite-Implementierung des RuecklagenzuordnungRepository-Ports (Migration 79).
//
// Im Umbau: noch von keinem Use-Case benutzt und deshalb in `dienste.ts` nicht verdrahtet.
// Was die Tabelle trägt und warum sie eine eigene ist, steht an der Migration.

import type { Ruecklagenzuordnung, RuecklagenzuordnungRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  istbuchung_id: string;
  kategorie_id: string | null;
  ruecklage_id: string | null;
}

export const sqliteRuecklagenzuordnungRepository: RuecklagenzuordnungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT istbuchung_id, kategorie_id, ruecklage_id FROM ruecklage_zuordnung ORDER BY istbuchung_id, kategorie_id",
    );
    return zeilen.map(
      (z): Ruecklagenzuordnung => ({
        istbuchungId: z.istbuchung_id,
        kategorieId: z.kategorie_id ?? undefined,
        ruecklageId: z.ruecklage_id ?? undefined,
      }),
    );
  },

  async setzen(z: Ruecklagenzuordnung) {
    const db = await getDb();
    // REPLACE und kein `ON CONFLICT(...) DO UPDATE`: der eindeutige Schlüssel ist ein
    // Ausdruck (`IFNULL(kategorie_id, '')`), und REPLACE greift bei jedem eindeutigen
    // Index, ohne ihn nennen zu müssen. Ersetzt wird dabei genau die eine Zeile desselben
    // Anteils — mehr kann es nach dem Index nicht geben.
    await db.execute(
      "INSERT OR REPLACE INTO ruecklage_zuordnung (istbuchung_id, kategorie_id, ruecklage_id) VALUES ($1,$2,$3)",
      [z.istbuchungId, z.kategorieId ?? null, z.ruecklageId ?? null],
    );
  },

  async entfernen(istbuchungId: string, kategorieId?: string) {
    const db = await getDb();
    // Über denselben Ausdruck wie der Index: `kategorie_id = NULL` träfe nie etwas.
    await db.execute(
      "DELETE FROM ruecklage_zuordnung WHERE istbuchung_id = $1 AND IFNULL(kategorie_id, '') = $2",
      [istbuchungId, kategorieId ?? ""],
    );
  },
};
