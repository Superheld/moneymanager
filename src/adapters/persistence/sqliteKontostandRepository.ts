// SQLite-Adapter der Kontostands-Anker.
//
// Ein Anker ist eine Beobachtung mit Stichtag; derselbe Stichtag kann von zwei Quellen
// kommen (die Bank meldet, du zählst nach), deshalb steckt die Herkunft im Schlüssel.
// Ein zweiter Abruf am selben Tag überschreibt den Betrag — die Bank hat dann eine
// aktuellere Aussage über denselben Tag, nicht eine zweite.

import type { Ankerherkunft, Kontostandsanker } from "../../core";
import type { KontostandsankerRepository } from "../../application/ports";
import { getDb } from "./db";

interface AnkerZeile {
  konto_id: string;
  datum: string;
  herkunft: string;
  betrag: number;
  erfasst_am: string;
}

export const sqliteKontostandsankerRepository: KontostandsankerRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<AnkerZeile[]>(
      `SELECT konto_id, datum, herkunft, betrag, erfasst_am
         FROM kontostand_anker ORDER BY konto_id, datum`,
    );
    return zeilen.map(
      (z): Kontostandsanker => ({
        kontoId: z.konto_id,
        datum: z.datum,
        herkunft: z.herkunft as Ankerherkunft,
        betrag: z.betrag,
        erfasstAm: z.erfasst_am,
      }),
    );
  },

  async speichern(a: Kontostandsanker) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO kontostand_anker (konto_id, datum, herkunft, betrag, erfasst_am)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(konto_id, datum, herkunft)
         DO UPDATE SET betrag = excluded.betrag, erfasst_am = excluded.erfasst_am`,
      [a.kontoId, a.datum, a.herkunft, a.betrag, a.erfasstAm],
    );
  },

  async entfernen(kontoId: string, datum: string, herkunft: Ankerherkunft) {
    const db = await getDb();
    await db.execute(
      "DELETE FROM kontostand_anker WHERE konto_id = $1 AND datum = $2 AND herkunft = $3",
      [kontoId, datum, herkunft],
    );
  },
};
