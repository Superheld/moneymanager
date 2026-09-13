// Ein Konto samt allem löschen — die Reihenfolge, in der das aufgeht.
//
// Die Begründung, warum es diesen Weg überhaupt gibt, steht in
// `application/konten/kontoentfernen.ts`. Hier steht, wie er ausgeführt wird, und das ist
// mehr Handarbeit als es aussieht.
//
// **Erst lesen, dann schreiben — die Naht lässt nichts anderes zu.** `inTransaktion` nimmt
// eine fertige Liste von Anweisungen und schickt sie in EINEM Aufruf an den Rust-Command,
// der sich dafür eine Verbindung greift und sie bis zum Ende hält. Ein `SELECT`
// dazwischen, dessen Ergebnis die nächste Anweisung bestimmt, gibt es nicht (siehe
// `transaktion.ts`). Alles, was die Löschung wissen muss, wird deshalb vorher abgefragt und
// als Parameter mitgegeben — was hier ohnehin die bessere Form ist: ein `DELETE … WHERE id
// IN (SELECT … FROM umsatz_verarbeitung …)` löscht per CASCADE genau aus der Tabelle, aus
// der die Unterabfrage liest, und ob SQLite sie vorher materialisiert, ist nichts, worauf
// man eine Löschung stützen sollte.

import { getDb } from "./db";
import { journalAnweisung, standLesen } from "./sqliteLedgerRepository";
import { inTransaktion, type Anweisung } from "./transaktion";
import type { Kontoloeschung, KontoentfernenPort } from "../../application/konten/kontoentfernen";

/** `$1, $2, …` für eine Werteliste — SQLite kennt kein Array als Parameter. */
function platzhalter(ab: number, anzahl: number): string {
  return Array.from({ length: anzahl }, (_, i) => `$${ab + i}`).join(", ");
}

export const sqliteKontoentfernen: KontoentfernenPort = {
  async zaehlen(kontoId) {
    const db = await getDb();
    const eine = async (sql: string, werte: unknown[] = [kontoId]) =>
      (await db.select<{ n: number }[]>(sql, werte))[0]?.n ?? 0;

    const [buchungen, belege, bankverbindung, umbuchungspaare, budgets, ruecklagen, regeln, erkennungsregeln] =
      await Promise.all([
        eine("SELECT COUNT(*) AS n FROM ist_buchung WHERE konto_id = $1"),
        // Gezählt werden ZAHLUNGEN, nicht Belege: seit dem 06.09.2026 kann eine Zahlung
        // mehrere tragen (Bankabruf neben Fremdsoftware), und `umsatz_verarbeitung` hängt
        // an der Zahlung. „214 Belege" wäre für dieselbe Sache eine grössere Zahl als
        // „214 Zahlungen", ohne dass mehr dahinterstünde.
        eine("SELECT COUNT(*) AS n FROM umsatz_verarbeitung WHERE zahlungskonto_id = $1"),
        eine("SELECT COUNT(*) AS n FROM bankkonto_zuordnung WHERE zahlungskonto_id = $1"),
        // Das Gegenbein auf einem ANDEREN Konto. `konto_id <> $1` ist die ganze
        // Unterscheidung: eine Umbuchung zwischen zwei Konten, die BEIDE hier hängen, hat
        // kein überlebendes Bein und ist keine zu lösende Paarung.
        eine(
          `SELECT COUNT(*) AS n FROM ist_buchung
            WHERE konto_id <> $1
              AND transfer_id IS NOT NULL
              AND transfer_id IN (SELECT transfer_id FROM ist_buchung
                                   WHERE konto_id = $1 AND transfer_id IS NOT NULL)`,
        ),
        eine("SELECT COUNT(*) AS n FROM budget WHERE konto_id = $1"),
        eine("SELECT COUNT(*) AS n FROM ruecklage WHERE konto_id = $1"),
        eine("SELECT COUNT(*) AS n FROM zahlungsregel WHERE konto_id = $1 OR gegenkonto_id = $1"),
        eine("SELECT COUNT(*) AS n FROM vertrag_erkennung WHERE konto_id = $1"),
      ]);

    return {
      buchungen,
      belege,
      bankverbindung: bankverbindung > 0,
      umbuchungspaare,
      budgets,
      ruecklagen,
      regeln,
      erkennungsregeln,
    } satisfies Kontoloeschung;
  },

  async vollstaendig(kontoId) {
    const db = await getDb();

    // ── Lesen ────────────────────────────────────────────────────────────────────────
    const buchungen = await db.select<{ id: string }[]>(
      "SELECT id FROM ist_buchung WHERE konto_id = $1",
      [kontoId],
    );
    const partner = await db.select<{ id: string }[]>(
      `SELECT id FROM ist_buchung
        WHERE konto_id <> $1
          AND transfer_id IS NOT NULL
          AND transfer_id IN (SELECT transfer_id FROM ist_buchung
                               WHERE konto_id = $1 AND transfer_id IS NOT NULL)`,
      [kontoId],
    );
    const zahlungen = await db.select<{ umsatz_id: string }[]>(
      "SELECT umsatz_id FROM umsatz_verarbeitung WHERE zahlungskonto_id = $1",
      [kontoId],
    );

    // Die Stände VORHER — sie sind der Inhalt der Journaleinträge, und nach dem Löschen
    // gäbe es sie nicht mehr.
    const staende = await Promise.all(buchungen.map((b) => standLesen(db, b.id)));
    const partnerStaende = await Promise.all(partner.map((b) => standLesen(db, b.id)));

    // ── Schreiben ────────────────────────────────────────────────────────────────────
    const anweisungen: Anweisung[] = [];

    // 1. Die Paarung der überlebenden Beine lösen, und zwar MIT Journaleintrag.
    //
    //    `gegenkonto_id` räumt der Fremdschlüssel selbst weg, wenn das Konto am Ende geht
    //    (SET NULL); `transfer_id` trägt keinen und bliebe sonst als Verweis auf ein Paar
    //    stehen, das es nicht mehr gibt. Der Journaleintrag ist hier nicht Zeremonie: ohne
    //    ihn verliert eine Buchung auf einem Konto, das jemand weiterführt, still ihre
    //    Paarung, und wer das später sieht, findet keine Erklärung.
    partner.forEach((b, i) => {
      const vorher = partnerStaende[i];
      if (!vorher) return;
      anweisungen.push(
        ...journalAnweisung(b.id, vorher, { ...vorher, transfer_id: null, gegenkonto_id: null }),
        {
          sql: "UPDATE ist_buchung SET transfer_id = NULL, gegenkonto_id = NULL WHERE id = $1",
          werte: [b.id],
        },
      );
    });

    // 2. Die Buchungen — Journaleintrag, Aufteilungen, Zeile. Wie `ledger.loeschen`, nur
    //    für viele; die Aufteilungen ausdrücklich und nicht über CASCADE, damit hier
    //    dasselbe steht wie dort.
    buchungen.forEach((b, i) => {
      anweisungen.push(
        ...journalAnweisung(b.id, staende[i], null),
        { sql: "DELETE FROM ist_buchung_aufteilung WHERE istbuchung_id = $1", werte: [b.id] },
      );
    });
    anweisungen.push({ sql: "DELETE FROM ist_buchung WHERE konto_id = $1", werte: [kontoId] });

    // 3. Die Belege. Über `COALESCE(zahlung_id, id)` erwischt es ALLE Fassungen einer
    //    Zahlung und nicht nur die namengebende — dieselbe Bedingung wie in
    //    `UmsatzRepository.loeschen`. Verarbeitungsstand und Dubletten-Freigaben nimmt
    //    CASCADE mit, sobald die namengebende Zeile geht.
    if (zahlungen.length > 0) {
      anweisungen.push({
        sql: `DELETE FROM umsatz_roh
               WHERE COALESCE(zahlung_id, id) IN (${platzhalter(1, zahlungen.length)})`,
        werte: zahlungen.map((z) => z.umsatz_id),
      });
    }

    // 4. Die Bankverbindung, dann das Konto. Der `bankzugang` selbst bleibt: er kann
    //    weitere Konten führen, und weg ist hier nur die Zuordnung zu diesem einen.
    anweisungen.push(
      { sql: "DELETE FROM bankkonto_zuordnung WHERE zahlungskonto_id = $1", werte: [kontoId] },
      { sql: "DELETE FROM zahlungskonto WHERE id = $1", werte: [kontoId] },
    );

    await inTransaktion(db, anweisungen);
  },
};
