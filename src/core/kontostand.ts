// Kontostands-Anker — was an einem Stichtag WIRKLICH auf dem Konto lag.
//
// Bis hierher konnte die App über einen Kontostand nur eine Aussage machen, die in sich
// schlüssig war: Anfangsbestand plus alles, was hereingeschafft wurde. Fehlt eine Buchung,
// fällt das nirgends auf — die Rechnung geht ja trotzdem auf. Der einzige Ausweg ist eine
// zweite, unabhängige Quelle, und genau die ist ein Anker: die Bank meldet ihren Saldo,
// oder du zählst das Portemonnaie.
//
// **Ein Anker ist eine BEOBACHTUNG, kein zwischengespeichertes Rechenergebnis.** Der
// Unterschied ist tragend. Ein Cache müsste ungültig werden, sobald jemand nachträglich
// eine Buchung vor dem Stichtag einfügt, und diese Invalidierung ist die Stelle, an der
// solche Systeme faulen. Eine Beobachtung wird nie falsch: was die Bank an einem Tag
// gemeldet hat, bleibt wahr, egal was danach nachgebucht wird. Was sich ändert, ist die
// DIFFERENZ — und die ist genau die Information, die man sehen will.
//
// **Was ein einzelner Anker nicht kann.** Er sagt „hier fehlen 600 Euro", aber nicht, wo.
// Bei 224 Buchungen über fünf Jahre ist das keine brauchbare Auskunft. Deshalb werden sie
// aufgehoben statt überschrieben: zwischen zwei Ankern lässt sich die Differenz einkreisen
// (`abweichungsfenster`), und aus fünf Jahren werden zwei Wochen.
//
// **Der Anfangsbestand ist selbst nur eine Schätzung** — er überbrückt die Historie vor
// dem ersten Import. Deshalb rechnet `abweichungsfenster` bewusst OHNE ihn: es vergleicht
// nur Anker gegen Anker. Was vor dem ersten Anker liegt, ist unentscheidbar (fehlende
// Buchung oder falscher Anfangsbestand — aus den Daten nicht zu trennen); was danach
// entsteht, ist immer ein echter Fehler.

import { parseIso } from "./datum";
import type { Cent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import type { Zahlungskonto } from "./konto";

/** Woher der Stichtags-Stand stammt. */
export type Ankerherkunft = "bank" | "hand";

export interface Kontostandsanker {
  readonly kontoId: string;
  /** Stichtag (ISO-Datum) — auf DIESEN Tag bezieht sich der Betrag. */
  readonly datum: string;
  readonly herkunft: Ankerherkunft;
  readonly betrag: Cent;
  /** Wann wir davon erfahren haben (ISO-Zeitpunkt) — nicht der Stichtag. */
  readonly erfasstAm: string;
}

/** Ein Zeitraum, in dem der Stand auseinandergelaufen ist. */
export interface Abweichungsfenster {
  /** Stichtag des früheren Ankers. */
  readonly von: string;
  /** Stichtag des späteren Ankers. */
  readonly bis: string;
  /**
   * Was in diesem Zeitraum fehlt. Positiv: die Bank hat mehr, der App fehlt eine
   * Einnahme. Negativ: die App hat mehr, eine Ausgabe fehlt oder etwas steht doppelt.
   */
  readonly betrag: Cent;
}

/** Die Anker eines Kontos, ältester zuerst. */
export function ankerFuer(
  anker: readonly Kontostandsanker[],
  kontoId: string,
): Kontostandsanker[] {
  return anker
    .filter((a) => a.kontoId === kontoId)
    .sort((x, y) => x.datum.localeCompare(y.datum) || x.erfasstAm.localeCompare(y.erfasstAm));
}

/**
 * Der jüngste Anker bis einschliesslich `bis`.
 *
 * Ohne `bis` der jüngste überhaupt. Liegen an einem Tag zwei Anker (Bank UND Kassensturz),
 * gewinnt der zuletzt erfasste — er ist die jüngere Beobachtung.
 */
export function juengsterAnker(
  anker: readonly Kontostandsanker[],
  kontoId: string,
  bis?: string,
): Kontostandsanker | undefined {
  const passend = ankerFuer(anker, kontoId).filter((a) => !bis || a.datum <= bis);
  return passend[passend.length - 1];
}

/** Summe der Buchungen eines Kontos bis einschliesslich `bis`. */
export function istSummeBis(
  buchungen: readonly IstBuchung[],
  kontoId: string,
  bis: string,
): Cent {
  return buchungen.reduce(
    (s, b) => (b.kontoId === kontoId && b.datum <= bis ? s + b.betrag : s),
    0,
  );
}

/** Summe der Buchungen eines Kontos in `(von, bis]` — der Anfang ist AUSgeschlossen. */
export function istSummeZwischen(
  buchungen: readonly IstBuchung[],
  kontoId: string,
  von: string,
  bis: string,
): Cent {
  return buchungen.reduce(
    (s, b) => (b.kontoId === kontoId && b.datum > von && b.datum <= bis ? s + b.betrag : s),
    0,
  );
}

/**
 * Was der Anfangsbestand sein müsste, damit die Vorwärtsrechnung genau den Anker trifft.
 *
 * Das ist der Rückrechnungs-Weg, und er gehört EINMALIG angewandt, nicht bei jeder
 * Anzeige: was hier in den Anfangsbestand wandert, ist ab dann unsichtbar. Solange der
 * Anfangsbestand nur die fehlende Vorgeschichte überbrückt, ist das richtig. Sobald
 * einmal abgeglichen wurde, ist jede neue Abweichung ein echter Fehler und darf nicht
 * mehr still verrechnet werden.
 */
export function anfangsbestandAusAnker(
  buchungen: readonly IstBuchung[],
  anker: Kontostandsanker,
): Cent {
  return anker.betrag - istSummeBis(buchungen, anker.kontoId, anker.datum);
}

/**
 * Abweichung AN einem Anker: was die Quelle sagt, minus was die App bis dahin rechnet.
 *
 * Gezählt wird nur, was BIS ZUM STICHTAG gebucht ist. Die Vorgängerfunktion verglich den
 * gemeldeten Stand gegen alle Buchungen überhaupt; solange der einzige gespeicherte Stand
 * immer „heute" war, fiel das nicht auf. Mit einer Anker-Historie wäre es ein
 * systematischer Fehler: ein Anker vom Juni gegen Buchungen vom August gerechnet.
 */
export function ankerAbweichung(
  konto: Zahlungskonto,
  buchungen: readonly IstBuchung[],
  anker: Kontostandsanker,
): Cent {
  return anker.betrag - (konto.saldo + istSummeBis(buchungen, konto.id, anker.datum));
}

/**
 * Zwischen welchen Ankern ist der Stand auseinandergelaufen?
 *
 * Verglichen wird Anker gegen Anker: was die Quelle zwischen zwei Stichtagen an
 * Veränderung meldet, muss der Summe der Buchungen dazwischen entsprechen. Tut es das
 * nicht, fehlt in genau diesem Zeitraum etwas.
 *
 * Der Anfangsbestand kommt in dieser Rechnung nicht vor — mit Absicht. Er ist selbst eine
 * Schätzung, und ein falscher Anfangsbestand verschiebt jede Abweichung um denselben
 * Betrag, ohne die DIFFERENZ zwischen zwei Ankern anzutasten. Deshalb ist das hier die
 * belastbarste Aussage, die die App über Vollständigkeit machen kann.
 *
 * Leere Liste heisst: zwischen allen bekannten Ankern passt alles zusammen.
 */
export function abweichungsfenster(
  buchungen: readonly IstBuchung[],
  anker: readonly Kontostandsanker[],
  kontoId: string,
): Abweichungsfenster[] {
  const reihe = ankerFuer(anker, kontoId);
  const raus: Abweichungsfenster[] = [];
  for (let i = 1; i < reihe.length; i++) {
    const von = reihe[i - 1];
    const bis = reihe[i];
    const gemeldet = bis.betrag - von.betrag;
    const gebucht = istSummeZwischen(buchungen, kontoId, von.datum, bis.datum);
    const betrag = gemeldet - gebucht;
    if (betrag !== 0) raus.push({ von: von.datum, bis: bis.datum, betrag });
  }
  return raus;
}

/**
 * Ein Anker aus einer Bankmeldung.
 *
 * `parseIso` wirft bei einem Datum, das es nicht gibt — ein Anker mit krummem Stichtag
 * wäre schlimmer als keiner: er stünde in der Reihe, sortierte falsch und erklärte eine
 * Abweichung dem falschen Zeitraum zu.
 */
export function bankAnker(
  kontoId: string,
  betrag: Cent,
  datum: string,
  erfasstAm: string,
): Kontostandsanker {
  parseIso(datum);
  return { kontoId, datum, herkunft: "bank", betrag, erfasstAm };
}
