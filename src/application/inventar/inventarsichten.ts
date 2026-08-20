// Inventar-Sicht — die Gegenstände samt Rücklagenrechnung.
//
// Die Deckung ist der Grund, warum das hier steht und nicht im Screen: `ruecklagenDeckung`
// vergleicht den bis heute angesparten Bedarf mit dem, was auf den Konten liegt, und
// braucht dafür die realen Kontostände über den ganzen Buchungsbestand. Drei Auswahlen
// über zwei Aggregate — genau die Sorte Rechnung, die in einer Oberfläche irgendwann
// leicht anders noch einmal auftaucht.

import {
  monatsRuecklage,
  realerKontostand,
  ruecklagenDeckung,
  type Cent,
  type Inventargegenstand,
  type RuecklagenDeckung,
  type Zahlungskonto,
} from "../../core";
import type { InventarRepository, LedgerPort, ZahlungskontoRepository } from "../ports";

export interface InventarDeps {
  readonly inventarRepo: InventarRepository;
  readonly ledger: LedgerPort;
  readonly kontoRepo: ZahlungskontoRepository;
}

export interface Inventarsicht {
  readonly gegenstaende: readonly Inventargegenstand[];
  readonly konten: readonly Zahlungskonto[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Reicht das Ersparte für den bis heute aufgelaufenen Bedarf? */
  readonly deckung: RuecklagenDeckung;
  /** Summe der monatlichen Rücklagen aller Gegenstände. */
  readonly proMonat: Cent;
  /** Summe der Wiederbeschaffungswerte. */
  readonly ersatzwert: Cent;
}

export async function inventarLaden(deps: InventarDeps, heute: string): Promise<Inventarsicht> {
  const [gegenstaende, buchungen, konten] = await Promise.all([
    deps.inventarRepo.alle(),
    deps.ledger.alle(),
    deps.kontoRepo.alle(),
  ]);
  const kontostaende = new Map(konten.map((k) => [k.id, realerKontostand(k, buchungen)]));
  return {
    gegenstaende,
    konten,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    deckung: ruecklagenDeckung(gegenstaende, heute, kontostaende),
    proMonat: gegenstaende.reduce((s, g) => s + monatsRuecklage(g), 0),
    ersatzwert: gegenstaende.reduce((s, g) => s + g.wiederbeschaffung, 0),
  };
}
