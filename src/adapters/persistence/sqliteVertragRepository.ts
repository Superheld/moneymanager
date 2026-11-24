// SQLite-Implementierung des VertragRepository-Ports.

import type { Charakter, Rhythmus, Verlaengerungsart, Vertrag, Vertragsart, Vertragsstatus } from "../../core";
import type { VertragRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  anbieter: string;
  vertragsnummer: string | null;
  inhaber_id: string | null;
  beginn: string;
  mindestlaufzeit_monate: number | null;
  verlaengerung: string;
  verlaengerung_monate: number | null;
  kuendigungsfrist_monate: number | null;
  status: string;
  art: string | null;
  kategorie_id: string | null;
  notizen: string | null;
  betrag: number | null;
  rhythmus: string | null;
  erste_zahlung: string | null;
  charakter: string | null;
  konto_id: string | null;
  gegenkonto_id: string | null;
}

function zuVertrag(z: Zeile): Vertrag {
  return {
    id: z.id,
    anbieter: z.anbieter,
    vertragsnummer: z.vertragsnummer ?? undefined,
    inhaberId: z.inhaber_id ?? undefined,
    beginn: z.beginn,
    mindestlaufzeitMonate: z.mindestlaufzeit_monate ?? undefined,
    verlaengerung: z.verlaengerung as Verlaengerungsart,
    verlaengerungMonate: z.verlaengerung_monate ?? undefined,
    kuendigungsfristMonate: z.kuendigungsfrist_monate ?? undefined,
    status: z.status as Vertragsstatus,
    // Fehlend heisst „abo" — so bleiben Bestandsverträge ohne Spalte gültig.
    art: (z.art as Vertragsart) ?? "abo",
    kategorieId: z.kategorie_id ?? undefined,
    notizen: z.notizen ?? undefined,
    // Die Zahlung gibt es nur ganz: fehlt eines der vier Pflichtfelder (ein Vertrag aus
    // dem Altbestand, dessen Regel fehlte), plant der Vertrag nichts.
    zahlung:
      z.betrag !== null && z.rhythmus !== null && z.erste_zahlung !== null && z.charakter !== null
        ? {
            betrag: z.betrag,
            rhythmus: z.rhythmus as Rhythmus,
            ersteZahlung: z.erste_zahlung,
            charakter: z.charakter as Charakter,
            kontoId: z.konto_id ?? undefined,
            gegenkontoId: z.gegenkonto_id ?? undefined,
          }
        : undefined,
  };
}

export const sqliteVertragRepository: VertragRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, anbieter, vertragsnummer, inhaber_id, beginn, mindestlaufzeit_monate,
              verlaengerung, verlaengerung_monate, kuendigungsfrist_monate, status, art,
              kategorie_id, notizen, betrag, rhythmus, erste_zahlung, charakter, konto_id, gegenkonto_id
       FROM vertrag ORDER BY anbieter`,
    );
    return zeilen.map(zuVertrag);
  },

  async speichern(v) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vertrag (id, anbieter, vertragsnummer, inhaber_id, beginn, mindestlaufzeit_monate,
         verlaengerung, verlaengerung_monate, kuendigungsfrist_monate, status, art, kategorie_id, notizen,
         betrag, rhythmus, erste_zahlung, charakter, konto_id, gegenkonto_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT(id) DO UPDATE SET
         anbieter = excluded.anbieter, vertragsnummer = excluded.vertragsnummer,
         inhaber_id = excluded.inhaber_id, beginn = excluded.beginn,
         mindestlaufzeit_monate = excluded.mindestlaufzeit_monate,
         verlaengerung = excluded.verlaengerung, verlaengerung_monate = excluded.verlaengerung_monate,
         kuendigungsfrist_monate = excluded.kuendigungsfrist_monate,
         status = excluded.status, art = excluded.art, kategorie_id = excluded.kategorie_id,
         notizen = excluded.notizen,
         betrag = excluded.betrag, rhythmus = excluded.rhythmus,
         erste_zahlung = excluded.erste_zahlung, charakter = excluded.charakter,
         konto_id = excluded.konto_id, gegenkonto_id = excluded.gegenkonto_id`,
      [
        v.id,
        v.anbieter,
        v.vertragsnummer ?? null,
        v.inhaberId ?? null,
        v.beginn,
        v.mindestlaufzeitMonate ?? null,
        v.verlaengerung,
        v.verlaengerungMonate ?? null,
        v.kuendigungsfristMonate ?? null,
        v.status,
        v.art ?? "abo",
        v.kategorieId ?? null,
        v.notizen ?? null,
        v.zahlung?.betrag ?? null,
        v.zahlung?.rhythmus ?? null,
        v.zahlung?.ersteZahlung ?? null,
        v.zahlung?.charakter ?? null,
        v.zahlung?.kontoId ?? null,
        v.zahlung?.gegenkontoId ?? null,
      ],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM vertrag WHERE id = $1", [id]);
  },
};
