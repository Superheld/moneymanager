// Was ein Depot zu zeigen hat.
//
// Zwei Fragen, und die Grenze zwischen ihnen ist dieselbe wie bei allem anderen in dieser
// App (siehe `CLAUDE.md`): die Übersicht beantwortet „wie steht es GERADE", die Analyse
// „wie war es über einen ZEITRAUM". Ein Depot beantwortet beides aus derselben Wertreihe,
// und deshalb liegt beides hier — als eine Sicht mit zwei Auskünften und nicht als zwei
// Sichten, die dieselbe Reihe zweimal lesen.

import {
  juengsterWert,
  positionsergebnis,
  waehrungNachCode,
  wertentwicklung,
  type Cent,
  type Depot,
  type Depotposition,
  type Depotwert,
  type Positionsergebnis,
  type Wertentwicklung,
} from "../../core";
import type { DepotRepository } from "../ports";

export interface DepotDeps {
  readonly depotRepo: DepotRepository;
}

/** Eine Position mit dem, was aus ihr geworden ist. */
export interface Positionszeile extends Depotposition {
  readonly ergebnis: Positionsergebnis;
}

export interface Depotsicht {
  readonly depot: Depot;
  /** Der jüngste bekannte Stand. Fehlt, solange nie abgerufen wurde. */
  readonly aktuell?: Depotwert;
  /** Die ganze Reihe, aufsteigend nach Stichtag — für den Verlauf. */
  readonly reihe: readonly Depotwert[];
  /** Die Positionen des jüngsten Stichtags. */
  readonly positionen: readonly Positionszeile[];
}

export interface Depotdaten {
  readonly depots: readonly Depotsicht[];
  /**
   * Die Summe der jüngsten Stände.
   *
   * Ausdrücklich NICHT Teil der liquiden Mittel: ein Depotwert ist nicht verfügbar, und
   * er ändert sich täglich, ohne dass etwas geflossen wäre. Er steht deshalb als eigene
   * Zahl neben den Konten, nie in ihnen.
   */
  readonly gesamtwert: Cent;
  /** true, sobald überhaupt ein Depot bekannt ist — sonst zeigt die Oberfläche nichts. */
  readonly hatDepots: boolean;
}

export async function depotsLaden(deps: DepotDeps): Promise<Depotdaten> {
  const [depots, alleWerte] = await Promise.all([deps.depotRepo.alle(), deps.depotRepo.werte()]);

  const sichten: Depotsicht[] = [];
  for (const depot of depots) {
    const reihe = alleWerte
      .filter((w) => w.depotId === depot.id)
      .sort((a, b) => a.stichtag.localeCompare(b.stichtag));
    const aktuell = juengsterWert(reihe);
    const waehrung = waehrungNachCode(depot.waehrung ?? "EUR");

    // Nur die Positionen des jüngsten Stichtags: ältere sind Geschichte und gehören in
    // den Verlauf, nicht in die Bestandsliste.
    const positionen = aktuell
      ? (await deps.depotRepo.positionen(depot.id, aktuell.stichtag)).map((p) => ({
          ...p,
          ergebnis: positionsergebnis(p, waehrung),
        }))
      : [];

    sichten.push({ depot, aktuell, reihe, positionen });
  }

  return {
    depots: sichten,
    gesamtwert: sichten.reduce((summe, s) => summe + (s.aktuell?.gesamtwert ?? 0), 0),
    hatDepots: sichten.length > 0,
  };
}

/**
 * Die Entwicklung eines Depots über einen Zeitraum.
 *
 * Getrennt von `depotsLaden`, weil der Zeitraum von aussen kommt: die Übersicht hat
 * keinen, die Analyse hat einen, und beide sollen dieselbe Reihe benutzen, statt sie
 * zweimal zu holen.
 *
 * Der Startpunkt weicht bewusst von `wertentwicklung` im Kern ab. Dort heisst „am
 * 01.06." der letzte Stand, der an diesem Tag galt — und den gibt es nicht, wenn die
 * erste Beobachtung vom 30.06. stammt. Das ist für die Frage „was galt damals" richtig
 * und für die Frage der Analyse falsch: ein Zeitraum wie „letzte 12 Monate" beginnt fast
 * immer vor dem ersten Abruf, und die Antwort wäre dauerhaft „keine Entwicklung".
 *
 * Deshalb hier: gibt es zum Beginn keinen Stand, gilt der ERSTE im Zeitraum. Gemessen
 * wird dann über eine kürzere Strecke als angefragt — die Stichtage stehen im Ergebnis
 * und sagen, über welche.
 */
export function depotEntwicklung(
  sicht: Depotsicht,
  vonIso: string,
  bisIso: string,
): Wertentwicklung {
  const gemessen = wertentwicklung(sicht.reihe, vonIso, bisIso);
  if (gemessen.von || !gemessen.bis) return gemessen;

  const ersterImZeitraum = sicht.reihe.find((w) => w.stichtag >= vonIso && w.stichtag <= bisIso);
  if (!ersterImZeitraum) return gemessen;
  return wertentwicklung(sicht.reihe, ersterImZeitraum.stichtag, bisIso);
}
