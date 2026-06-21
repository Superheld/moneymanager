// Historie — rückblickende Aggregation der Ist-Buchungen (Gegenstück zur zukunfts-reinen
// Projektion). Rein, ohne IO. Bündelt verbuchte Beträge je Monat nach Charakter und führt
// den realen Saldo (Σ Anfangsbestände + kumulierte Ist) über die Zeit mit.

import { addMonate, parseIso } from "./datum";
import type { Cent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import { liquideMittel, type Zahlungskonto } from "./konto";

export interface MonatsIst {
  /** „YYYY-MM". */
  readonly label: string;
  readonly jahr: number;
  readonly monat: number; // 1–12
  /** Σ Erträge des Monats (≥ 0). */
  readonly einnahmen: Cent;
  /** Σ Aufwände des Monats (≤ 0, vorzeichenbehaftet). */
  readonly ausgaben: Cent;
  /** Σ Umschichtungen des Monats (vorzeichenbehaftet). */
  readonly umschichtung: Cent;
  /** einnahmen + ausgaben (ohne Umschichtung) — das erfolgswirksame Netto. */
  readonly netto: Cent;
  /** Realer Gesamt-Saldo am Monatsende (Σ Anfangsbestände + alle Ist bis einschließlich Monat). */
  readonly saldo: Cent;
}

const monatVon = (iso: string) => iso.slice(0, 7); // „YYYY-MM"

/**
 * Monatsreihe von `vonIso` bis einschließlich `bisIso` (beide „YYYY-MM-01"). Leere Monate
 * erscheinen mit Nullwerten; der Saldo läuft auch über buchungsfreie Monate korrekt weiter.
 */
export function istMonatsverlauf(
  konten: readonly Zahlungskonto[],
  buchungen: readonly IstBuchung[],
  vonIso: string,
  bisIso: string,
): MonatsIst[] {
  const von = parseIso(vonIso);
  const bis = parseIso(bisIso);

  // Monatsweise Flüsse nach Charakter.
  const proMonat = new Map<string, { ein: Cent; aus: Cent; um: Cent }>();
  // Saldo-Sockel: Anfangsbestände + alle Ist VOR dem Fenster.
  let lauf: Cent = liquideMittel([...konten]);
  const vonLabel = `${von.y}-${String(von.m).padStart(2, "0")}`;
  for (const b of buchungen) {
    const key = monatVon(b.datum);
    if (key < vonLabel) {
      lauf += b.betrag;
      continue;
    }
    const e = proMonat.get(key) ?? { ein: 0, aus: 0, um: 0 };
    if (b.charakter === "Ertrag") e.ein += b.betrag;
    else if (b.charakter === "Aufwand") e.aus += b.betrag;
    else e.um += b.betrag;
    proMonat.set(key, e);
  }

  const reihe: MonatsIst[] = [];
  let cursor = { y: von.y, m: von.m, d: 1 };
  while (cursor.y < bis.y || (cursor.y === bis.y && cursor.m <= bis.m)) {
    const label = `${cursor.y}-${String(cursor.m).padStart(2, "0")}`;
    const f = proMonat.get(label) ?? { ein: 0, aus: 0, um: 0 };
    lauf += f.ein + f.aus + f.um;
    reihe.push({
      label,
      jahr: cursor.y,
      monat: cursor.m,
      einnahmen: f.ein,
      ausgaben: f.aus,
      umschichtung: f.um,
      netto: f.ein + f.aus,
      saldo: lauf,
    });
    cursor = addMonate(cursor, 1);
  }
  return reihe;
}

/** Frühester Buchungsmonat als „YYYY-MM-01", oder undefined bei leerer Liste. */
export function fruehesterMonat(buchungen: readonly IstBuchung[]): string | undefined {
  if (buchungen.length === 0) return undefined;
  let min = buchungen[0].datum;
  for (const b of buchungen) if (b.datum < min) min = b.datum;
  return monatVon(min) + "-01";
}
