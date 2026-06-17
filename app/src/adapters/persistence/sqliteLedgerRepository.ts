// SQLite-Implementierung des Ledger-Ports (ADR-0002) — das app-seitige Ist-Journal.
// planRef wird auf zwei Spalten abgebildet (plan_quelle_id, plan_faelligkeit); ein
// UNIQUE-Index darauf erzwingt 1:1-Matching. Später dockt hier der Bankimport an.

import type { Charakter, IstBuchung, IstQuelle } from "../../core";
import type { LedgerPort } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  datum: string;
  betrag: number;
  konto_id: string;
  kategorie_id: string | null;
  charakter: string;
  quelle: string;
  plan_quelle_id: string | null;
  plan_faelligkeit: string | null;
  roh_hash: string | null;
}

export const sqliteLedgerRepository: LedgerPort = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, datum, betrag, konto_id, kategorie_id, charakter, quelle,
              plan_quelle_id, plan_faelligkeit, roh_hash
         FROM ist_buchung ORDER BY datum`,
    );
    return zeilen.map(
      (z): IstBuchung => ({
        id: z.id,
        datum: z.datum,
        betrag: z.betrag,
        kontoId: z.konto_id,
        kategorieId: z.kategorie_id ?? undefined,
        charakter: z.charakter as Charakter,
        quelle: z.quelle as IstQuelle,
        planRef:
          z.plan_quelle_id && z.plan_faelligkeit
            ? { quelleId: z.plan_quelle_id, faelligkeit: z.plan_faelligkeit }
            : undefined,
        rohHash: z.roh_hash ?? undefined,
      }),
    );
  },
  async speichern(b: IstBuchung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ist_buchung
         (id, datum, betrag, konto_id, kategorie_id, charakter, quelle, plan_quelle_id, plan_faelligkeit, roh_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         konto_id = excluded.konto_id, kategorie_id = excluded.kategorie_id,
         charakter = excluded.charakter, quelle = excluded.quelle,
         plan_quelle_id = excluded.plan_quelle_id, plan_faelligkeit = excluded.plan_faelligkeit,
         roh_hash = excluded.roh_hash`,
      [
        b.id,
        b.datum,
        b.betrag,
        b.kontoId,
        b.kategorieId ?? null,
        b.charakter,
        b.quelle,
        b.planRef?.quelleId ?? null,
        b.planRef?.faelligkeit ?? null,
        b.rohHash ?? null,
      ],
    );
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM ist_buchung WHERE id = $1", [id]);
  },
};
