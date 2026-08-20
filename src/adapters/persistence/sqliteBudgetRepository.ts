// SQLite-Implementierung des BudgetRepository-Ports.

import type { Budget, Budgetart } from "../../core";
import type { BudgetRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  kategorie_id: string;
  konto_id: string;
  betrag_pro_monat: number;
  art: string;
  start: string;
}

export const sqliteBudgetRepository: BudgetRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT id, kategorie_id, konto_id, betrag_pro_monat, art, start FROM budget",
    );
    return zeilen.map((z) => ({
      id: z.id,
      kategorieId: z.kategorie_id,
      kontoId: z.konto_id,
      betragProMonat: z.betrag_pro_monat,
      art: z.art as Budgetart,
      start: z.start,
    }));
  },
  async speichern(b: Budget) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO budget (id, kategorie_id, konto_id, betrag_pro_monat, art, start)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id, betrag_pro_monat = excluded.betrag_pro_monat,
         art = excluded.art, start = excluded.start`,
      [b.id, b.kategorieId, b.kontoId, b.betragProMonat, b.art, b.start],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM budget WHERE id = $1", [id]);
  },
};
