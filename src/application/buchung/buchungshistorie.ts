// Was mit einer Buchung geschah — lesen und zuruecknehmen.
//
// Das Journal lag seit seiner Einfuehrung nur in der Datenbank: jede Aenderung wurde
// mitgeschrieben, und niemand hat sie je gesehen. Diese Datei ist die Naht dorthin.
//
// **Zwei Wege zurueck, und sie bedeuten Verschiedenes.** Hier gebaut ist der erste:
//
//   1. Auf den Stand bei ENTSTEHUNG — aus dem Journal. Die Buchung, wie sie damals war,
//      mit dem Kategorievorschlag von damals. Reicht nur so weit zurueck wie das Journal.
//   2. Auf den BELEG — aus `umsatz_roh`, neu abgeleitet. Reicht ueber den ganzen Bestand,
//      liefert aber die Buchung, wie sie HEUTE entstuende. Existiert noch nicht.
//
// Wer beide unter einen Knopf legt und je nach Verfuegbarkeit den einen oder anderen
// nimmt, hat einen Knopf, der zwei verschiedene Dinge tut, ohne dass man sieht welches.

import { FachlicherFehler, unterschiede, urzustand, type IstBuchung, type Journaleintrag, type Vergleichsfeld } from "../../core";
import type { JournalRepository, LedgerPort } from "../ports";

/**
 * Warum der Rueckweg offensteht — oder warum nicht.
 *
 * Ein blosses `moeglich: false` waere in der Oberflaeche ein fehlender Knopf ohne
 * Erklaerung, und „warum kann ich das hier nicht" ist genau die Frage, die dann kommt.
 */
export type Rueckwegstand =
  | { readonly moeglich: true }
  /** Kein Anlege-Eintrag — die Buchung ist aelter als das Journal. */
  | { readonly moeglich: false; readonly grund: "keinUrzustand" }
  /** Sie steht noch so da, wie sie entstanden ist. Nichts zurueckzunehmen. */
  | { readonly moeglich: false; readonly grund: "unveraendert" }
  /** Sie ist Bein einer Umbuchung (jetzt oder damals) — siehe `buchungZuruecksetzen`. */
  | { readonly moeglich: false; readonly grund: "paarung" };

export interface Buchungshistorie {
  /** Alle Eintraege, aeltester zuerst. */
  readonly eintraege: readonly Journaleintrag[];
  /** Der Stand bei Entstehung, sofern protokolliert. */
  readonly urzustand?: IstBuchung;
  /** Welche Felder heute anders stehen als bei der Entstehung. */
  readonly abweichungen: readonly Vergleichsfeld[];
  readonly rueckweg: Rueckwegstand;
}

/**
 * Die Historie einer Buchung samt der Frage, ob sich etwas zuruecknehmen laesst.
 *
 * `aktuell` kommt herein statt hier geladen zu werden: der Dialog hat den frischen Stand
 * ohnehin, und ein zweiter Ledger-Durchlauf ueber tausende Buchungen nur fuer eine Zeile
 * waere Verschwendung.
 */
export async function historieLaden(
  repo: JournalRepository,
  aktuell: IstBuchung,
): Promise<Buchungshistorie> {
  const eintraege = await repo.zuBuchung(aktuell.id);
  const ur = urzustand(eintraege);
  const abweichungen = ur ? unterschiede(ur, aktuell) : [];
  return { eintraege, urzustand: ur, abweichungen, rueckweg: rueckwegStand(aktuell, ur, abweichungen) };
}

function rueckwegStand(
  aktuell: IstBuchung,
  ur: IstBuchung | undefined,
  abweichungen: readonly Vergleichsfeld[],
): Rueckwegstand {
  if (!ur) return { moeglich: false, grund: "keinUrzustand" };
  if (abweichungen.length === 0) return { moeglich: false, grund: "unveraendert" };
  if (aktuell.transferId || ur.transferId) return { moeglich: false, grund: "paarung" };
  return { moeglich: true };
}

/**
 * Setzt eine Buchung auf ihren Stand bei der Entstehung zurueck.
 *
 * **Eine Umbuchung bleibt aussen vor**, und das ist keine Bequemlichkeit. Ein Bein allein
 * zurueckzusetzen liefe auf einen der beiden Zustaende hinaus, die es hier nicht geben
 * darf: entweder faellt die `transferId` weg und das Gegenbein steht mit einem Verweis
 * auf ein Paar da, das es nicht mehr gibt (genau der Befund vom 28.08.), oder sie kommt
 * zurueck und zeigt auf ein Bein, das inzwischen einen anderen Betrag traegt. Wer eine
 * Paarung loswerden will, hat dafuer „Paarung loesen" — einen Weg, der BEIDE Seiten
 * anfasst.
 *
 * **Zwei Felder kommen nicht mit**: `vertragId` und `vertragHerkunft` gehoeren nicht dem
 * Ledger (siehe `core/buchung/journal`). Eine Vertragszuordnung ueberlebt das
 * Zuruecksetzen also — sie ist eine eigene Entscheidung mit eigener Herkunft und nicht
 * Teil dessen, was man in dieser Maske verstellt hat.
 *
 * Das Zuruecksetzen ist selbst eine Aenderung und steht danach als solche im Journal. Es
 * verwischt seine Spur nicht.
 */
export async function buchungZuruecksetzen(
  ledger: LedgerPort,
  repo: JournalRepository,
  aktuell: IstBuchung,
): Promise<IstBuchung> {
  const historie = await historieLaden(repo, aktuell);
  if (!historie.rueckweg.moeglich) {
    throw new FachlicherFehler(`journal.${historie.rueckweg.grund}`);
  }
  const ur = historie.urzustand!;
  await ledger.speichern(ur);
  return ur;
}
