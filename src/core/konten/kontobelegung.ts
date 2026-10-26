// Kontobelegung — wem das Geld auf einem Konto gehört.
//
// Die EINE Rechnung für die Frage „wie viel von diesem Stand ist für etwas bestimmt, und
// wie viel ist frei". Bis 2026-10-26 beantworteten sie mehrere Stellen je zur Hälfte, und
// keine kannte die anderen: die Rücklagen-Deckung verteilte den GANZEN Kontostand auf die
// Rücklagen, obwohl ein aufbauendes Budget auf demselben Konto denselben Euro für sich
// beanspruchte. Die Deckung sah dann besser aus, als sie war, und nichts warnte.
//
// Deshalb kennt diese Datei keine Rücklage und kein Budget, nur ANSPRÜCHE: wer einen hat,
// liefert ihn als `Anspruch` an, und jede Anzeige liest dieselbe Belegung. Eine zweite,
// leicht andere Lesart kann so nicht entstehen, ohne dass sie hier auffällt.
//
// Drei Entscheidungen, die man kennen muss:
//
//  • **Unterdeckung wird ANTEILIG verteilt**, über alle Ansprüche gleich. Liegen auf dem
//    Konto 60 % dessen, was beansprucht wird, ist jeder Anspruch zu 60 % gedeckt — eine
//    Reihenfolge zu behaupten, die niemand festgelegt hat, wäre erfunden.
//  • **Überschuss wird nicht verteilt.** Mehr als seinen Betrag trägt kein Anspruch; was
//    darüber liegt, ist `frei`.
//  • **Der Rest eines MONATLICHEN Budgets ist kein Anspruch.** Er verfällt zum Monatsende
//    und bleibt dann einfach auf dem Konto liegen, ohne Kommentar. Gebunden ist nur, was
//    über den Monat hinaus jemandem gehört: eine Rücklage und der Rest eines aufbauenden
//    Budgets.

import type { Cent } from "../basis/geld";

export type Anspruchsart = "ruecklage" | "budget";

/** Ein Anspruch auf Geld, das auf einem bestimmten Konto liegen soll. */
export interface Anspruch {
  readonly art: Anspruchsart;
  /** Id der Rücklage bzw. des Budgets. */
  readonly id: string;
  readonly kontoId: string;
  /** Was beansprucht wird, POSITIV. Ein Anspruch von 0 oder darunter ist keiner. */
  readonly betrag: Cent;
}

export interface Belegungsposten extends Anspruch {
  /** Welcher Teil davon auf dem Konto tatsächlich liegt — höchstens `betrag`. */
  readonly gedeckt: Cent;
}

export interface Kontobelegung {
  readonly kontoId: string;
  readonly stand: Cent;
  readonly posten: readonly Belegungsposten[];
  /** Σ aller Ansprüche. */
  readonly gebunden: Cent;
  /** Stand minus Ansprüche. NEGATIV heisst: es fehlt so viel, um alles zu decken. */
  readonly frei: Cent;
  /** Deckungsgrad 0–1. 1, wenn nichts beansprucht wird. */
  readonly anteil: number;
}

/**
 * Die Belegung jedes Kontos aus `kontostaende` — auch der Konten ohne Anspruch, damit
 * eine Anzeige nicht unterscheiden muss, ob sie gefragt hat oder ob es nichts gibt.
 *
 * Ansprüche auf ein Konto, das nicht in `kontostaende` steht, zählen gegen einen Stand
 * von 0: eine Rücklage, deren Konto gelöscht wurde, ist ungedeckt, nicht verschwunden.
 */
export function kontobelegung(
  kontostaende: ReadonlyMap<string, Cent>,
  ansprueche: readonly Anspruch[],
): Map<string, Kontobelegung> {
  const jeKonto = new Map<string, Anspruch[]>();
  for (const a of ansprueche) {
    if (a.betrag <= 0) continue;
    const liste = jeKonto.get(a.kontoId);
    if (liste) liste.push(a);
    else jeKonto.set(a.kontoId, [a]);
  }

  const raus = new Map<string, Kontobelegung>();
  const ids = new Set([...kontostaende.keys(), ...jeKonto.keys()]);
  for (const kontoId of ids) {
    const stand = kontostaende.get(kontoId) ?? 0;
    const eigene = jeKonto.get(kontoId) ?? [];
    const gebunden = eigene.reduce((s, a) => s + a.betrag, 0);
    const anteil = gebunden > 0 ? Math.max(0, Math.min(1, stand / gebunden)) : 1;
    raus.set(kontoId, {
      kontoId,
      stand,
      posten: eigene.map((a) => ({ ...a, gedeckt: Math.round(a.betrag * anteil) })),
      gebunden,
      frei: stand - gebunden,
      anteil,
    });
  }
  return raus;
}
