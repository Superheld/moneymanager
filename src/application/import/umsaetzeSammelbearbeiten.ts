// Dieselbe Änderung an vielen ENTWÜRFEN — das Gegenstück zu `buchungenSammelbearbeiten`,
// eine Stufe früher.
//
// **Warum eine eigene Datei und nicht dieselbe.** Ein Umsatz im Stapel ist keine Buchung:
// er hat noch keinen Saldo bewegt, seine Kategorie ist ein VORSCHLAG, und weglegen heisst
// hier nicht löschen. Die beiden Sammelwege sehen sich ähnlich und meinen Verschiedenes;
// sie zusammenzulegen hiesse, eine Funktion zu bauen, die je nach Argument das eine oder
// das andere tut.
//
// **Warum es sie überhaupt gibt.** Die Übersetzung der Quelle deckt ab, was die Quelle
// weiss; der Rest kommt vom Modell oder gar nicht. Diesen Rest Zeile für Zeile
// anzuklicken ist bei einem Jahresexport keine Arbeit, die jemand macht — und was niemand
// macht, bleibt liegen. Genau dafür ist der Stapel der richtige Ort: dort steht alles
// nebeneinander, bevor es Buchungen sind.

import type { Kategorie } from "../../core";
import type { UmsatzRepository } from "../ports";
import { kategorisieren, verwerfen, type Umsatz } from "./umsatz";

export interface SammelErgebnis {
  readonly geaendert: number;
  /**
   * Was unangetastet blieb, weil es die Quelle schon entschieden hat.
   *
   * Gezählt und nicht verschwiegen: eine Sammelaktion, die stillschweigend weniger tut,
   * als die Zahl daneben verspricht, ist schlimmer als eine, die es sagt.
   */
  readonly uebersprungen: number;
}

/**
 * Setzt (oder entfernt) die Kategorie an vielen Entwürfen.
 *
 * `kategorie === undefined` heisst „Kategorie weg" — der Umsatz fällt zurück auf
 * unkategorisiert und landet wieder unter „offen". Das ist eine gültige Absicht und keine
 * Lücke: wer eine Sammelaktion zurücknehmen will, braucht sie.
 *
 * **Umbuchungen bleiben aussen vor.** Ihre Einordnung kommt von der Quelle, und die
 * Einzelansicht bietet dort gar keine Kategoriewahl an. Dürfte der Sammelweg es trotzdem,
 * wäre er der bequeme Weg um eine Regel herum — und aufgefallen wäre es erst an einer
 * Umschichtung, die plötzlich ein Budget belastet.
 */
export async function umsaetzeKategorisieren(
  repo: UmsatzRepository,
  umsaetze: readonly Umsatz[],
  kategorie: Kategorie | undefined,
): Promise<SammelErgebnis> {
  let geaendert = 0;
  let uebersprungen = 0;
  for (const u of umsaetze) {
    if (u.vorschlag?.quelle === "umbuchung") {
      uebersprungen++;
      continue;
    }
    const neu = kategorie
      ? kategorisieren(u, {
          kategorieId: kategorie.id,
          // Der Charakter kommt aus dem KATALOG, nicht aus dem, was an der Zeile stand.
          // Dieselbe Regel wie in der Vorschlagskette: die Kategorie sagt, was die
          // Zahlung fachlich ist.
          charakter: kategorie.defaultCharakter,
          quelle: "manuell",
        })
      : { ...u, vorschlag: undefined };
    await repo.speichern(neu);
    geaendert++;
  }
  return { geaendert, uebersprungen };
}

/**
 * Legt viele Entwürfe auf einmal weg.
 *
 * Weggelegt ist nicht gelöscht: die Zeile bleibt mit Status `verworfen` stehen, zählt bei
 * der Dublettenprüfung weiter mit und lässt sich zurückholen. Deshalb braucht dieser Weg
 * keine zweite Frage — anders als das Sammel-Löschen von Buchungen, das nichts
 * zurücklässt.
 */
export async function umsaetzeVerwerfen(
  repo: UmsatzRepository,
  umsaetze: readonly Umsatz[],
): Promise<number> {
  let n = 0;
  for (const u of umsaetze) {
    await repo.speichern(verwerfen(u));
    n++;
  }
  return n;
}
