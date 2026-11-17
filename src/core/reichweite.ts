// Reichweite — wie viele Monate das freie Geld die laufenden Kosten trägt, wenn nichts
// mehr hereinkommt.
//
// Die Rechnung verbindet zwei, die es schon gibt, und erfindet keine dritte:
//
//   • Der ZÄHLER ist das, was auf den liquiden Konten FREI ist — der Stand ohne das, was
//     Rücklagen und aufbauenden Budgets gehört. Das rechnet die Kontobelegung
//     (`konten/kontobelegung.ts`, `bilanzJeKlasse`); dieselbe Zahl steht in der Übersicht
//     unter „Was da ist". Hier kommt sie nur herein.
//   • Der NENNER ist, was ein Monat KOSTET, aus der Ergebnisrechnung (`ergebnis.ts`) —
//     nicht, was vom Konto ging. Ein Jahresbeitrag drückt so nicht den einen Monat, in
//     dem er abgeht, sondern jeden mit seinem Zwölftel; ein Durchschnitt über Auszahlungen
//     hinge davon ab, ob die grosse Zahlung zufällig im Fenster liegt.
//
// Die Datei liegt direkt in `src/core/`, weil sie über zwei Bereiche rechnet (Konten und
// die Ergebnisrechnung) — aus demselben Grund wie `ergebnis.ts`. Sie steht NEBEN
// `ergebnis.ts` und nicht darin: sie liest dessen Zeilen nur und fügt ihnen nichts hinzu.
//
// ZWEI Zahlen, nicht eine, und beide mit Absicht:
//
//   • GRUNDKOSTEN — Verträge, monatliche Budgets, Ungeplantes. Das, was weiterläuft, wenn
//     man im Notfall alles Zurücklegen aussetzt. Die längere Reichweite.
//   • ALLE KOSTEN — dazu Rücklagen, aufbauende Budgets und Vorsorge. Wer weiter zurücklegt,
//     kommt so lange aus. Die kürzere.
//
// Eine einzige Zahl müsste sich für eine der beiden Annahmen entscheiden und verschwiege die
// andere. Die Wahrheit liegt dazwischen: wer eine Rücklage aussetzt, zahlt den Kauf, für
// den sie gedacht war, später trotzdem — nur nicht mehr aus ihr.

import type { Cent } from "./basis/geld";
import { addMonate, parseIso, toIso } from "./basis/datum";
import type { IstBuchung } from "./buchung/istbuchung";
import { ergebnisKennzahlen, zeilenIst, type KostenZeileId, type MonatsErgebnis } from "./ergebnis";

/** Über wie viele abgeschlossene Monate höchstens gemittelt wird. */
export const REICHWEITE_MONATE = 12;

/**
 * Darunter gibt es keine Aussage. Mit einem oder zwei Monaten bestimmt ein einzelner
 * ungewöhnlicher Monat (Urlaub, Reparatur) die ganze Zahl — und eine Reichweite, die von
 * einem Monat zum nächsten um die Hälfte springt, ist keine Auskunft, sondern Rauschen.
 * Drei ist das Kleinste, bei dem ein Ausreisser nicht mehr allein entscheidet.
 */
export const REICHWEITE_MINDESTENS = 3;

/**
 * Die Kostenzeilen, die auch im Notfall weiterlaufen. Alles andere in `KOSTENZEILEN` ist
 * Zurücklegen (Rücklagen, aufbauende Budgets, Vorsorge) und lässt sich aussetzen.
 */
// `tilgung` gehört dazu, obwohl sie in der Ergebnisrechnung bei Rücklagen und Vorsorge
// steht: sie ist Teil einer Vertragsrate, und eine Kreditrate lässt sich nicht aussetzen
// wie das Zurücklegen. Ohne sie reichte das Geld hier länger, als es reicht.
export const GRUNDKOSTEN = ["fixkosten", "tilgung", "laufend", "ungeplant"] as const satisfies readonly KostenZeileId[];

/**
 * Die Monate, über die gemittelt wird — ihre Ersten, älteste zuerst.
 *
 * Die letzten `anzahl` ABGESCHLOSSENEN Monate vor dem von `heute`. Der laufende zählt nicht,
 * dieselbe Regel wie in der Kostensicht der Analyse: Rücklagen und aufbauende Budgets stehen
 * in ihm schon mit der ganzen Rate da, Ungeplantes erst zur Hälfte.
 *
 * Und nicht vor dem ersten VOLLEN Monat mit Buchungen. Ein Monat vor dem ersten Import
 * kostete in der Rechnung nichts und zöge den Durchschnitt nach unten — die Reichweite
 * stünde dann zu lang da, also falsch in die gefährliche Richtung. Aus demselben Grund
 * fällt der Monat der ersten Buchung heraus, wenn sie nicht am Ersten liegt: er ist
 * vermutlich nur zum Teil erfasst.
 */
export function reichweitenMonate(
  heute: string,
  buchungen: readonly Pick<IstBuchung, "datum">[],
  anzahl = REICHWEITE_MONATE,
): string[] {
  // Der TAG der frühesten Buchung, nicht ihr Monat (`fruehesterMonat`): ob der erste
  // Monat voll ist, hängt genau daran.
  let ersteBuchung: string | undefined;
  for (const b of buchungen) if (ersteBuchung === undefined || b.datum < ersteBuchung) ersteBuchung = b.datum;
  if (!ersteBuchung) return [];
  const dieser = { ...parseIso(heute), d: 1 };
  const erste = parseIso(ersteBuchung);
  const ersterVoller = toIso(erste.d === 1 ? erste : { ...addMonate({ ...erste, d: 1 }, 1), d: 1 });
  const raus: string[] = [];
  for (let i = anzahl; i >= 1; i--) {
    const monat = toIso({ ...addMonate(dieser, -i), d: 1 });
    if (monat >= ersterVoller) raus.push(monat);
  }
  return raus;
}

/**
 * Wie viele Monate `frei` die Kosten `kostenJeMonat` trägt — auf ein Zehntel ABGERUNDET.
 *
 *   • Keine Kosten (0 oder darunter, etwa wenn Erstattungen überwiegen) → `null`. „Unendlich"
 *     wäre keine Zahl, die jemand lesen kann, und es wäre auch nicht wahr: es heisst nur,
 *     dass im Fenster nichts gekostet hat.
 *   • Negatives freies Geld → 0. Mehr als „nichts" lässt sich daraus nicht ablesen; eine
 *     negative Reichweite hätte keine Bedeutung.
 *   • Abgerundet, weil eine Reichweite eine Zusage ist: aufgerundet verspräche sie ein
 *     Zehntel Monat, für das kein Geld da ist. Gerechnet in ganzen Zahlen, damit 2,3 nicht
 *     über 22,999… zu 2,2 wird.
 */
export function reichweiteInMonaten(frei: Cent, kostenJeMonat: Cent): number | null {
  if (kostenJeMonat <= 0) return null;
  if (frei <= 0) return 0;
  return Math.floor((frei * 10) / kostenJeMonat) / 10;
}

export interface Reichweite {
  /** Über wie viele abgeschlossene Monate gemittelt wurde. */
  readonly monate: number;
  /** Das freie Geld, das gerechnet wurde. */
  readonly frei: Cent;
  /** Durchschnittliche Grundkosten je Monat, POSITIV (`GRUNDKOSTEN`). */
  readonly grundkosten: Cent;
  /** Durchschnittliche Kosten je Monat über alle Kostenzeilen, POSITIV. */
  readonly alleKosten: Cent;
  /** Reichweite gegen die Grundkosten — die längere. `null` ohne Kosten. */
  readonly ohneZuruecklegen: number | null;
  /** Reichweite gegen alle Kosten — die kürzere. `null` ohne Kosten. */
  readonly mitZuruecklegen: number | null;
}

/**
 * Die Reichweite aus dem freien Geld und einer Reihe von Monatsergebnissen.
 *
 * Laufende und künftige Monate werden übergangen, wer sie hereinreicht, verfälscht also
 * nichts. Bleiben weniger als `REICHWEITE_MINDESTENS`, gibt es keine Aussage (`null`) —
 * nicht eine Zahl mit Vorbehalt, denn den Vorbehalt liest niemand, die Zahl schon.
 *
 * Die Kosten kommen wie in `ergebnisKennzahlen` durch Negieren der Summe zustande, nie über
 * `Math.abs` je Zeile: eine Erstattung, die eine Zeile ins Plus dreht, muss die Kosten
 * senken. `alleKosten` IST deshalb `ergebnisKennzahlen(…).kostenJeMonat` — dieselbe Zahl,
 * nicht nachgebaut.
 */
export function reichweite(frei: Cent, monate: readonly MonatsErgebnis[]): Reichweite | null {
  const abgeschlossen = monate.filter((m) => !m.laufend && !m.zukunft);
  const n = abgeschlossen.length;
  if (n < REICHWEITE_MINDESTENS) return null;

  const grundSumme = -abgeschlossen.reduce((s, m) => s + GRUNDKOSTEN.reduce((t, id) => t + zeilenIst(m, id), 0), 0);
  const grundkosten = Math.round(grundSumme / n) || 0;
  const alleKosten = ergebnisKennzahlen(abgeschlossen).kostenJeMonat;

  return {
    monate: n,
    frei,
    grundkosten,
    alleKosten,
    ohneZuruecklegen: reichweiteInMonaten(frei, grundkosten),
    mitZuruecklegen: reichweiteInMonaten(frei, alleKosten),
  };
}
