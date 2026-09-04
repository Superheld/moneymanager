// SQLite-Implementierung des RuecklagenRepository-Ports.

import type { Ruecklage } from "../../core";
import type { RuecklagenAusbuchung, RuecklagenRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  bezeichnung: string;
  ziel: number | null;
  frist_monate: number | null;
  rate: number | null;
  beginn: string;
  kategorie_id: string | null;
  konto_id: string | null;
}

interface AusbuchungsZeile {
  id: string;
  ruecklage_id: string;
  datum: string;
  betrag: number;
  istbuchung_id: string | null;
  notiz: string | null;
}

export const sqliteRuecklagenRepository: RuecklagenRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      "SELECT id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id FROM ruecklage ORDER BY bezeichnung",
    );
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      ziel: z.ziel ?? undefined,
      fristMonate: z.frist_monate ?? undefined,
      rate: z.rate ?? undefined,
      beginn: z.beginn,
      kategorieId: z.kategorie_id ?? undefined,
      kontoId: z.konto_id ?? undefined,
    }));
  },
  async speichern(r: Ruecklage) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ruecklage (id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung,
         ziel = excluded.ziel, frist_monate = excluded.frist_monate, rate = excluded.rate,
         beginn = excluded.beginn, kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id`,
      [r.id, r.bezeichnung, r.ziel ?? null, r.fristMonate ?? null, r.rate ?? null, r.beginn, r.kategorieId ?? null, r.kontoId ?? null],
    );
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM ruecklage WHERE id = $1", [id]);
  },
  async ausbuchungSpeichern(a: RuecklagenAusbuchung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ruecklage_ausbuchung (id, ruecklage_id, datum, betrag, istbuchung_id, notiz)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         istbuchung_id = excluded.istbuchung_id, notiz = excluded.notiz`,
      [a.id, a.ruecklageId, a.datum, a.betrag, a.istbuchungId ?? null, a.notiz ?? null],
    );
  },
  async ausbuchungen() {
    const db = await getDb();
    const zeilen = await db.select<AusbuchungsZeile[]>(
      "SELECT id, ruecklage_id, datum, betrag, istbuchung_id, notiz FROM ruecklage_ausbuchung ORDER BY datum DESC",
    );
    return zeilen.map((z) => ({
      id: z.id,
      ruecklageId: z.ruecklage_id,
      datum: z.datum,
      betrag: z.betrag,
      istbuchungId: z.istbuchung_id ?? undefined,
      notiz: z.notiz ?? undefined,
    }));
  },
};
