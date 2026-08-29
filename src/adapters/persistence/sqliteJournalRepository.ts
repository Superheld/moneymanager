// Das Buchungsjournal lesen.
//
// Geschrieben wird es im Ledger-Repository nebenan, und zwar in derselben Transaktion wie
// die Buchung selbst. Hier steht nur der Rueckweg: JSON-Stand -> `IstBuchung`.
//
// **Warum das Parsen defensiv ist.** Die gespeicherten Staende sind aeltere Faelle des
// Schemas: eine Spalte, die es beim Schreiben noch nicht gab, fehlt im Text, und eine, die
// inzwischen weg ist, steht noch drin. Ein Parser, der auf Vollstaendigkeit besteht,
// wuerde genau an den alten Eintraegen scheitern — an denen also, fuer die es das Journal
// gibt. Fehlende Felder werden deshalb zu `undefined` und nicht zu einem Fehler.

import type { IstBuchung, Journalart, Journaleintrag, Aufteilung } from "../../core";
import type { JournalRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  istbuchung_id: string;
  zeitpunkt: string;
  art: string;
  vorher: string | null;
  nachher: string | null;
}

interface AnzahlZeile {
  istbuchung_id: string;
  anzahl: number;
}

/** Ein Wert aus dem JSON-Stand, falls er dort als nicht leerer Text steht. */
function text(stand: Record<string, unknown>, feld: string): string | undefined {
  const wert = stand[feld];
  return typeof wert === "string" && wert !== "" ? wert : undefined;
}

function zahl(stand: Record<string, unknown>, feld: string): number | undefined {
  const wert = stand[feld];
  return typeof wert === "number" ? wert : undefined;
}

function teile(stand: Record<string, unknown>): Aufteilung[] | undefined {
  const roh = stand.aufteilungen;
  if (!Array.isArray(roh) || roh.length === 0) return undefined;
  const gebaut: Aufteilung[] = [];
  for (const t of roh) {
    if (typeof t !== "object" || t === null) continue;
    const teil = t as Record<string, unknown>;
    const kategorieId = text(teil, "kategorie_id");
    const betrag = zahl(teil, "betrag");
    if (kategorieId === undefined || betrag === undefined) continue;
    gebaut.push({ kategorieId, betrag, notiz: text(teil, "notiz") });
  }
  return gebaut.length > 0 ? gebaut : undefined;
}

/**
 * Der gespeicherte Stand als `IstBuchung`.
 *
 * `vertrag_id` und `vertrag_herkunft` stehen im Text und kommen bewusst NICHT mit: sie
 * gehoeren der Vertragszuordnung, nicht dem Ledger. Wer sie hier einsammelte, baute eine
 * Buchung, die beim Speichern die Haelfte ihrer Felder verloere — und ein Zuruecksetzen
 * saehe aus, als koennte es eine Vertragszuordnung wiederherstellen.
 */
function alsBuchung(roh: string | null): IstBuchung | undefined {
  if (!roh) return undefined;
  let stand: Record<string, unknown>;
  try {
    stand = JSON.parse(roh) as Record<string, unknown>;
  } catch {
    // Ein unlesbarer Eintrag ist kein Grund, die ganze Historie zu verweigern: die
    // uebrigen Eintraege sagen weiterhin, was geschah.
    return undefined;
  }

  const id = text(stand, "id");
  const datum = text(stand, "datum");
  const kontoId = text(stand, "konto_id");
  const charakter = text(stand, "charakter");
  const quelle = text(stand, "quelle");
  const betrag = zahl(stand, "betrag");
  if (!id || !datum || !kontoId || !charakter || !quelle || betrag === undefined) return undefined;


  return {
    id,
    datum,
    betrag,
    kontoId,
    kategorieId: text(stand, "kategorie_id"),
    kategorieHerkunft: text(stand, "kategorie_herkunft") as IstBuchung["kategorieHerkunft"],
    charakter: charakter as IstBuchung["charakter"],
    quelle: quelle as IstBuchung["quelle"],
    notiz: text(stand, "notiz"),
    transferId: text(stand, "transfer_id"),
    gegenkontoId: text(stand, "gegenkonto_id"),
    rohHash: text(stand, "roh_hash"),
    zuPruefen: zahl(stand, "zu_pruefen") === 1 ? true : undefined,
    aufteilungen: teile(stand),
  };
}

export const sqliteJournalRepository: JournalRepository = {
  async zuBuchung(istbuchungId: string) {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, istbuchung_id, zeitpunkt, art, vorher, nachher
         FROM buchung_journal WHERE istbuchung_id = $1 ORDER BY zeitpunkt, rowid`,
      [istbuchungId],
    );
    return zeilen.map(
      (z): Journaleintrag => ({
        id: z.id,
        istbuchungId: z.istbuchung_id,
        zeitpunkt: z.zeitpunkt,
        art: z.art as Journalart,
        vorher: alsBuchung(z.vorher),
        nachher: alsBuchung(z.nachher),
      }),
    );
  },

  async anzahlen() {
    const db = await getDb();
    // Gezaehlt in SQL und nicht in JS: die Alternative waere, saemtliche Staende als Text
    // in den Speicher zu holen, um sie dann wegzuwerfen.
    const zeilen = await db.select<AnzahlZeile[]>(
      "SELECT istbuchung_id, COUNT(*) AS anzahl FROM buchung_journal GROUP BY istbuchung_id",
    );
    return new Map(zeilen.map((z) => [z.istbuchung_id, z.anzahl]));
  },
};
