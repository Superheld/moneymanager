// Was der Bereich Vermögen zu zeigen hat — fertig gerechnet.
//
// Die Sicht führt zusammen, was sonst an vier Stellen liegt: Konten (aus Buchungen),
// Depots (von der Bank gemeldet), Vermögenswerte und Schulden (von Hand eingetragen).
// Gerechnet wird im Kern (`nettovermoegen`); hier wird geholt, sortiert und benannt.
//
// Die Grenze zur Übersicht: deren Karte „Was da ist" zeigt die KONTEN je Klasse und wem
// ihr Geld gehört. Hier steht alles, was jemand besitzt und schuldet — auch das, was auf
// keinem Konto liegt.

import {
  addMonate,
  ersteBeobachtung,
  nettovermoegen,
  nettovermoegenVerlauf,
  parseIso,
  toIso,
  wirdGefuehrt,
  type Cent,
  type Nettovermoegen,
  type Verbindlichkeit,
  type VermoegensEingabe,
  type Vermoegensgegenstand,
} from "../../core";
import type {
  DepotRepository,
  LedgerPort,
  VermoegenRepository,
  VertragRepository,
  ZahlungskontoRepository,
} from "../ports";

export interface VermoegenDeps {
  readonly vermoegenRepo: VermoegenRepository;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly depotRepo: DepotRepository;
  readonly vertragRepo: VertragRepository;
  /**
   * Welches Konto an welchem Bankzugang hängt — nur gebraucht, um ein Konto zu
   * erkennen, dessen Stand ein abgerufenes Depot IST (siehe `vermoegenLaden`).
   */
  readonly kontozuordnungen?: () => Promise<
    readonly { zugangId: string; schluessel: string; zahlungskontoId: string }[]
  >;
}

/** Eine Beobachtung, wie die Oberfläche sie zeigt: Wert bzw. Restschuld zum Stichtag. */
export interface Beobachtungszeile {
  readonly stichtag: string;
  readonly betrag: Cent;
}

export interface Vermoegenswertzeile {
  readonly gegenstand: Vermoegensgegenstand;
  readonly gefuehrt: boolean;
  /** Die jüngste Beobachtung. Fehlt, solange nie ein Wert eingetragen wurde. */
  readonly aktuell?: Beobachtungszeile;
  /** Die ganze Reihe, jüngste zuerst — so liest man sie, wenn man nachsieht. */
  readonly reihe: readonly Beobachtungszeile[];
}

export interface Schuldzeile {
  readonly verbindlichkeit: Verbindlichkeit;
  readonly gefuehrt: boolean;
  readonly aktuell?: Beobachtungszeile;
  readonly reihe: readonly Beobachtungszeile[];
  /** Der Name des verknüpften Vertrags, wenn es ihn noch gibt. */
  readonly vertragName?: string;
  /** Die Bezeichnung des verknüpften Vermögenswerts, wenn es ihn noch gibt. */
  readonly gegenstandName?: string;
}

export interface Vermoegenssicht {
  /** Der Stand von `heute`. */
  readonly netto: Nettovermoegen;
  /**
   * Monatsenden ab der ersten eigenen Beobachtung, der letzte Punkt ist `netto`. Leer,
   * solange nichts eingetragen ist: ohne Vermögenswert und ohne Schuld wäre es der
   * Kontoverlauf unter anderem Namen, und den zeigt die Analyse.
   */
  readonly verlauf: readonly Nettovermoegen[];
  readonly vermoegenswerte: readonly Vermoegenswertzeile[];
  readonly schulden: readonly Schuldzeile[];
  /** Die Verträge, die die Maske einer Schuld zur Wahl stellt. */
  readonly vertraege: readonly { readonly id: string; readonly name: string }[];
}

/** So weit reicht der Verlauf höchstens zurück — zehn Jahre in Monatsschritten. */
const VERLAUF_MONATE_HOECHSTENS = 120;

const absteigend = (a: Beobachtungszeile, b: Beobachtungszeile) =>
  b.stichtag.localeCompare(a.stichtag);

export async function vermoegenLaden(deps: VermoegenDeps, heute: string): Promise<Vermoegenssicht> {
  const [gegenstaende, werte, verbindlichkeiten, staende, alleKonten, buchungen, depots, depotwerte, vertraege, zuordnungen] =
    await Promise.all([
      deps.vermoegenRepo.gegenstaende(),
      deps.vermoegenRepo.werte(),
      deps.vermoegenRepo.verbindlichkeiten(),
      deps.vermoegenRepo.staende(),
      deps.kontoRepo.alle(),
      deps.ledger.alle(),
      deps.depotRepo.alle(),
      deps.depotRepo.werte(),
      deps.vertragRepo.alle(),
      deps.kontozuordnungen?.() ?? Promise.resolve([]),
    ]);

  // Ein Konto, an dem ein abgerufenes Depot hängt, zeigt im Kontenbereich den Depotwert
  // statt seines eigenen Stands (`depotJeKonto`). Zählte es hier trotzdem mit, stünde
  // dasselbe Vermögen einmal unter „Konten" und einmal unter „Depots". Es zählt als
  // Depot: das ist die Zahl, die die Bank gemeldet hat.
  const mitDepot = new Set(
    zuordnungen
      .filter((z) => depots.some((d) => d.zugangId === z.zugangId && d.schluessel === z.schluessel))
      .map((z) => z.zahlungskontoId),
  );
  const konten = alleKonten.filter((k) => !mitDepot.has(k.id));

  const eingabe: VermoegensEingabe = {
    konten,
    buchungen,
    depotwerte,
    gegenstaende,
    werte,
    verbindlichkeiten,
    staende,
  };

  const erste = ersteBeobachtung(werte, staende);
  let verlauf: Nettovermoegen[] = [];
  if (erste && erste <= heute) {
    const fruehestens = toIso(addMonate({ ...parseIso(heute), d: 1 }, -(VERLAUF_MONATE_HOECHSTENS - 1)));
    verlauf = nettovermoegenVerlauf(eingabe, erste < fruehestens ? fruehestens : erste, heute);
  }

  const gegenstandName = new Map(gegenstaende.map((g) => [g.id, g.bezeichnung]));
  const vertragName = new Map(vertraege.map((v) => [v.id, v.anbieter]));

  return {
    netto: nettovermoegen(eingabe, heute),
    verlauf,
    vermoegenswerte: gegenstaende.map((gegenstand) => {
      const reihe = werte
        .filter((w) => w.gegenstandId === gegenstand.id)
        .map((w) => ({ stichtag: w.stichtag, betrag: w.wert }))
        .sort(absteigend);
      return { gegenstand, gefuehrt: wirdGefuehrt(gegenstand), aktuell: reihe[0], reihe };
    }),
    schulden: verbindlichkeiten.map((verbindlichkeit) => {
      const reihe = staende
        .filter((s) => s.verbindlichkeitId === verbindlichkeit.id)
        .map((s) => ({ stichtag: s.stichtag, betrag: s.restschuld }))
        .sort(absteigend);
      return {
        verbindlichkeit,
        gefuehrt: wirdGefuehrt(verbindlichkeit),
        aktuell: reihe[0],
        reihe,
        vertragName: verbindlichkeit.vertragId ? vertragName.get(verbindlichkeit.vertragId) : undefined,
        gegenstandName: verbindlichkeit.gegenstandId
          ? gegenstandName.get(verbindlichkeit.gegenstandId)
          : undefined,
      };
    }),
    vertraege: vertraege
      .map((v) => ({ id: v.id, name: v.anbieter }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
