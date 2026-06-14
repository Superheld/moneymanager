// SQLite-Implementierung des BudgetRepository-Ports.

import type { Budget, BudgetPeriode } from "../../core";
import type { BudgetRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  kategorie_id: string;
  rahmen: number;
  periode: string;
}

export const sqliteBudgetRepository: BudgetRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT id, kategorie_id, rahmen, periode FROM budget",
    );
    return zeilen.map((z) => ({
      id: z.id,
      kategorieId: z.kategorie_id,
      rahmen: z.rahmen,
      periode: z.periode as BudgetPeriode,
    }));
  },
  async speichern(b: Budget) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO budget (id, kategorie_id, rahmen, periode) VALUES ($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET kategorie_id = excluded.kategorie_id,
         rahmen = excluded.rahmen, periode = excluded.periode`,
      [b.id, b.kategorieId, b.rahmen, b.periode],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM budget WHERE id = $1", [id]);
  },
};
