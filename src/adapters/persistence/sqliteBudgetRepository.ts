// SQLite-Implementierung des BudgetRepository-Ports.
//
// Zwei Tabellen, EIN Aggregat: `budget` trägt, was sich nicht datiert ändert (Kategorie,
// Konto, Art, Start), `budget_betrag` die Reihe der Beträge mit dem Monat, ab dem sie
// gelten. Nach oben ist es weiterhin ein `Budget` — die Trennung sieht man nur an den
// Schreibwegen.
//
// `speichern` schreibt das Aggregat GANZ, Reihe eingeschlossen — wer ein Budget speichert,
// muss also die vollständige Reihe mitbringen (`budgetAnlegen` führt sie vorher zusammen).
//
// Dabei erst schreiben, dann das Überzählige entfernen, und nicht umgekehrt: es gibt hier
// keine Transaktion (tauri-plugin-sql holt je Statement eine Verbindung aus dem Pool,
// siehe `persistence/CLAUDE.md`). Ein Abbruch zwischen den Statements hinterlässt in
// dieser Reihenfolge höchstens eine Version zuviel — in der anderen eine Planungshistorie,
// die weg ist.
//
// `betragSpeichern`/`betragLoeschen` gibt es zusätzlich für die Arbeit an EINER Version,
// ohne den Rest des Budgets anzufassen.

import type { Budget, Budgetart, Budgetbetrag, Cent } from "../../core";
import type { BudgetRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  kategorie_id: string;
  konto_id: string;
  art: string;
  start: string;
}

interface Betragszeile {
  budget_id: string;
  ab_monat: string;
  betrag: number;
}

export const sqliteBudgetRepository: BudgetRepository = {
  async alle() {
    const db = await getDb();
    // Beide Tabellen in einem Rutsch und dann zusammengesetzt: eine Unterabfrage je
    // Budget wäre N+1, und die Reihe ist ohnehin klein.
    const [zeilen, betraege] = await Promise.all([
      db.select<Zeile[]>("SELECT id, kategorie_id, konto_id, art, start FROM budget"),
      db.select<Betragszeile[]>(
        "SELECT budget_id, ab_monat, betrag FROM budget_betrag ORDER BY budget_id, ab_monat",
      ),
    ]);
    const jeBudget = new Map<string, Budgetbetrag[]>();
    for (const b of betraege) {
      const liste = jeBudget.get(b.budget_id);
      const eintrag: Budgetbetrag = { abMonat: b.ab_monat, betrag: b.betrag as Cent };
      if (liste) liste.push(eintrag);
      else jeBudget.set(b.budget_id, [eintrag]);
    }
    return zeilen.map((z) => ({
      id: z.id,
      kategorieId: z.kategorie_id,
      kontoId: z.konto_id,
      betraege: jeBudget.get(z.id) ?? [],
      art: z.art as Budgetart,
      start: z.start,
    }));
  },

  async speichern(b: Budget) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO budget (id, kategorie_id, konto_id, art, start)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id, art = excluded.art, start = excluded.start`,
      [b.id, b.kategorieId, b.kontoId, b.art, b.start],
    );
    for (const v of b.betraege) {
      await db.execute(
        `INSERT INTO budget_betrag (budget_id, ab_monat, betrag) VALUES ($1,$2,$3)
         ON CONFLICT(budget_id, ab_monat) DO UPDATE SET betrag = excluded.betrag`,
        [b.id, v.abMonat, v.betrag],
      );
    }
    const behalten = b.betraege.map((v) => `'${v.abMonat.replace(/'/g, "''")}'`).join(",");
    await db.execute(
      behalten
        ? `DELETE FROM budget_betrag WHERE budget_id = $1 AND ab_monat NOT IN (${behalten})`
        : "DELETE FROM budget_betrag WHERE budget_id = $1",
      [b.id],
    );
  },

  async betragSpeichern(budgetId, betrag) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO budget_betrag (budget_id, ab_monat, betrag) VALUES ($1,$2,$3)
       ON CONFLICT(budget_id, ab_monat) DO UPDATE SET betrag = excluded.betrag`,
      [budgetId, betrag.abMonat, betrag.betrag],
    );
  },

  async betragLoeschen(budgetId, abMonat) {
    const db = await getDb();
    await db.execute("DELETE FROM budget_betrag WHERE budget_id = $1 AND ab_monat = $2", [
      budgetId,
      abMonat,
    ]);
  },

  async loeschen(id) {
    const db = await getDb();
    // Die Beträge hängen per CASCADE daran — im Test sind Fremdschlüssel aber AUS
    // (siehe `persistence/CLAUDE.md`), und eine verwaiste Reihe wäre dort unsichtbar.
    // Deshalb ausdrücklich zuerst.
    await db.execute("DELETE FROM budget_betrag WHERE budget_id = $1", [id]);
    await db.execute("DELETE FROM budget WHERE id = $1", [id]);
  },
};
