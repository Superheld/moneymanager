// Rücklage — was du für etwas zurücklegst, das noch kommt.
//
// Bis 2026-08-31 hieß das „Inventar" und meinte einen GEGENSTAND: Wiederbeschaffungswert
// ÷ Nutzungsdauer ergab die monatliche Rücklage. Die Rechnung ist geblieben, die
// Behauptung ist weg, dass am anderen Ende ein Ding steht — man legt auch für einen
// Urlaub zurück, und der hat keinen Wiederbeschaffungswert.
//
// ZWEI FORMEN, und genau eine davon ist ausgefüllt:
//
//   • MIT ZIEL UND FRIST — „6000 in 96 Monaten". Die Rate ergibt sich, der Soll-Stand
//     ist auf das Ziel gedeckelt, es gibt einen Fortschritt in Prozent, und nach dem
//     Ausbuchen fängt sie von vorn an: was einmal ersetzt werden musste, muss es wieder.
//   • MIT RATE — „50 im Monat, mal sehen". Kein Ziel, kein Deckel, kein Fortschritt —
//     und nach dem Ausbuchen ist sie erledigt.
//
// Die Unterscheidung trägt damit mehr als die Anzeige: an ihr hängt, was nach dem
// Ausbuchen passiert. Ein eigenes Feld „wiederkehrend" wäre daneben eine zweite
// Wahrheit, die der ersten widersprechen kann.
//
// REIN KALKULATORISCH (Entscheidung 2026-08-16, unverändert): Die Rücklage führt kein
// eigenes Sparvehikel. Was tatsächlich zurückgelegt ist, wird nicht gebucht, sondern
// ABGEGLICHEN: die Rücklage nennt das Konto, auf dem das Geld liegt, und der reale Stand
// dieses Kontos wird anteilig auf die Rücklagen verteilt, die darauf zeigen. Deckung =
// Wirklichkeit ÷ Rechnung, ohne Buchungslogik.

import { monateZwischen } from "../basis/datum";
import type { Cent } from "../basis/geld";

export interface Ruecklage {
  readonly id: string;
  readonly bezeichnung: string;
  /** Was am Ende beisammen sein soll. Fehlt bei einer freien Rücklage. */
  readonly ziel?: Cent;
  /** In wie vielen Monaten das Ziel erreicht sein soll. Fehlt bei einer freien Rücklage. */
  readonly fristMonate?: number;
  /** Die Monatsrate — nur bei einer freien Rücklage; sonst folgt sie aus Ziel ÷ Frist. */
  readonly rate?: Cent;
  /** Beginn des LAUFENDEN Zyklus, ISO. Ein Ausbuchen setzt ihn neu. */
  readonly beginn: string;
  readonly kategorieId?: string;
  /** Zahlungskonto, auf dem die Rücklage tatsächlich liegt. Ohne Zuordnung nur Soll. */
  readonly kontoId?: string;
}

/**
 * Hat die Rücklage ein Ziel mit Frist?
 *
 * Das ist die Fallunterscheidung dieser Datei, und sie steht als Funktion da, damit sie
 * überall dieselbe ist. Beide Felder werden geprüft und beide auf `> 0`: ein Ziel ohne
 * Frist ließe sich nicht in eine Rate umrechnen, eine Frist von 0 teilte durch null, und
 * aus `Infinity` wird an anderer Stelle stumm `NaN`.
 */
export function hatZiel(r: Ruecklage): boolean {
  return (r.ziel ?? 0) > 0 && (r.fristMonate ?? 0) > 0;
}

/**
 * Monatliche Rücklage — was sie pro Monat kostet, auch wenn nichts fließt.
 *
 * Mit Ziel und Frist die Rechnung, sonst die eingetragene Rate. Die Rückfalllinie auf 0
 * ist kein Zierrat: eine Rücklage ohne beides ist an der Grenze abgewiesen worden, aber
 * eine 0 rechnet sich hier weiter, ein `undefined` fiele durch jede Summe.
 */
export function monatsRuecklage(r: Ruecklage): Cent {
  if (hatZiel(r)) return Math.round((r.ziel as Cent) / (r.fristMonate as number));
  return r.rate ?? 0;
}

/**
 * Soll-Rücklage am Datum `am`: linear ab `beginn`.
 *
 * Mit Ziel anteilig AUS DEM ZIEL gerechnet, nicht als (gerundete Rate × Monate): sonst
 * fehlte am Ende der Frist ein Rest, weil die Rate einmal gerundet und dann vervielfacht
 * wurde (1000 Cent auf 3 Monate → Rate 333 → nach 3 Monaten 999). Die fachliche Zusage
 * lautet, dass am Ende der Frist das Ziel beisammen ist — die hält nur diese Rechnung ein.
 *
 * Ohne Ziel gibt es nichts zu deckeln und nichts aufzuteilen: Rate × Monate, und der
 * Betrag wächst weiter, solange niemand ausbucht. Das ist die richtige Aussage — wer 50
 * im Monat für Ungewisses zurücklegt, hat nach drei Jahren 1800 zurückgelegt.
 */
export function sollRuecklage(r: Ruecklage, am: string): Cent {
  const monate = Math.max(0, monateZwischen(r.beginn, am));
  if (hatZiel(r)) {
    const ziel = r.ziel as Cent;
    return Math.min(Math.round((ziel * monate) / (r.fristMonate as number)), ziel);
  }
  return (r.rate ?? 0) * monate;
}

/** Summe der monatlichen Rücklagen — der Betrag, der jeden Monat gebunden ist. */
export function monatsRuecklageGesamt(items: readonly Ruecklage[]): Cent {
  return items.reduce((s, r) => s + monatsRuecklage(r), 0);
}

/**
 * Summe der Ziele — was am Ende aller Fristen beisammen sein soll.
 *
 * Freie Rücklagen zählen NICHT mit: sie haben kein Ende, und ihren bis heute
 * aufgelaufenen Soll-Stand hier hineinzurechnen mischte zwei Aussagen („was soll einmal
 * dasein" und „was ist bis jetzt fällig") zu einer Zahl, die keine von beiden ist.
 */
export function zielwertGesamt(items: readonly Ruecklage[]): Cent {
  return items.reduce((s, r) => s + (hatZiel(r) ? (r.ziel as Cent) : 0), 0);
}

export interface RuecklagenPosten {
  readonly ruecklage: Ruecklage;
  /** Was bis `am` zurückgelegt sein sollte. */
  readonly soll: Cent;
  /** Anteil am realen Kontostand; `null` ohne Kontozuordnung (dann nur Rechnung). */
  readonly tatsaechlich: Cent | null;
}

export interface RuecklagenDeckung {
  readonly posten: readonly RuecklagenPosten[];
  readonly soll: Cent;
  /** Nur die Rücklagen MIT Konto — sonst stünde ein Soll ohne Gegenstück im Nenner. */
  readonly sollMitKonto: Cent;
  readonly tatsaechlich: Cent;
  /** 0–100, gedeckelt. 100, wenn nichts zu decken ist. */
  readonly grad: number;
}

/**
 * Gleicht die Rechnung gegen die Wirklichkeit ab: je Konto wird der reale Stand auf die
 * Rücklagen verteilt, die auf dieses Konto zeigen — anteilig an ihrem Soll.
 *
 * Bewusst KEINE Allokation nach Priorität und keine Warnung: liegen auf dem Rücklagenkonto
 * 60 % dessen, was rechnerisch beisammen sein müsste, dann ist jede Rücklage darauf zu
 * 60 % gedeckt. Alles andere würde eine Reihenfolge behaupten, die es nicht gibt.
 *
 * Überschuss wird gekappt (Grad ≤ 100 %): mehr als ihren Soll-Stand trägt eine Rücklage
 * nicht, auch wenn auf dem Konto mehr liegt.
 */
export function ruecklagenDeckung(
  items: readonly Ruecklage[],
  am: string,
  kontostaende: ReadonlyMap<string, Cent>,
): RuecklagenDeckung {
  const soll = new Map<string, Cent>();
  for (const r of items) {
    if (!r.kontoId) continue;
    soll.set(r.kontoId, (soll.get(r.kontoId) ?? 0) + sollRuecklage(r, am));
  }

  /** Deckungsanteil eines Kontos, 0–1. Ohne Soll ist nichts zu decken. */
  const anteil = (kontoId: string): number => {
    const s = soll.get(kontoId) ?? 0;
    if (s <= 0) return 0;
    const stand = kontostaende.get(kontoId) ?? 0;
    return Math.max(0, Math.min(1, stand / s));
  };

  const posten = items.map((r): RuecklagenPosten => {
    const s = sollRuecklage(r, am);
    return {
      ruecklage: r,
      soll: s,
      tatsaechlich: r.kontoId ? Math.round(s * anteil(r.kontoId)) : null,
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

/**
 * Die Mindestrücklage nach der Faustformel: drei Monatseinnahmen.
 *
 * REINE INFORMATION und keine Regel — nichts im Programm misst etwas daran. Die Formel
 * ist eine verbreitete Faustregel für den Notgroschen, kein Rechenweg mit einer
 * Herleitung; deshalb steht der Faktor als Argument da und nicht als Konstante im Code.
 *
 * Grundlage sind die VERTRAGSEINNAHMEN und nicht die Ist-Einnahmen: was regelmäßig
 * hereinkommt, ist planbar, ein guter Monat ist es nicht. Wer seine Rücklage an einem
 * Bonus bemisst, hat sie im Jahr darauf zu klein.
 */
export function mindestRuecklage(monatsEinnahmen: Cent, monate = 3): Cent {
  return Math.max(0, Math.round(monatsEinnahmen * monate));
}
