// Historie — rückblickende Aggregation der Ist-Buchungen (Gegenstück zur zukunfts-reinen
// Projektion). Rein, ohne IO. Bündelt verbuchte Beträge je Monat nach Charakter und führt
// den realen Saldo (Σ Anfangsbestände + kumulierte Ist) über die Zeit mit.

import { addMonate, parseIso } from "../basis/datum";
import type { Cent } from "../basis/geld";
import type { Charakter } from "../basis/zahlungsregel";
import { kategorieAnteile, type IstBuchung } from "./istbuchung";
import type { Kategorie } from "../kategorien/kategorie";
import { istLiquide, liquideMittel, type Zahlungskonto } from "../konten/konto";

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

  // Buchungen nicht verfügbarer Konten bleiben ebenfalls draußen — und zwar mit DERSELBEN
  // Regel, aus der der Sockel entsteht. Das ist keine Feinheit: der Sockel enthält den
  // Anfangsbestand nur der liquiden Konten, und liefe danach die Bewegung eines
  // Depotkontos darüber, zeigte die Kurve einen Saldo, den es nie gab.
  //
  // Ein Konto, das die Buchung nennt, aber in der Liste fehlt, wird MITGEZÄHLT: die
  // Kontenliste ist hier eine Filterregel und keine Vollständigkeitszusage, und eine
  // Buchung stillschweigend zu verlieren wäre der schlechtere Fehler.
  const nichtLiquide = new Set(konten.filter((k) => !istLiquide(k)).map((k) => k.id));
  const vonLabel = `${von.y}-${String(von.m).padStart(2, "0")}`;
  for (const b of buchungen) {
    if (nichtLiquide.has(b.kontoId)) continue;
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
    // Eine geteilte Buchung (S-7) erscheint in jeder ihrer Kategorien mit ihrem Teil.
    // `anzahl` zählt sie dabei in jeder mit — sie IST dort ein Posten; die Summe über
    // alle Zeilen bleibt trotzdem der Buchungsbetrag.
    for (const a of kategorieAnteile(b)) {
      const id = a.kategorieId ?? OHNE;
      const e = map.get(id) ?? { summe: 0, anzahl: 0, charakter: b.charakter };
      e.summe += a.betrag;
      e.anzahl++;
      map.set(id, e);
    }
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

/** Eine Hauptgruppe mit ihren Unterkategorien. */
export interface GruppenSumme {
  /** undefined = die Sammelzeile „ohne Kategorie". */
  readonly kategorieId?: string;
  readonly name: string;
  readonly charakter: Charakter;
  /** Summe der Gruppe inklusive aller Kinder. */
  readonly summe: Cent;
  readonly anzahl: number;
  readonly kinder: readonly KategorieSumme[];
}

/**
 * Fasst ein Kategorie-Aggregat zu Hauptgruppen zusammen.
 *
 * Eine Kategorie ohne Elternteil IST ihre eigene Hauptgruppe — sie erscheint als Gruppe
 * ohne Kinder, nicht als Kind von irgendetwas. Buchungen, die direkt auf einer
 * Hauptgruppe liegen (statt auf einer ihrer Unterkategorien), gehen in deren Summe ein
 * und erscheinen zusätzlich als eigenes Kind; sonst zeigte die aufgeklappte Gruppe
 * weniger an, als ihre Zeile behauptet.
 *
 * Sortiert nach Betrag (größter zuerst), Kinder ebenso — wie das flache Aggregat.
 */
export function nachHauptgruppe(
  items: readonly KategorieSumme[],
  kategorien: readonly Kategorie[],
): GruppenSumme[] {
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const gruppen = new Map<string, { name: string; charakter: Charakter; summe: Cent; anzahl: number; kinder: KategorieSumme[]; id?: string }>();

  for (const item of items) {
    const kat = item.kategorieId ? byId.get(item.kategorieId) : undefined;
    const eltern = kat?.elternId ? byId.get(kat.elternId) : undefined;
    const gruppeId = eltern?.id ?? item.kategorieId ?? OHNE;
    const gruppeName = eltern?.name ?? item.name;

    const e = gruppen.get(gruppeId) ?? {
      id: gruppeId === OHNE ? undefined : gruppeId,
      name: gruppeName,
      charakter: eltern?.defaultCharakter ?? item.charakter,
      summe: 0,
      anzahl: 0,
      kinder: [],
    };
    e.summe += item.summe;
    e.anzahl += item.anzahl;
    // Auch die Gruppe selbst erscheint als Kind, wenn direkt auf sie gebucht wurde —
    // sonst summieren die sichtbaren Kinder auf weniger als die Gruppenzeile.
    e.kinder.push(item);
    gruppen.set(gruppeId, e);
  }

  return [...gruppen.values()]
    .map((g): GruppenSumme => ({
      kategorieId: g.id,
      name: g.name,
      charakter: g.charakter,
      summe: g.summe,
      anzahl: g.anzahl,
      kinder: [...g.kinder].sort((a, b) => Math.abs(b.summe) - Math.abs(a.summe)),
    }))
    .sort((a, b) => Math.abs(b.summe) - Math.abs(a.summe));
}

/**
 * Interne Umbuchung (Geld zwischen eigenen Konten) — gehört NICHT in eine Ausgaben-/
 * Einnahmen-Auswertung. Erkennung: verknüpftes Transfer-Bein (transferId) ODER
 * Umschichtung ohne Kategorie (so importieren wir Umbuchungen). Gesparte „Umschichtung MIT
 * Kategorie" (z. B. Sparen & Anlegen) bleibt erhalten.
 */
export function istInterneUmbuchung(b: IstBuchung): boolean {
  return b.transferId != null || (b.charakter === "Umschichtung" && !b.kategorieId);
}

/**
 * Einzelne Ist-Buchungen einer Kategorie im Fenster [vonIso, bisIso] (monatsgenau,
 * inklusive), neueste zuerst. Für die Detail-Ansicht beim Klick auf eine Kategorie.
 */
export function buchungenDerKategorie(
  buchungen: readonly IstBuchung[],
  kategorieId: string,
  vonIso: string,
  bisIso: string,
): IstBuchung[] {
  const vonL = vonIso.slice(0, 7);
  const bisL = bisIso.slice(0, 7);
  return buchungen
    .filter(
      (b) =>
        monatVon(b.datum) >= vonL &&
        monatVon(b.datum) <= bisL &&
        kategorieAnteile(b).some((a) => a.kategorieId === kategorieId),
    )
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

/**
 * Der Betrag, mit dem eine Buchung auf EINE Kategorie wirkt — bei einer geteilten Buchung
 * ihr Teil, sonst der volle Betrag. Für Detaillisten, die sonst den Gesamtbetrag zeigten
 * und damit mehr, als in dieser Kategorie steckt.
 */
export function betragInKategorie(b: IstBuchung, kategorieId: string): Cent {
  return kategorieAnteile(b).reduce((s, a) => (a.kategorieId === kategorieId ? s + a.betrag : s), 0);
}

/** Frühester Buchungsmonat als „YYYY-MM-01", oder undefined bei leerer Liste. */
export function fruehesterMonat(buchungen: readonly IstBuchung[]): string | undefined {
  if (buchungen.length === 0) return undefined;
  let min = buchungen[0].datum;
  for (const b of buchungen) if (b.datum < min) min = b.datum;
  return monatVon(min) + "-01";
}
