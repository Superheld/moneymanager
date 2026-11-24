// Eine geplante Zahlung für einen Test — geschrieben dorthin, wo sie seit Migration 84
// steht: an einen Vertrag.
//
// Viele Tests brauchen „eine Regel, die der Ausblick plant" und haben dafür früher eine
// Zeile in `zahlungsregel` gespeichert, oft ohne Vertrag. Die Form der Eingabe ist
// geblieben (eine `Zahlungsregel`), damit ein Test sagen kann, was er meint; gespeichert
// wird ein Vertrag mit dieser Zahlung.
//
//   • Mit `vertragId`: die Zahlung zieht an DIESEN Vertrag. Gibt es ihn schon, bleiben
//     seine Konditionen stehen; sonst entsteht er.
//   • Ohne: ein eigener Vertrag mit der Id der Regel.
//
// **Die Regel, die danach gelesen wird, trägt die Id des VERTRAGS**, nicht `regel.id` —
// eine eigene Id hat eine Regel nicht mehr.

import type { Zahlungsregel } from "../core";
import { getDb } from "../adapters/persistence/db";

export async function planzahlungSpeichern(regel: Zahlungsregel): Promise<void> {
  const db = await getDb();
  const id = regel.vertragId ?? regel.id;
  await db.execute(
    `INSERT OR IGNORE INTO vertrag (id, anbieter, beginn, verlaengerung, status, art)
     VALUES ($1, $2, $3, 'keine', 'aktiv', 'dauervertrag')`,
    [id, regel.bezeichnung, regel.startdatum],
  );
  await db.execute(
    `UPDATE vertrag
        SET betrag = $2, rhythmus = $3, erste_zahlung = $4, charakter = $5,
            konto_id = $6, gegenkonto_id = $7, kategorie_id = COALESCE($8, kategorie_id)
      WHERE id = $1`,
    [
      id,
      regel.betrag,
      regel.rhythmus,
      regel.startdatum,
      regel.charakter,
      regel.kontoId ?? null,
      regel.gegenkontoId ?? null,
      regel.kategorieId ?? null,
    ],
  );
}
