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
  istLiquide,
  monatsAusblicke,
  staendeJeKlasse,
  vorschauAlleKonten,
  type Kategorie,
  type Klassenstand,
  type MonatsAusblick,
  type Vorschauzeile,
} from "../core";
import { budgetstaende, vertragsBuchungenLaden, type Budgetstand } from "./budgets/budgetsichten";
import type { BudgetSicht } from "../core";
import type {
  BudgetRepository,
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
   * Gibt es überhaupt Plandaten (Verträge, Budgets)? Ohne sie zeigten die drei Karten
   * Nullen, und das liest sich wie ein Datenfehler statt wie ein leerer Plan.
   *
   * Die Rücklagen zählen seit 2026-09-01 NICHT mehr mit: sie haben im Ausblick keine
   * Zeile mehr (siehe `core/monatsausblick`), und was zu keiner Zeile führt, darf auch
   * nicht darüber entscheiden, ob die Karten überhaupt erscheinen.
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
  /**
   * Die realen Stände je Kontoklasse — die drei Perspektiven auf das Vermögen.
   *
   * Sie stehen UNTER den Monatskarten, weil die etwas anderes beantworten: die Karten
   * sagen, wie der laufende Monat aussieht, diese Liste sagt, was insgesamt da ist.
   */
  readonly klassen: readonly Klassenstand[];
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
  const [buchungen, kategorien, regeln, budgets, umsaetze, vertragsBuchungen, konten] =
    await Promise.all([
      deps.ledger.alle(),
      deps.kategorieRepo.alle(),
      deps.regelRepo.alle(),
      deps.budgetRepo.alle(),
      deps.umsatzRepo.alle(),
      vertragsBuchungenLaden(deps.zuordnungRepo),
      deps.kontoRepo.alle(),
    ]);

  /**
   * DIE GANZE ÜBERSICHT RECHNET ÜBER DIE LIQUIDEN KONTEN.
   *
   * Vorher filterte sie nach gar keinem Konto, und damit stand in „so stehe ich gerade
   * da" auch, was auf Rücklagen- und Vorsorgekonten passierte — Zinsen, Gebühren, ein
   * Verkauf. Das ist eine andere Frage: was dort liegt, ist zurückgelegt und steht für
   * den Monat nicht zur Verfügung.
   *
   * Gefiltert werden Buchungen und Zahlungsregeln — und dieselbe gefilterte Sicht trägt
   * auch die Budgetliste darunter, damit Karten und Liste für dasselbe Budget denselben
   * Verbrauch zeigen.
   *
   * **Budgets werden seit 2026-10-26 NICHT mehr nach ihrem Konto gefiltert.** Vorher
   * verschwand ein aufbauendes Budget auf dem Rücklagenkonto ganz aus der Übersicht, und
   * seine Ausgaben vom Girokonto standen als unerklärte Posten unter „Sonstiges". Jetzt
   * führt es seine Zeile und trägt, was aus den liquiden Konten dafür abging. Seine RATE
   * plant es hier aber nicht (`budgetsOhnePlan`): die fließt über eine Umbuchung, und die
   * steht schon in „Sparen & Vorsorge".
   *
   * Der Preis ist eine Aussage, die man kennen muss: **dasselbe Budget kann hier einen
   * kleineren Verbrauch zeigen als im Bereich Budgets.** Dort steht der ganze Rahmen,
   * hier nur, was aus den verfügbaren Mitteln davon gegangen ist. Das ist gewollt — die
   * beiden Bereiche beantworten verschiedene Fragen —, und deshalb sagt es der
   * Untertitel der Übersicht mit.
   *
   * Eine Zahlungsregel OHNE Konto bleibt drin: sie lässt sich keiner Klasse zuordnen,
   * und sie stillschweigend fallen zu lassen hiesse, einen Plan verschwinden zu lassen,
   * den jemand erfasst hat.
   */
  const liquideIds = new Set(konten.filter(istLiquide).map((k) => k.id));
  const nichtLiquide = new Set(konten.filter((k) => !istLiquide(k)).map((k) => k.id));
  const liquideBuchungen = buchungen.filter((b) => liquideIds.has(b.kontoId));
  const budgetsOhnePlan = new Set(budgets.filter((b) => !liquideIds.has(b.kontoId)).map((b) => b.id));

  const sicht: BudgetSicht = {
    buchungen: liquideBuchungen,
    kategorien,
    budgets,
    vertragsBuchungen,
  };
  const dieserMonat = heute.slice(0, 7);

  return {
    ausblicke: monatsAusblicke({
      regeln: regeln.filter((r) => !r.kontoId || !nichtLiquide.has(r.kontoId)),
      budgets,
      budgetsOhnePlan,
      ist: liquideBuchungen,
      kategorien,
      vertragsBuchungen,
      heute,
    }),
    staende: budgetstaende(sicht, `${dieserMonat}-28`),
    sicht,
    kategorieNamen: new Map(kategorien.map((k: Kategorie) => [k.id, k.name])),
    empfaenger: empfaengerJeBuchung(umsaetze),
    monate: waehlbareMonate(fruehesterMonat(liquideBuchungen) ?? heute, dieserMonat),
    hatPlandaten: regeln.length > 0 || budgets.length > 0,
    vorschau: vorschauAlleKonten(konten, buchungen, regeln, heute, VORSCHAU_TAGE),
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    klassen: staendeJeKlasse(konten, buchungen),
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
