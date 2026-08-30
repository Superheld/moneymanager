// Was mit einer Buchung geschah — und der Weg zurueck.
//
// Geschrieben wird das Journal im Repository (`adapters/persistence/sqliteLedgerRepository`),
// gelesen hier. Der Kern kennt nur die FORM eines Eintrags und beantwortet zwei Fragen,
// die reine Rechnung sind: „wie sah die Buchung bei ihrer Entstehung aus" und „was hat
// sich seitdem geaendert".
//
// **Das Journal ist eine Aufzeichnung, kein Speicher.** Es traegt bewusst keinen
// Fremdschluessel auf `ist_buchung` (siehe CLAUDE.md) und darf deshalb auch nicht so
// benutzt werden, als muesste es vollstaendig sein: fehlt ein Eintrag, entfaellt das
// ANGEBOT zurueckzusetzen — es geht nichts kaputt und nichts verloren, was nicht ohnehin
// verloren waere. Ein Ablauf, der einen Eintrag VORAUSSETZT, gehoert nicht hierher.
//
// Praktisch heisst das: der Bestand vor dem 23.08.2026 hat keine Eintraege. Fuer
// importierte Buchungen liegt das Original ohnehin woanders — im Beleg (`umsatz_roh`),
// der unveraenderlich ist. Ein Rueckweg von dort ist moeglich und waere der zweite; er
// liefert die Buchung, wie sie HEUTE entstuende (mit dem heutigen Kategorievorschlag),
// nicht wie sie damals entstand. Zwei verschiedene Aussagen, deshalb zwei Wege.

import type { IstBuchung } from "./istbuchung";

/** Was mit der Buchung geschah. Dieselben drei Werte, die das Repository schreibt. */
export type Journalart = "angelegt" | "geaendert" | "geloescht";

/**
 * Ein Eintrag im Buchungsjournal — der ganze Zustand vorher und nachher, nicht der
 * Unterschied. Wer eine Kette von Diffs zurueckrechnen muss, um den Stand von damals zu
 * sehen, hat kein Protokoll, sondern eine Aufgabe.
 *
 * `vorher` fehlt beim Anlegen, `nachher` beim Loeschen.
 *
 * **Zwei Felder fehlen in beiden.** `vertragId` und `vertragHerkunft` stehen zwar in der
 * Datenbank am selben Datensatz, gehoeren aber nicht dem Ledger: geschrieben werden sie
 * von der Vertragszuordnung. Sie hier mitzufuehren hiesse, ein Zuruecksetzen koennte sie
 * wiederherstellen — es kann nicht, weil der Weg dorthin ein anderer Port ist.
 */
export interface Journaleintrag {
  readonly id: string;
  readonly istbuchungId: string;
  /** ISO-Zeitstempel mit Uhrzeit. */
  readonly zeitpunkt: string;
  readonly art: Journalart;
  readonly vorher?: IstBuchung;
  readonly nachher?: IstBuchung;
}

/**
 * Die Felder, deren Unterschied jemanden interessiert.
 *
 * Nicht dabei sind `id`, `quelle` und `rohHash`: sie sagen, WER die Zeile ist und woher
 * sie kam, und beides aendert sich ueber die Lebenszeit einer Buchung nicht. Stuenden sie
 * in der Liste, waere jede Anzeige um drei Zeilen laenger, die nie etwas zeigen.
 */
export const VERGLEICHSFELDER = [
  "datum",
  "betrag",
  "kontoId",
  "kategorieId",
  "kategorieHerkunft",
  "charakter",
  "notiz",
  "aufteilungen",
  "transferId",
  "gegenkontoId",
  "zuPruefen",
] as const;

export type Vergleichsfeld = (typeof VERGLEICHSFELDER)[number];

/**
 * Vergleicht EIN Feld. Ueber JSON, weil `aufteilungen` kein Skalar ist und ein
 * Vergleich mit `===` dort immer „verschieden" saegte — bei jedem Laden ein neues
 * Objekt.
 *
 * `undefined` und `null` gelten als gleich: die Datenbank speichert NULL, das Modell
 * laesst das Feld weg, und beides heisst dasselbe. Ohne diese Gleichsetzung meldete jede
 * Buchung ohne Notiz einen Unterschied gegen sich selbst.
 */
function feldGleich(a: IstBuchung, b: IstBuchung, feld: Vergleichsfeld): boolean {
  const x = a[feld] ?? null;
  const y = b[feld] ?? null;
  if (x === null || y === null) return x === y;
  return JSON.stringify(x) === JSON.stringify(y);
}

/** Welche Felder sich zwischen zwei Staenden unterscheiden. Leer heisst: nichts. */
export function unterschiede(a: IstBuchung, b: IstBuchung): Vergleichsfeld[] {
  return VERGLEICHSFELDER.filter((f) => !feldGleich(a, b, f));
}

/**
 * Der Stand bei der Entstehung — das `nachher` des Anlege-Eintrags.
 *
 * Der LETZTE Anlege-Eintrag, nicht der erste: eine geloeschte Buchung kann unter
 * derselben Id wieder entstehen (der Rueckweg aus dem Journal tut genau das), und dann
 * beginnt mit ihm ein neues Leben. Der Eintrag davor gehoert zum alten und ist als
 * Rueckfallstand falsch.
 *
 * `undefined`, wenn es keinen gibt — bei allem, was vor der Einfuehrung des Journals
 * entstanden ist. Das ist kein Fehler, sondern die Auskunft „von hier fuehrt kein Weg
 * zurueck"; der Aufrufer bietet dann nichts an.
 */
export function urzustand(eintraege: readonly Journaleintrag[]): IstBuchung | undefined {
  for (let i = eintraege.length - 1; i >= 0; i--) {
    const e = eintraege[i];
    if (e.art === "angelegt" && e.nachher) return e.nachher;
  }
  return undefined;
}

/**
 * Der letzte festgehaltene Stand einer Buchung, die es nicht mehr gibt.
 *
 * Das Gegenstueck zu `urzustand` fuer den Loeschfall: der Eintrag ueberlebt die Buchung,
 * weil die Tabelle keinen Fremdschluessel traegt. Ohne dieses Ueberleben waere gerade der
 * Fall, in dem man das Protokoll braucht, der eine, in dem es fehlt.
 */
export function letzterStand(eintraege: readonly Journaleintrag[]): IstBuchung | undefined {
  const letzter = eintraege[eintraege.length - 1];
  return letzter?.art === "geloescht" ? letzter.vorher : undefined;
}
