// SQLite-Implementierung des VertragRepository-Ports.

import type { Verlaengerungsart, Vertrag, Vertragsstatus } from "../../core";
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
  notizen: string | null;
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
    notizen: z.notizen ?? undefined,
  };
}

export const sqliteVertragRepository: VertragRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, anbieter, vertragsnummer, inhaber_id, beginn, mindestlaufzeit_monate,
              verlaengerung, verlaengerung_monate, kuendigungsfrist_monate, status, notizen
       FROM vertrag ORDER BY anbieter`,
    );
    return zeilen.map(zuVertrag);
  },

  async speichern(v) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vertrag (id, anbieter, vertragsnummer, inhaber_id, beginn, mindestlaufzeit_monate,
         verlaengerung, verlaengerung_monate, kuendigungsfrist_monate, status, notizen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET
         anbieter = excluded.anbieter, vertragsnummer = excluded.vertragsnummer,
         inhaber_id = excluded.inhaber_id, beginn = excluded.beginn,
         mindestlaufzeit_monate = excluded.mindestlaufzeit_monate,
         verlaengerung = excluded.verlaengerung, verlaengerung_monate = excluded.verlaengerung_monate,
         kuendigungsfrist_monate = excluded.kuendigungsfrist_monate,
         status = excluded.status, notizen = excluded.notizen`,
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
        v.notizen ?? null,
      ],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM vertrag WHERE id = $1", [id]);
  },
};
