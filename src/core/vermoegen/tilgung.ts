// Tilgung — wie viel eine Schuld in einem Monat gesunken ist, abgeleitet aus der Reihe
// ihrer Restschulden.
//
// KEIN PLAN. Zinssatz, Laufzeit und Rate kennt die App nicht und will sie nicht kennen
// (`CLAUDE.md` daneben, „Warum kein Tilgungsplan"): eine gerechnete Restschuld stünde
// nach der ersten Sondertilgung gegen die der Bank. Gelesen wird nur, was schon da ist —
// zwei Restschulden zu zwei Stichtagen. Der Rückgang dazwischen IST die Tilgung des
// Zeitraums; offen ist nur, wie er sich auf die Monate verteilt, und dafür nimmt die
// Rechnung das Einfachste: gleichmässig.
//
// Das ist eine Glättung und keine Interpolation der Restschuld. Das Nettovermögen
// zwischen zwei Stichtagen bleibt bei der jüngsten Beobachtung (`beobachtungAm`); hier
// wird nur gesagt, welcher Teil der Rate eines Monats Vermögen aufgebaut hat. Über den
// Zeitraum summiert stimmt die Zahl exakt — sie ist der Rückgang, Cent für Cent.

import type { Cent } from "../basis/geld";
import { monateZwischen } from "../basis/datum";
import type { Verbindlichkeitsstand } from "./vermoegen";

const monatVon = (iso: string): string => iso.slice(0, 7);

/**
 * Die Tilgung im Monat `monat` („YYYY-MM"), POSITIV — oder `undefined`, wenn sich für
 * diesen Monat nichts ableiten lässt.
 *
 * Die Fälle, und warum jeder so ist:
 *
 *   • **Weniger als zwei Beobachtungen, und jeder Monat bis einschliesslich dem der
 *     ersten:** `undefined`. Eine einzelne Restschuld sagt nichts über ihre Bewegung, und
 *     vor der ersten hat niemand etwas gesagt. Die Ergebnisrechnung rechnet dann wie
 *     ohne Schuld — die ganze Rate ist Kosten.
 *   • **Zwischen zwei Beobachtungen:** der Rückgang, gleichmässig auf die Monate NACH
 *     dem Monat der älteren bis einschliesslich dem der jüngeren. Eine Restschuld zum
 *     31.12. und die nächste zum 31.12. ergeben so genau Januar bis Dezember. Der Rest der
 *     ganzzahligen Teilung fällt in den ersten Monat des Zeitraums — dieselbe Regel wie
 *     `monatsanteil` in der Ergebnisrechnung —, damit die Monate exakt auf den Rückgang
 *     summieren.
 *   • **Steigt die Restschuld** (eine Aufstockung, eine ausgesetzte Rate, aufgelaufene
 *     Zinsen): 0 für den ganzen Zeitraum. Was darin getilgt wurde, ist nicht von dem zu
 *     trennen, was dazukam, und eine negative Tilgung hiesse, die Rate koste mehr, als
 *     abgebucht wurde.
 *   • **Nach der jüngsten Beobachtung:** die zuletzt bekannte Monatstilgung, ohne den
 *     Rest der Teilung, bis die zuletzt bekannte Restschuld aufgebraucht ist. Das ist
 *     eine FORTSCHREIBUNG, kein Plan: sie sagt nur „es geht so weiter wie zuletzt
 *     gesehen". Ohne sie fiele jeder Monat seit dem letzten Jahresauszug — also gerade
 *     der laufende — auf „alles Kosten" zurück, und die Zeile wechselte jedes Jahr
 *     elf Monate lang in die falsche Richtung. Mit der nächsten Beobachtung wird der
 *     Zeitraum zum gewöhnlichen Fall oben und die Fortschreibung durch das Gemessene
 *     ersetzt. Bei einer Annuität ist sie leicht zu niedrig (der Tilgungsanteil wächst
 *     von Monat zu Monat); geschätzt wird trotzdem nichts dazu.
 *   • **Eine stillgelegte Schuld** (`gefuehrt === false`) tilgt nach ihrer letzten
 *     Beobachtung nichts mehr — dieselbe Grenze wie beim Nettovermögen: die letzte
 *     Beobachtung ist das Ende der Geschichte.
 *
 * Mehrere Beobachtungen im selben Monat zählen als eine, die jüngste: ein Zeitraum ohne
 * Monat lässt sich auf keinen Monat verteilen.
 */
export function tilgungIm(
  staende: readonly Verbindlichkeitsstand[],
  gefuehrt: boolean,
  monat: string,
): Cent | undefined {
  const jeMonat = new Map<string, Verbindlichkeitsstand>();
  for (const s of staende) {
    const m = monatVon(s.stichtag);
    const bisher = jeMonat.get(m);
    if (!bisher || s.stichtag > bisher.stichtag) jeMonat.set(m, s);
  }
  const reihe = [...jeMonat.values()].sort((a, b) => a.stichtag.localeCompare(b.stichtag));
  if (reihe.length < 2) return undefined;
  if (monat <= monatVon(reihe[0].stichtag)) return undefined;

  for (let i = 1; i < reihe.length; i++) {
    const vorher = reihe[i - 1];
    const nachher = reihe[i];
    if (monat > monatVon(nachher.stichtag)) continue;
    const rueckgang = vorher.restschuld - nachher.restschuld;
    if (rueckgang <= 0) return 0;
    const monate = monateZwischen(vorher.stichtag, nachher.stichtag);
    const basis = Math.trunc(rueckgang / monate);
    const index = monateZwischen(vorher.stichtag, `${monat}-01`) - 1;
    return index === 0 ? rueckgang - basis * (monate - 1) : basis;
  }

  // Nach der jüngsten Beobachtung: fortgeschrieben.
  if (!gefuehrt) return 0;
  const vorletzte = reihe[reihe.length - 2];
  const letzte = reihe[reihe.length - 1];
  const rueckgang = vorletzte.restschuld - letzte.restschuld;
  if (rueckgang <= 0) return 0;
  const basis = Math.trunc(rueckgang / monateZwischen(vorletzte.stichtag, letzte.stichtag));
  const seither = monateZwischen(letzte.stichtag, `${monat}-01`);
  const schonGetilgt = basis * (seither - 1);
  return Math.max(0, Math.min(basis, letzte.restschuld - schonGetilgt));
}
