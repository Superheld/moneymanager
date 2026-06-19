// SQLite-Implementierung des EinstellungenRepository-Ports (ADR-0004).
// Key/Value in der Tabelle `einstellung`; Upsert pro Schlüssel.

import type { EinstellungenRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  schluessel: string;
  wert: string;
}

export const sqliteEinstellungenRepository: EinstellungenRepository = {
  async lesen() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>("SELECT schluessel, wert FROM einstellung");
    const out: Record<string, string> = {};
    for (const z of zeilen) out[z.schluessel] = z.wert;
    return out;
  },
  async schreiben(schluessel, wert) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO einstellung (schluessel, wert) VALUES ($1,$2)
       ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert`,
      [schluessel, wert],
    );
  },
};
