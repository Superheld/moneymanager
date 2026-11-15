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
  beendet_am: string | null;
}

interface AusbuchungsZeile {
  id: string;
  ruecklage_id: string;
  datum: string;
  betrag: number;
  istbuchung_id: string | null;
  notiz: string | null;
  zyklus_beginn: string | null;
  zyklus_ziel: number | null;
  zyklus_frist: number | null;
  zyklus_rate: number | null;
  bezeichnung: string | null;
  kategorie_id: string | null;
}

export const sqliteRuecklagenRepository: RuecklagenRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      // Beendete (freie, ausgebuchte) Rücklagen bleiben in der Tabelle, sind aber für jede
      // laufende Rechnung nicht mehr da: keine Rate, kein Anspruch auf ein Konto, kein
      // Eintrag in der Liste. Der Filter steht HIER, damit kein Aufrufer ihn vergessen
      // kann; ihre Geschichte kommt über `ausbuchungen()`.
      "SELECT id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id, beendet_am FROM ruecklage WHERE beendet_am IS NULL ORDER BY bezeichnung",
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
      `INSERT INTO ruecklage (id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id, beendet_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung,
         ziel = excluded.ziel, frist_monate = excluded.frist_monate, rate = excluded.rate,
         beginn = excluded.beginn, kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id, beendet_am = excluded.beendet_am`,
      [r.id, r.bezeichnung, r.ziel ?? null, r.fristMonate ?? null, r.rate ?? null, r.beginn, r.kategorieId ?? null, r.kontoId ?? null, r.beendetAm ?? null],
    );
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM ruecklage WHERE id = $1", [id]);
  },
  async ausbuchungSpeichern(a: RuecklagenAusbuchung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ruecklage_ausbuchung
         (id, ruecklage_id, datum, betrag, istbuchung_id, notiz, zyklus_beginn, zyklus_ziel, zyklus_frist, zyklus_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         istbuchung_id = excluded.istbuchung_id, notiz = excluded.notiz,
         zyklus_beginn = excluded.zyklus_beginn, zyklus_ziel = excluded.zyklus_ziel,
         zyklus_frist = excluded.zyklus_frist, zyklus_rate = excluded.zyklus_rate`,
      [
        a.id, a.ruecklageId, a.datum, a.betrag, a.istbuchungId ?? null, a.notiz ?? null,
        a.zyklusBeginn ?? null, a.zyklusZiel ?? null, a.zyklusFrist ?? null, a.zyklusRate ?? null,
      ],
    );
  },
  async ausbuchungen() {
    const db = await getDb();
    const zeilen = await db.select<AusbuchungsZeile[]>(
// Bezeichnung und Kategorie kommen aus der Rücklage mit: die Ausbuchung ist die
      // einzige Spur einer beendeten Rücklage, und ohne Namen wäre ihr Posten in der
      // Ergebnisrechnung eine Zahl ohne Zeile.
      `SELECT a.id, a.ruecklage_id, a.datum, a.betrag, a.istbuchung_id, a.notiz,
              a.zyklus_beginn, a.zyklus_ziel, a.zyklus_frist, a.zyklus_rate,
              r.bezeichnung, r.kategorie_id
         FROM ruecklage_ausbuchung a LEFT JOIN ruecklage r ON r.id = a.ruecklage_id
        ORDER BY a.datum DESC`,
    );
    return zeilen.map((z) => ({
      id: z.id,
      ruecklageId: z.ruecklage_id,
      datum: z.datum,
      betrag: z.betrag,
      istbuchungId: z.istbuchung_id ?? undefined,
      notiz: z.notiz ?? undefined,
      zyklusBeginn: z.zyklus_beginn ?? undefined,
      zyklusZiel: z.zyklus_ziel ?? undefined,
      zyklusFrist: z.zyklus_frist ?? undefined,
      zyklusRate: z.zyklus_rate ?? undefined,
      bezeichnung: z.bezeichnung ?? undefined,
      kategorieId: z.kategorie_id ?? undefined,
    }));
  },
};
