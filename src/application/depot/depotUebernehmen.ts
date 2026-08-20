// Eine Depotaufstellung der Bank übernehmen.
//
// Kein Import im Sinne der Umsätze: hier wird nichts gebucht, nichts dedupliziert und
// nichts kategorisiert. Was ankommt, ist eine Beobachtung zu einem Stichtag, und sie wird
// abgelegt, wie sie ist.
//
// Die einzige Entscheidung, die dabei fällt: welches Depot gemeint ist. Es wird über
// Zugang und Kontoschlüssel wiedergefunden und beim ersten Mal angelegt — ohne
// Zutun des Nutzers. Ein Depot muss nicht mit einem Konto der App verknüpft werden, weil
// es keines ist: es gibt nichts, wogegen man es abgleichen könnte.

import { positionsKennung, type Depot, type Depotposition } from "../../core";
import type { DepotRepository } from "../ports";
import type { Bankkonto, Depotbestand } from "../fints/abrufPort";

export interface DepotUebernahmeDeps {
  readonly depotRepo: DepotRepository;
  readonly id: () => string;
  /** Zeitstempel der Erfassung — von aussen, damit der Ablauf prüfbar bleibt. */
  readonly jetzt: string;
}

export interface DepotUebernahme {
  readonly depotId: string;
  readonly bezeichnung: string;
  readonly stichtag: string;
  readonly gesamtwert?: number;
  readonly positionen: number;
  /** Gesetzt, wenn die Bank keinen Gesamtwert nennt und er sich auch nicht bilden liess. */
  readonly ohneGesamtwert: boolean;
}

/**
 * Das Depot zu einem Bankkonto — vorhandenes wiederfinden, sonst anlegen.
 *
 * Der Schlüssel ist derselbe wie bei den Kontozuordnungen: Kontonummer UND
 * Unterkontomerkmal. Über die Nummer allein liefe man bei Instituten, die Depot und
 * Girokonto unter derselben führen, in genau die Verwechslung, gegen die dieser Schlüssel
 * eingeführt wurde.
 */
async function depotFinden(
  zugangId: string,
  konto: Bankkonto,
  deps: DepotUebernahmeDeps,
): Promise<Depot> {
  const vorhanden = (await deps.depotRepo.alle()).find(
    (d) => d.zugangId === zugangId && d.schluessel === konto.schluessel,
  );
  if (vorhanden) return vorhanden;

  const neu: Depot = {
    id: deps.id(),
    zugangId,
    schluessel: konto.schluessel,
    bezeichnung: konto.bezeichnung,
    waehrung: konto.waehrung,
  };
  await deps.depotRepo.speichern(neu);
  return neu;
}

export async function depotUebernehmen(
  zugangId: string,
  konto: Bankkonto,
  bestand: Depotbestand,
  deps: DepotUebernahmeDeps,
): Promise<DepotUebernahme> {
  const depot = await depotFinden(zugangId, konto, deps);

  const positionen: Depotposition[] = bestand.positionen.map((p, i) => ({
    depotId: depot.id,
    stichtag: bestand.stichtag,
    kennung: positionsKennung(p, i),
    isin: p.isin,
    wkn: p.wkn,
    name: p.name,
    stueck: p.stueck,
    kurs: p.kurs,
    wert: p.wert,
    waehrung: p.waehrung ?? bestand.waehrung,
    einstandDatum: p.einstandDatum,
    einstandKurs: p.einstandKurs,
  }));

  await deps.depotRepo.positionenErsetzen(depot.id, bestand.stichtag, positionen);

  // Der Gesamtwert nur, wenn es einen gibt. Eine Null einzutragen, weil die Bank schwieg,
  // hiesse „das Depot war an diesem Tag nichts wert" — eine Aussage, die niemand gemacht
  // hat, und die in jeder Verlaufskurve als Absturz erschiene.
  if (bestand.gesamtwert != null) {
    await deps.depotRepo.wertSpeichern(
      { depotId: depot.id, stichtag: bestand.stichtag, gesamtwert: bestand.gesamtwert },
      deps.jetzt,
    );
  }

  return {
    depotId: depot.id,
    bezeichnung: depot.bezeichnung,
    stichtag: bestand.stichtag,
    gesamtwert: bestand.gesamtwert,
    positionen: positionen.length,
    ohneGesamtwert: bestand.gesamtwert == null,
  };
}
