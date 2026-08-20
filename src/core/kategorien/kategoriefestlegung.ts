// Kategorie-Festlegungen — das dünne Overlay über der Erkennung.
//
// Das Modell entscheidet gut, aber es entscheidet statistisch: eine Korrektur von Hand ist
// darin ein Datenpunkt unter tausenden und kann beim nächsten Training überstimmt werden.
// Für die meisten Fälle ist genau das richtig — für manche nicht. „Die Zahlungen an meine
// Schwiegermutter sind Kinderbetreuung" ist keine Wahrscheinlichkeit, sondern eine
// Aussage, und sie soll halten.
//
// Deshalb diese Ebene, und deshalb so schmal wie möglich:
//
//   • **Nur Empfänger → Kategorie.** Keine Betragsspanne, kein Gültigkeitszeitraum, kein
//     Konto. Die Erkennungsregel eines Vertrags braucht das alles, weil sie IDENTITÄT
//     trifft (dieser eine Vertrag) und ein Falschtreffer teuer ist. Eine Kategorie ist
//     eine KLASSE: Lebensmittel kosten mal 8 € und mal 190 €, und eine Spanne darum wäre
//     eine Einschränkung, die niemand gemeint hat.
//   • **Sie entsteht nur auf Ansage.** Wer im Import oder im Buchungsdialog eine Kategorie
//     korrigiert, ändert damit erstmal nur diese eine Buchung. Eine Festlegung entsteht
//     erst, wenn jemand ausdrücklich „immer bei diesem Empfänger" sagt. Ohne diese Hürde
//     wüchse hier die Regelliste heran, die der ganze Ansatz vermeiden soll.
//
// Rein, kein IO.

import { musterSchaerfe, musterTrifft } from "../basis/muster";
import { anbieterSchluessel } from "../vertraege/vertragErkennung";

/**
 * Eine Festlegung: Empfängermuster → Kategorie.
 *
 * `muster` darf `*` enthalten (siehe `core/muster`) und wird gegen ZWEI Formen des
 * Empfängers geprüft — den Namen, wie er im Auszug steht, und seine normalisierte Form.
 * Dieselbe Zusage wie bei der Vertragserkennung: wer eine der beiden Formen abtippt,
 * bekommt einen Treffer und muss nicht raten, welche gemeint war.
 */
export interface Kategoriefestlegung {
  readonly muster: string;
  readonly kategorieId: string;
  /** ISO-Zeitpunkt — die Liste soll später erklären können, wann sie entstanden ist. */
  readonly angelegtAm: string;
}

/**
 * Das Muster, das für diesen Empfänger vorgeschlagen wird: seine normalisierte Form.
 *
 * Nicht der rohe Name, weil der Schreibweisen mitschleppt, die nichts bedeuten
 * („KESSELMANN INTERNATIONAL B.V." vs. „Kesselmann International BV"). Leer, wenn nach der
 * Normalisierung nichts übrig bleibt — dann gibt es nichts festzulegen.
 */
export function musterVorschlag(gegenpartei: string): string {
  return anbieterSchluessel(gegenpartei.trim());
}

/** Trifft eine Festlegung auf diesen Empfänger zu? */
export function festlegungTrifft(f: Kategoriefestlegung, gegenpartei: string): boolean {
  const muster = f.muster.trim();
  if (!muster) return false;
  const roh = gegenpartei.trim();
  return musterTrifft(muster, roh) || musterTrifft(muster, anbieterSchluessel(roh));
}

/**
 * Welche Festlegung für diesen Empfänger gilt — oder null.
 *
 * Bei mehreren Treffern gewinnt die SCHÄRFERE: „kesselmann" schlägt „net*". Das ist die
 * Reihenfolge, die man erwartet, wenn man eine Ausnahme von einer breiten Regel eintippt
 * — und sie ist deterministisch, damit ein rückwirkender Abgleich zweimal dasselbe
 * Ergebnis liefert statt bei jedem Lauf Kategorien umspringen zu lassen. Bei gleicher
 * Schärfe entscheidet das Muster selbst, rein der Stabilität wegen.
 */
export function festlegungFuer(
  festlegungen: readonly Kategoriefestlegung[],
  gegenpartei: string,
): Kategoriefestlegung | null {
  let gewinner: Kategoriefestlegung | null = null;
  for (const f of festlegungen) {
    if (!festlegungTrifft(f, gegenpartei)) continue;
    if (!gewinner) {
      gewinner = f;
      continue;
    }
    const a = musterSchaerfe(f.muster);
    const b = musterSchaerfe(gewinner.muster);
    if (a > b || (a === b && f.muster < gewinner.muster)) gewinner = f;
  }
  return gewinner;
}
