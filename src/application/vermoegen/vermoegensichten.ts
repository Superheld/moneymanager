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
  beobachtungAm,
  ersteBeobachtung,
  istAktiv,
  istVorsorgekonto,
  nettovermoegen,
  nettovermoegenVerlauf,
  parseIso,
  tilgungIm,
  toIso,
  wirdGefuehrt,
  type Cent,
  type Depot,
  type Kontoklasse,
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
  /**
   * Die Tilgung im laufenden Monat, aus der Reihe der Restschulden abgeleitet
   * (`tilgungIm`) — die Zahl, die die Ergebnisrechnung von der Rate des Vertrags
   * abspaltet, bevor sie sie dort gegen die Rate begrenzt. Nur gesetzt, wenn die Schuld
   * auf einen Vertrag verweist und die Zahl über null liegt: ohne Vertrag wird nichts
   * geteilt, und „Tilgung 0" sagte nur, dass sich nichts ableiten liess.
   */
  readonly tilgungImMonat?: Cent;
}

/** Ein Zahlungskonto, wie es am Depot steht oder zur Wahl als Verrechnungskonto. */
export interface Verrechnungskontozeile {
  readonly id: string;
  readonly bezeichnung: string;
  readonly klasse: Kontoklasse;
  /** Der Stand heute — derselbe, mit dem es in der Kontensumme steht. */
  readonly stand: Cent;
  /**
   * Zählt es zur Vorsorge? Über seine Klasse (`istVorsorgekonto`) und nur darüber: dass
   * es an einem Depot hängt, ändert daran nichts.
   */
  readonly zaehltZurVorsorge: boolean;
}

export interface Depotzeile {
  readonly depot: Depot;
  /** Der jüngste Depotwert bis heute. Fehlt, solange nie abgerufen wurde. */
  readonly aktuell?: Beobachtungszeile;
  /** Das gewählte Verrechnungskonto, wenn es das Konto noch gibt. */
  readonly verrechnungskonto?: Verrechnungskontozeile;
  /** Depotwert plus Stand des Verrechnungskontos — was an diesem Depot zusammen liegt. */
  readonly summe: Cent;
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
  /** Die abgerufenen Depots, je mit ihrem Verrechnungskonto. */
  readonly depots: readonly Depotzeile[];
  /**
   * Was die Maske eines Depots als Verrechnungskonto zur Wahl stellt: die geführten
   * Konten, ohne die, deren Stand ein Depot IST (siehe `vermoegensbestandLaden`) — sie
   * stehen hier schon als Depot.
   */
  readonly kontenZurWahl: readonly Verrechnungskontozeile[];
}

/** So weit reicht der Verlauf höchstens zurück — zehn Jahre in Monatsschritten. */
const VERLAUF_MONATE_HOECHSTENS = 120;

const absteigend = (a: Beobachtungszeile, b: Beobachtungszeile) =>
  b.stichtag.localeCompare(a.stichtag);

/** Was die Rechnung braucht und nicht der Bereich Vermögen allein. */
export type VermoegensbestandDeps = Omit<VermoegenDeps, "vertragRepo">;

/**
 * Der Bestand, über den `nettovermoegen` rechnet — an EINER Stelle geholt, weil die
 * Vorsorge (`../vorsorge/vorsorge.ts`) gegen dieselbe Auswahl rechnen muss. Holte sie
 * sich Konten und Depots selbst, zählte früher oder später eines davon dort anders.
 */
export async function vermoegensbestandLaden(deps: VermoegensbestandDeps): Promise<VermoegensEingabe> {
  const [gegenstaende, werte, verbindlichkeiten, staende, alleKonten, buchungen, depots, depotwerte, zuordnungen] =
    await Promise.all([
      deps.vermoegenRepo.gegenstaende(),
      deps.vermoegenRepo.werte(),
      deps.vermoegenRepo.verbindlichkeiten(),
      deps.vermoegenRepo.staende(),
      deps.kontoRepo.alle(),
      deps.ledger.alle(),
      deps.depotRepo.alle(),
      deps.depotRepo.werte(),
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

  return { konten, buchungen, depots, depotwerte, gegenstaende, werte, verbindlichkeiten, staende };
}

export async function vermoegenLaden(deps: VermoegenDeps, heute: string): Promise<Vermoegenssicht> {
  const [eingabe, vertraege] = await Promise.all([vermoegensbestandLaden(deps), deps.vertragRepo.alle()]);
  const { gegenstaende, werte, verbindlichkeiten, staende } = eingabe;

  const erste = ersteBeobachtung(werte, staende);
  let verlauf: Nettovermoegen[] = [];
  if (erste && erste <= heute) {
    const fruehestens = toIso(addMonate({ ...parseIso(heute), d: 1 }, -(VERLAUF_MONATE_HOECHSTENS - 1)));
    verlauf = nettovermoegenVerlauf(eingabe, erste < fruehestens ? fruehestens : erste, heute);
  }

  const gegenstandName = new Map(gegenstaende.map((g) => [g.id, g.bezeichnung]));

  // Der Stand eines Kontos über `nettovermoegen` selbst, mit nur diesem Konto: dieselbe
  // Zahl, mit der es oben in „Konten" steckt, ohne eine zweite Saldenrechnung.
  const kontozeile = (k: (typeof eingabe.konten)[number]): Verrechnungskontozeile => ({
    id: k.id,
    bezeichnung: k.bezeichnung,
    klasse: k.klasse,
    stand: nettovermoegen(
      { ...eingabe, konten: [k], depots: [], depotwerte: [], gegenstaende: [], verbindlichkeiten: [] },
      heute,
    ).konten,
    zaehltZurVorsorge: istVorsorgekonto(k),
  });
  const kontoNach = new Map(eingabe.konten.map((k) => [k.id, k]));
  const depots: Depotzeile[] = eingabe.depots.map((depot) => {
    const wert = beobachtungAm(
      eingabe.depotwerte.filter((w) => w.depotId === depot.id),
      heute,
    );
    const konto = depot.verrechnungskontoId ? kontoNach.get(depot.verrechnungskontoId) : undefined;
    const verrechnungskonto = konto ? kontozeile(konto) : undefined;
    return {
      depot,
      aktuell: wert ? { stichtag: wert.stichtag, betrag: wert.gesamtwert } : undefined,
      verrechnungskonto,
      summe: (wert?.gesamtwert ?? 0) + (verrechnungskonto?.stand ?? 0),
    };
  });
  // Ein stillgelegtes Konto bleibt wählbar, solange es schon gewählt ist — sonst stünde
  // in der Maske eine Wahl, die die Liste nicht kennt.
  const gewaehlt = new Set(eingabe.depots.map((d) => d.verrechnungskontoId));
  const kontenZurWahl = eingabe.konten
    .filter((k) => istAktiv(k) || gewaehlt.has(k.id))
    .map(kontozeile);
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
      const tilgung = verbindlichkeit.vertragId
        ? tilgungIm(
            staende.filter((s) => s.verbindlichkeitId === verbindlichkeit.id),
            wirdGefuehrt(verbindlichkeit),
            heute.slice(0, 7),
          )
        : undefined;
      return {
        verbindlichkeit,
        gefuehrt: wirdGefuehrt(verbindlichkeit),
        tilgungImMonat: tilgung ? tilgung : undefined,
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
    depots,
    kontenZurWahl,
  };
}
