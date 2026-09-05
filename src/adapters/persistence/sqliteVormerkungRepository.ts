// SQLite-Adapter der Vormerkungen.
//
// Die einzige Schreiboperation ist ein ERSETZEN je Konto, und sie laeuft in EINER
// Transaktion: zwischen dem Wegwerfen der alten und dem Anlegen der neuen darf kein
// Zustand sichtbar werden, in dem das Konto gar keine hat. Er waere zwar kurz, aber die
// Liquiditaetsvorschau liest genau hier — und ein Stand ohne Vormerkungen sieht nicht
// nach „gerade mittendrin" aus, sondern nach „nichts offen".

import type { Vormerkung } from "../../core";
import type { VormerkungRepository } from "../../application/ports";
import { getDb } from "./db";
import { inTransaktion, type Anweisung } from "./transaktion";

interface VormerkungZeile {
  id: string;
  zahlungskonto_id: string;
  datum: string | null;
  betrag: number;
  waehrung: string;
  gegenpartei: string;
  verwendungszweck: string;
  buchungsstand: string | null;
  erfasst_am: string;
}

export const sqliteVormerkungRepository: VormerkungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<VormerkungZeile[]>(
      `SELECT id, zahlungskonto_id, datum, betrag, waehrung, gegenpartei, verwendungszweck,
              buchungsstand, erfasst_am
         FROM vormerkung
        -- Ohne Datum zuerst: was die Bank ohne Termin meldet, ist das Naechste, was
        -- passiert, und steht deshalb oben statt unten.
        ORDER BY zahlungskonto_id, datum IS NOT NULL, datum, id`,
    );
    return zeilen.map(
      (z): Vormerkung => ({
        id: z.id,
        zahlungskontoId: z.zahlungskonto_id,
        datum: z.datum ?? undefined,
        betrag: z.betrag,
        waehrung: z.waehrung,
        gegenpartei: z.gegenpartei,
        verwendungszweck: z.verwendungszweck,
        buchungsstand: z.buchungsstand ?? undefined,
        erfasstAm: z.erfasst_am,
      }),
    );
  },

  async ersetzen(zahlungskontoId, vormerkungen) {
    const db = await getDb();
    const anweisungen: Anweisung[] = [
      { sql: `DELETE FROM vormerkung WHERE zahlungskonto_id = $1`, werte: [zahlungskontoId] },
      ...vormerkungen.map(
        (v): Anweisung => ({
          sql: `INSERT INTO vormerkung
                  (id, zahlungskonto_id, datum, betrag, waehrung, gegenpartei,
                   verwendungszweck, buchungsstand, erfasst_am)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          werte: [
            v.id,
            zahlungskontoId,
            v.datum ?? null,
            v.betrag,
            v.waehrung,
            v.gegenpartei,
            v.verwendungszweck,
            v.buchungsstand ?? null,
            v.erfasstAm,
          ],
        }),
      ),
    ];
    await inTransaktion(db, anweisungen);
  },
};
