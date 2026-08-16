// Inventargegenstand — Dinge, die man besitzt und ersetzen muss (SPEC US-C1).
// Wiederbeschaffungswert + Nutzungsdauer ergeben die monatliche Rücklage
// (kalkulatorische Abschreibung), Anschaffungsdatum + Nutzungsdauer den Soll-Stand.
//
// REIN KALKULATORISCH (Entscheidung 2026-08-16): Der Gegenstand führt kein eigenes
// Sparvehikel mehr — der frühere Ersatz-Topf ist entfallen. Was tatsächlich zurückgelegt
// ist, wird nicht gebucht, sondern ABGEGLICHEN: der Gegenstand nennt das Konto, auf dem
// das Geld liegt, und der reale Stand dieses Kontos wird anteilig auf die Gegenstände
// verteilt, die darauf zeigen. Deckung = Wirklichkeit / Rechnung, ohne Buchungslogik.

import { monateZwischen } from "./datum";
import type { Cent } from "./geld";

export interface Inventargegenstand {
  readonly id: string;
  readonly bezeichnung: string;
  readonly wiederbeschaffung: Cent;
  readonly nutzungsdauerMonate: number; // > 0
  /** Anschaffungs-/Startdatum für die Rücklage, ISO. */
  readonly anschaffung: string;
  readonly kategorieId?: string;
  /** Zahlungskonto, auf dem die Rücklage tatsächlich liegt. Ohne Zuordnung nur Soll. */
  readonly kontoId?: string;
}

/**
 * Monatliche Rücklage — was der Gegenstand pro Monat kostet, auch wenn nichts fließt.
 *
 * Die Rückfalllinie gegen eine Nutzungsdauer von 0 ist kein Zierrat: die Division ergäbe
 * Infinity und über `Infinity * 0` an anderer Stelle NaN — ein Wert, der weder `>` noch
 * `<` erfüllt, jede Warnlogik still auf false fallen lässt und in der UI als „NaN"
 * erscheint. Der eigentliche Schutz sitzt an der Grenze (inventarAnlegen prüft > 0).
 */
export function monatsRuecklage(g: Inventargegenstand): Cent {
  return g.nutzungsdauerMonate > 0
    ? Math.round(g.wiederbeschaffung / g.nutzungsdauerMonate)
    : 0;
}

/**
 * Soll-Rücklage am Datum `am`: linear ab `anschaffung`, gedeckelt auf die
 * Wiederbeschaffung.
 *
 * Anteilig AUS DEM ZIEL gerechnet, nicht als (gerundete Rate × Monate): sonst fehlte am
 * Ende der Nutzungsdauer ein Rest, weil die Rate einmal gerundet und dann vervielfacht
 * wurde (1000 Cent auf 3 Monate → Rate 333 → nach 3 Monaten 999). Die fachliche Zusage
 * lautet, dass am Ende der Nutzungsdauer die Wiederbeschaffung beisammen ist — die hält
 * nur diese Rechnung ein.
 */
export function sollRuecklage(g: Inventargegenstand, am: string): Cent {
  if (!(g.nutzungsdauerMonate > 0)) return 0;
  const monate = Math.max(0, monateZwischen(g.anschaffung, am));
  return Math.min(
    Math.round((g.wiederbeschaffung * monate) / g.nutzungsdauerMonate),
    g.wiederbeschaffung,
  );
}

/** Summe der monatlichen Rücklagen — der Betrag, der jeden Monat gebunden ist. */
export function monatsRuecklageGesamt(items: readonly Inventargegenstand[]): Cent {
  return items.reduce((s, g) => s + monatsRuecklage(g), 0);
}

export interface RuecklagenPosten {
  readonly gegenstand: Inventargegenstand;
  /** Was bis `am` zurückgelegt sein sollte. */
  readonly soll: Cent;
  /** Anteil am realen Kontostand; `null` ohne Kontozuordnung (dann nur Rechnung). */
  readonly tatsaechlich: Cent | null;
}

export interface RuecklagenDeckung {
  readonly posten: readonly RuecklagenPosten[];
  readonly soll: Cent;
  /** Nur die Gegenstände MIT Konto — sonst stünde ein Soll ohne Gegenstück im Nenner. */
  readonly sollMitKonto: Cent;
  readonly tatsaechlich: Cent;
  /** 0–100, gedeckelt. 100, wenn nichts zu decken ist. */
  readonly grad: number;
}

/**
 * Gleicht die Rechnung gegen die Wirklichkeit ab: je Konto wird der reale Stand auf die
 * Gegenstände verteilt, die auf dieses Konto zeigen — anteilig an ihrem Soll.
 *
 * Bewusst KEINE Allokation nach Priorität und keine Warnung: liegen auf dem Rücklagenkonto
 * 60 % dessen, was rechnerisch beisammen sein müsste, dann ist jeder Gegenstand zu 60 %
 * gedeckt. Alles andere würde eine Reihenfolge behaupten, die es nicht gibt.
 *
 * Überschuss wird gekappt (Grad ≤ 100 %): mehr als sein Wiederbeschaffungswert ist für
 * einen Gegenstand nicht zurückgelegt, auch wenn auf dem Konto mehr liegt.
 */
export function ruecklagenDeckung(
  items: readonly Inventargegenstand[],
  am: string,
  kontostaende: ReadonlyMap<string, Cent>,
): RuecklagenDeckung {
  const soll = new Map<string, Cent>();
  for (const g of items) {
    if (!g.kontoId) continue;
    soll.set(g.kontoId, (soll.get(g.kontoId) ?? 0) + sollRuecklage(g, am));
  }

  /** Deckungsanteil eines Kontos, 0–1. Ohne Soll ist nichts zu decken. */
  const anteil = (kontoId: string): number => {
    const s = soll.get(kontoId) ?? 0;
    if (s <= 0) return 0;
    const stand = kontostaende.get(kontoId) ?? 0;
    return Math.max(0, Math.min(1, stand / s));
  };

  const posten = items.map((g): RuecklagenPosten => {
    const s = sollRuecklage(g, am);
    return {
      gegenstand: g,
      soll: s,
      tatsaechlich: g.kontoId ? Math.round(s * anteil(g.kontoId)) : null,
    };
  });

  const sollGesamt = posten.reduce((s, p) => s + p.soll, 0);
  const sollMitKonto = posten.reduce((s, p) => s + (p.tatsaechlich == null ? 0 : p.soll), 0);
  const tatsaechlich = posten.reduce((s, p) => s + (p.tatsaechlich ?? 0), 0);

  return {
    posten,
    soll: sollGesamt,
    sollMitKonto,
    tatsaechlich,
    grad: sollMitKonto > 0 ? Math.round((tatsaechlich / sollMitKonto) * 100) : 100,
  };
}
