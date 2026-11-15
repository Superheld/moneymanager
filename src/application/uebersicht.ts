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
import { zeilenkontext, type Zeilenkontext } from "./buchung/buchungszeile";
import { vertragsnamenLaden } from "./vertraege/vertragszuordnung";
import {
  fruehesterMonat,
  ergebnisbasis,
  istLiquide,
  monatsErgebnisse,
  staendeJeKlasse,
  vorschauAlleKonten,
  type Kategorie,
  bilanzJeKlasse,
  einrichtungsstand,
  type Einrichtungsstand,
  type Klassenbilanz,
  type MonatsErgebnis,
  type Vorschauzeile,
} from "../core";
import { budgetstaende, type Budgetstand } from "./budgets/budgetsichten";
import type { BudgetSicht } from "../core";
import { belegungssicht } from "./konten/kontobelegung";
import { ergebnisvorsorgeLaden, type VorsorgeDeps } from "./vorsorge/vorsorge";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  UmsatzRepository,
  VertragRepository,
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
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly vertragRepo: VertragRepository;
  /**
   * Für die Zeile Vorsorge: hat der Haushalt ein Ziel, kostet der Monat dessen Rate.
   * Pflicht, nicht optional — fehlte es still, rechneten die Karten wieder mit der
   * Überweisung, und niemand sähe den Unterschied.
   */
  readonly vorsorge: VorsorgeDeps;
}

export interface Uebersichtsdaten {
  /**
   * Die drei Monatskarten: was der laufende Monat und die beiden folgenden KOSTEN, mit
   * der Überleitung zum Kontostand (`core/ergebnis.ts`).
   */
  readonly ergebnisse: readonly MonatsErgebnis[];
  /** Die Budgetstände des laufenden Monats, in Baumordnung. */
  readonly staende: readonly Budgetstand[];
  /** Für einen anderen Monat: `budgetstaende(sicht, am)`. */
  readonly sicht: BudgetSicht;
  /** Kategorie-ID → Name. Der Kern gibt IDs heraus, die Oberfläche zeigt Namen. */
  readonly kategorieNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung. */
  readonly empfaenger: ReadonlyMap<string, string>;
  /** Was die Buchungszeilen eines aufgeklappten Budgets brauchen (`budgetzeilenZu`). */
  readonly zeilenkontext: Zeilenkontext;
  /** Wählbare Monate für die Budgetliste, neuester zuerst („YYYY-MM"). */
  readonly monate: readonly string[];
  /**
   * Gibt es überhaupt Plandaten (Verträge, Budgets)? Ohne sie zeigten die drei Karten
   * Nullen, und das liest sich wie ein Datenfehler statt wie ein leerer Plan.
   *
   * Die Rücklagen zählen mit, weil ihre Raten eine Zeile bilden (Abschreibungen). Die
   * Regel dahinter bleibt: was zu keiner Zeile führt, darf nicht darüber entscheiden, ob
   * die Karten überhaupt erscheinen.
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
   * Das Vermögen je Kontoklasse: was da ist, was davon Rücklagen und aufbauende Budgets
   * binden, und was frei bleibt (`bilanzJeKlasse`).
   *
   * Es steht UNTER den Monatskarten, weil die etwas anderes beantworten: die Karten
   * sagen, was der Monat kostet, diese Liste sagt, was insgesamt da ist und wem es schon
   * gehört.
   */
  readonly vermoegen: readonly Klassenbilanz[];
  /** Anspruchs-ID → Name der Rücklage bzw. der Budget-Kategorie. */
  readonly anspruchNamen: ReadonlyMap<string, string>;
  /**
   * Was dem Haushalt noch fehlt, damit die Karten darüber stimmen (`core/einrichtung.ts`).
   *
   * Aus denselben geladenen Daten gerechnet wie alles andere hier — ein eigener Ladeweg
   * könnte „keine Budgets" melden, während die Budgetliste daneben welche zeigt.
   */
  readonly einrichtung: Einrichtungsstand;
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
  const [buchungen, kategorien, regeln, budgets, umsaetze, zuordnungen, konten, ruecklagen, vertragsnamen, ausbuchungen, vorsorge] =
    await Promise.all([
      deps.ledger.alle(),
      deps.kategorieRepo.alle(),
      deps.regelRepo.alle(),
      deps.budgetRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.zuordnungRepo.alle(),
      deps.kontoRepo.alle(),
      deps.ruecklagenRepo.alle(),
      vertragsnamenLaden(deps.zuordnungRepo, deps.vertragRepo),
      deps.ruecklagenRepo.ausbuchungen(),
      ergebnisvorsorgeLaden(deps.vorsorge),
    ]);

  /**
   * DIE GANZE ÜBERSICHT RECHNET ÜBER ALLE KONTEN (seit 2026-11-15).
   *
   * Die Monatskarten zeigen, was der Monat KOSTET, und Kosten hängen nicht daran, von
   * welchem Konto bezahlt wurde. Bis dahin rechneten sie über die liquiden Konten und
   * die Budgetliste darunter über alle — dasselbe Budget zeigte in Karte und Liste
   * verschiedene Zahlen, und der Untertitel musste es erklären.
   *
   * Die Vertragszuordnung kommt EINMAL aus dem Repository und speist beide Sichten:
   * als Menge für die Budgets, als Abbildung für die Einordnung. Zwei Ladewege wären
   * zwei Stände.
   */
  const vertragJeBuchung = new Map<string, string>();
  for (const z of zuordnungen) if (z.vertragId) vertragJeBuchung.set(z.istbuchungId, z.vertragId);
  const vertragsBuchungen = new Set(vertragJeBuchung.keys());
  const liquideIds = new Set(konten.filter(istLiquide).map((k) => k.id));
  const liquideBuchungen = buchungen.filter((b) => liquideIds.has(b.kontoId));

  const sicht: BudgetSicht = {
    buchungen,
    kategorien,
    budgets,
    vertragsBuchungen,
  };
  const dieserMonat = heute.slice(0, 7);
  const belegung = belegungssicht({ konten, buchungen, ruecklagen, sicht }, heute);

  return {
    ergebnisse: monatsErgebnisse(
      ergebnisbasis({ regeln, budgets, ruecklagen, ausbuchungen, ist: buchungen, kategorien, konten, vertragJeBuchung, heute, vorsorge }),
    ),
    staende: budgetstaende(sicht, `${dieserMonat}-28`),
    sicht,
    kategorieNamen: new Map(kategorien.map((k: Kategorie) => [k.id, k.name])),
    empfaenger: empfaengerJeBuchung(umsaetze),
    zeilenkontext: zeilenkontext(umsaetze, konten, kategorien, vertragsnamen),
    monate: waehlbareMonate(fruehesterMonat(liquideBuchungen) ?? heute, dieserMonat),
    hatPlandaten: regeln.length > 0 || budgets.length > 0 || ruecklagen.length > 0,
    vorschau: vorschauAlleKonten(konten, buchungen, regeln, heute, VORSCHAU_TAGE),
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    vermoegen: bilanzJeKlasse(staendeJeKlasse(konten, buchungen), belegung.jeKonto),
    anspruchNamen: belegung.namen,
    einrichtung: einrichtungsstand({
      kontenAnzahl: konten.length,
      buchungen,
      regeln,
      budgets,
      ruecklagenAnzahl: ruecklagen.length,
      heute,
    }),
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
