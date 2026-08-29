// Die Sicht des Übersichts-Screens — alles, was er zeigt, fertig gerechnet.
//
// Der Screen lud vorher sechs Repositories selbst zusammen und rief damit die
// Kernfunktionen auf. Das war nicht bloß umständlich, es war die Stelle, an der die
// Vertragsregel verloren ging: die drei Monatskarten bekamen eine gefilterte
// Buchungsliste, die Budgetliste darunter die ungefilterte — und dasselbe Budget stand
// im selben Bild einmal ohne Verbrauch und einmal weit über seinem Rahmen.
//
// Jetzt entscheidet diese Datei einmal, was gilt, und der Screen zeigt es nur noch an.
//
// Der Monatswechsel in der Budgetliste lädt bewusst NICHT neu: `sicht` kommt mit heraus,
// und `budgetstaende(sicht, am)` rechnet einen anderen Monat aus denselben Daten. Ein
// Reload pro Dropdown-Klick wäre nicht nur langsam, er würde die Liste auch gegen einen
// inzwischen veränderten Bestand rechnen, während die Karten oben den alten zeigen.

import { empfaengerJeBuchung } from "./buchung/belegZuBuchung";
import {
  fruehesterMonat,
  monatsAusblicke,
  vorschauAlleKonten,
  type Kategorie,
  type MonatsAusblick,
  type Vorschauzeile,
} from "../core";
import { budgetstaende, vertragsBuchungenLaden, type Budgetstand } from "./budgets/budgetsichten";
import type { BudgetSicht } from "../core";
import type {
  BudgetRepository,
  InventarRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "./ports";

/** Wie viele Monate der Rückblick der Budgetliste höchstens anbietet. */
const MAX_MONATE_ZURUECK = 24;

export interface UebersichtDeps {
  readonly ledger: LedgerPort;
  readonly kategorieRepo: KategorieRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly budgetRepo: BudgetRepository;
  readonly inventarRepo: InventarRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly kontoRepo: ZahlungskontoRepository;
}

export interface Uebersichtsdaten {
  /** Die drei Monatskarten, fertig aufgerechnet. */
  readonly ausblicke: readonly MonatsAusblick[];
  /** Die Budgetstände des laufenden Monats, in Baumordnung. */
  readonly staende: readonly Budgetstand[];
  /** Für einen anderen Monat: `budgetstaende(sicht, am)`. */
  readonly sicht: BudgetSicht;
  /** Kategorie-ID → Name. Der Kern gibt IDs heraus, die Oberfläche zeigt Namen. */
  readonly kategorieNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung. */
  readonly empfaenger: ReadonlyMap<string, string>;
  /** Wählbare Monate für die Budgetliste, neuester zuerst („YYYY-MM"). */
  readonly monate: readonly string[];
  /**
   * Gibt es überhaupt Plandaten (Verträge, Budgets, Inventar)? Ohne sie zeigten die drei
   * Karten Nullen, und das liest sich wie ein Datenfehler statt wie ein leerer Plan.
   */
  readonly hatPlandaten: boolean;
  /**
   * Was in den nächsten Tagen fällig wird, über alle Konten — und die Namen dazu.
   *
   * Sie stand bis hierher im Kontoauszug, je Konto eine eigene Liste. Dort beantwortete
   * sie eine Frage, die niemand kontoweise stellt: „was kommt noch" gilt dem Haushalt,
   * nicht dem Girokonto. Wer vier Konten führt, musste vier Auszüge öffnen und im Kopf
   * zusammenzählen — und der Auszug, der „was ist passiert" beantwortet, trug eine
   * zweite Liste über die Zukunft neben sich.
   *
   * Das Fenster ist bewusst weit (`VORSCHAU_TAGE`) und wird erst in der Oberfläche
   * enger gestellt: ein Wechsel des Zeitraums soll nicht neu laden, genauso wenig wie
   * der Monatswechsel der Budgetliste weiter oben.
   */
  readonly vorschau: readonly Vorschauzeile[];
  /** Konto-ID → Bezeichnung. Die Vorschau gibt IDs heraus, die Oberfläche zeigt Namen. */
  readonly kontoNamen: ReadonlyMap<string, string>;
}

/**
 * Wie weit die Vorschau vorgerechnet wird — unabhängig davon, wie weit sie ZEIGT.
 *
 * Der Wert ist die grösste Spanne, die die Oberfläche anbietet. Enger stellt sie selbst,
 * aus denselben Daten; weiter kommt sie nicht, und das ist die Grenze, an der ein
 * Nachladen nötig wäre.
 */
export const VORSCHAU_TAGE = 90;

export async function uebersichtLaden(
  deps: UebersichtDeps,
  heute: string,
): Promise<Uebersichtsdaten> {
  const [buchungen, kategorien, regeln, budgets, inventar, umsaetze, vertragsBuchungen, konten] =
    await Promise.all([
      deps.ledger.alle(),
      deps.kategorieRepo.alle(),
      deps.regelRepo.alle(),
      deps.budgetRepo.alle(),
      deps.inventarRepo.alle(),
      deps.umsatzRepo.alle(),
      vertragsBuchungenLaden(deps.zuordnungRepo),
      deps.kontoRepo.alle(),
    ]);

  const sicht: BudgetSicht = { buchungen, kategorien, budgets, vertragsBuchungen };
  const dieserMonat = heute.slice(0, 7);

  return {
    ausblicke: monatsAusblicke({
      regeln, budgets, inventar, ist: buchungen, kategorien, vertragsBuchungen, heute,
    }),
    staende: budgetstaende(sicht, `${dieserMonat}-28`),
    sicht,
    kategorieNamen: new Map(kategorien.map((k: Kategorie) => [k.id, k.name])),
    empfaenger: empfaengerJeBuchung(umsaetze),
    monate: waehlbareMonate(fruehesterMonat(buchungen) ?? heute, dieserMonat),
    hatPlandaten: regeln.length > 0 || budgets.length > 0 || inventar.length > 0,
    vorschau: vorschauAlleKonten(konten, buchungen, regeln, heute, VORSCHAU_TAGE),
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
  };
}

/**
 * Die Monate, die die Budgetliste anbietet: rückwärts vom laufenden bis dorthin, wo es
 * überhaupt Buchungen gibt — höchstens aber zwei Jahre. Eine Liste aller je gebuchten
 * Monate wäre bei mehrjährigem Bestand ein Dropdown mit sechzig Einträgen.
 *
 * Ausdrücklich nur nach HINTEN: ein Budget in der Zukunft hat keinen Verbrauch, es gäbe
 * nichts zu zeigen. Was kommt, steht in den Karten darüber.
 */
export function waehlbareMonate(fruehestes: string, dieserMonat: string): string[] {
  const grenze = fruehestes.slice(0, 7);
  const liste: string[] = [];
  for (let i = 0; i < MAX_MONATE_ZURUECK; i++) {
    const m = monatMinus(dieserMonat, i);
    liste.push(m);
    if (m <= grenze) break;
  }
  return liste;
}

/** Der Monatsschlüssel `zurueck` Monate vor `von` („YYYY-MM"). */
function monatMinus(von: string, zurueck: number): string {
  const [j, m] = von.split("-").map(Number);
  const gesamt = j * 12 + (m - 1) - zurueck;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}
