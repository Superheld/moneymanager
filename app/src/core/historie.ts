// Historie — rückblickende Aggregation der Ist-Buchungen (Gegenstück zur zukunfts-reinen
// Projektion). Rein, ohne IO. Bündelt verbuchte Beträge je Monat nach Charakter und führt
// den realen Saldo (Σ Anfangsbestände + kumulierte Ist) über die Zeit mit.

import { addMonate, parseIso } from "./datum";
import type { Cent } from "./geld";
import type { Charakter } from "./zahlungsregel";
import type { IstBuchung } from "./istbuchung";
import type { Kategorie } from "./kategorie";
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

export interface KategorieSumme {
  /** undefined = unkategorisiert. */
  readonly kategorieId?: string;
  readonly name: string;
  /** Name der Hauptgruppe (Elternkategorie), falls vorhanden. */
  readonly elternName?: string;
  readonly charakter: Charakter;
  /** Vorzeichenbehaftete Summe (Ausgaben negativ). */
  readonly summe: Cent;
  readonly anzahl: number;
}

const OHNE = "__ohne__";

/**
 * Summiert die Ist-Buchungen im Fenster [vonIso, bisIso] (monatsgenau, inklusive) je
 * Kategorie. Sortiert nach Betrag (Magnitude) absteigend — das Größte oben. Charakter und
 * Namen werden über den Kategorie-Katalog aufgelöst; ohne Kategorie zählt separat.
 */
export function kategorieAggregat(
  buchungen: readonly IstBuchung[],
  vonIso: string,
  bisIso: string,
  kategorien: readonly Kategorie[],
): KategorieSumme[] {
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const vonLabel = vonIso.slice(0, 7);
  const bisLabel = bisIso.slice(0, 7);

  const map = new Map<string, { summe: Cent; anzahl: number; charakter: Charakter }>();
  for (const b of buchungen) {
    const key = monatVon(b.datum);
    if (key < vonLabel || key > bisLabel) continue;
    const id = b.kategorieId ?? OHNE;
    const e = map.get(id) ?? { summe: 0, anzahl: 0, charakter: b.charakter };
    e.summe += b.betrag;
    e.anzahl++;
    map.set(id, e);
  }

  return [...map.entries()]
    .map(([id, e]): KategorieSumme => {
      const kat = id === OHNE ? undefined : byId.get(id);
      const eltern = kat?.elternId ? byId.get(kat.elternId) : undefined;
      return {
        kategorieId: kat?.id,
        name: kat?.name ?? "—",
        elternName: eltern?.name,
        charakter: kat?.defaultCharakter ?? e.charakter,
        summe: e.summe,
        anzahl: e.anzahl,
      };
    })
    .sort((a, b) => Math.abs(b.summe) - Math.abs(a.summe));
}

/** Frühester Buchungsmonat als „YYYY-MM-01", oder undefined bei leerer Liste. */
export function fruehesterMonat(buchungen: readonly IstBuchung[]): string | undefined {
  if (buchungen.length === 0) return undefined;
  let min = buchungen[0].datum;
  for (const b of buchungen) if (b.datum < min) min = b.datum;
  return monatVon(min) + "-01";
}
