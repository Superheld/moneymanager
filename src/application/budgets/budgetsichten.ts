// Budget-Sichten — die EINE Stelle, an der Budgetstände entstehen.
//
// Vorher rechnete jeder Screen selbst: er lud Ledger, Kategorien und Budgets aus den
// Repositories und rief `budgetStand` mit dem, was er gerade zur Hand hatte. Was dabei
// niemand hinschrieb, war die Vertragsregel — Vertragsraten zählen nicht gegen ein
// Budget. Die Folge stand auf der Übersicht: für „Familie & Kinder" zeigte die Karte
// oben null Verbrauch, die Liste zwanzig Zentimeter darunter den vollen Betrag über
// Rahmen. Beides aus denselben Daten, beides „richtig gerechnet".
//
// Seit 2026-08-19 gibt es die Rohteile nicht mehr einzeln: wer Budgetstände will, ruft
// hier an und bekommt sie fertig. Das ist der Grund, warum diese Datei existiert — nicht
// Bequemlichkeit, sondern die Unmöglichkeit, die Regel zu umgehen.
//
// Welche Buchungen zu einem Vertrag gehören, sagt die Spalte `vertrag_id` an der Buchung
// (über `VertragszuordnungRepository`) — eine erfasste Verknüpfung, keine Schätzung. Sie
// ersetzte eine Betragsheuristik, ohne deren Ergebnis zu ändern: getauscht wurde eine
// Vermutung gegen eine Tatsache, nicht das Verhalten.

import { empfaengerJeBuchung } from "../buchung/belegZuBuchung";
import {
  betragImMonat,
  budgetBuchungen,
  budgetFortschreibung,
  budgetMonatsstand,
  budgetStand,
  elternBudget,
  verbrauchsFenster,
  verlaufsfenster,
  type Budget,
  type Budgetmonat,
  type BudgetSicht,
  type Budgetvorschlag,
  type Cent,
  type Kategorie,
  type Verbrauchsposten,
  type Zahlungskonto,
} from "../../core";
import { budgetvorschlaegeLaden, ignorierteBudgetvorschlaege } from "./budgetvorschlaege";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "../ports";

export interface BudgetsichtDeps {
  readonly ledger: LedgerPort;
  readonly kategorieRepo: KategorieRepository;
  readonly budgetRepo: BudgetRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
}

/** Ein Budget mit allem, was ein Screen darüber anzeigt. */
export interface Budgetstand {
  readonly budget: Budget;
  readonly kategorieName: string;
  /** Tiefe im Budgetbaum — 0 für freistehende, 1 für ein eingebettetes usw. */
  readonly tiefe: number;
  /**
   * Was in diesem Monat in das Budget geht — sein eigener Betrag. Unterbudgets ziehen
   * davon nichts ab (siehe `core/budgets/budget.ts`, Kopf). Hier und nicht in der
   * Oberfläche, weil welcher Betrag in einem Monat gilt eine Entscheidung ist und hinter
   * einen Use-Case gehört (`ui/CLAUDE.md`).
   */
  readonly proMonat: Cent;
  /**
   * Rahmen und Verbrauch KUMULIERT — bei `aufbauend` also alles seit dem Start.
   *
   * Sie stehen hier als Beleg, nicht als Anzeigewert: `rest` ist ihre Differenz, und die
   * Fortschreibung in `monat` muss auf denselben Rest kommen. Was eine Zeile ZEIGT, kommt
   * aus `monat` — „140 von 200" sagte einem aufbauenden Budget nur, wieviel hineingegangen
   * wäre, hätte man nie etwas ausgegeben.
   */
  readonly rahmen: Cent;
  readonly verbraucht: Cent;
  readonly rest: Cent;
  /** Das Fenster, über das `verbraucht` zählt (monatlich vs. aufbauend). */
  readonly von: string;
  readonly bis: string;
  /**
   * Derselbe Stand als Aufrechnung DIESES Monats: Übertrag + Zuführung − Verbrauch = Rest.
   * `monat.rest === rest`, immer — siehe `core/budgets/budgetverlauf`.
   */
  readonly monat: Budgetmonat;
}

export interface Budgetuebersicht {
  readonly staende: readonly Budgetstand[];
  /**
   * Die geladene Sicht — nur für Nachfragen wie `budgetBuchungenZu`. Sie mit
   * herauszugeben ist bewusst: der Screen soll die Einzelposten eines aufgeklappten
   * Budgets holen können, ohne alles neu zu laden, aber weiterhin nicht selbst über
   * die Auswahl entscheiden.
   */
  readonly sicht: BudgetSicht;
}

/**
 * Die IDs aller Buchungen, die an einem Vertrag hängen.
 *
 * `vertragId === null` ist eine Aussage („gehört zu keinem Vertrag") und kein fehlender
 * Wert — solche Zeilen zählen normal gegen ihr Budget.
 */
export async function vertragsBuchungenLaden(
  repo: VertragszuordnungRepository,
): Promise<Set<string>> {
  const zuordnungen = await repo.alle();
  return new Set(zuordnungen.filter((z) => z.vertragId).map((z) => z.istbuchungId));
}

/**
 * Alle Budgetstände zum Stichtag `am`, in Baumordnung: ein eingebettetes Budget steht
 * unter seinem Dach, Geschwister alphabetisch nach Kategoriename.
 */
export async function budgetuebersichtLaden(
  deps: BudgetsichtDeps,
  am: string,
): Promise<Budgetuebersicht> {
  const [buchungen, kategorien, budgets, vertragsBuchungen] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
  ]);
  const sicht: BudgetSicht = { buchungen, kategorien, budgets, vertragsBuchungen };
  return { staende: budgetstaende(sicht, am), sicht };
}

/** Reine Baumordnung + Stände über eine fertige Sicht — getrennt, damit sie testbar ist. */
export function budgetstaende(sicht: BudgetSicht, am: string): Budgetstand[] {
  const { budgets, kategorien } = sicht;
  const name = new Map(kategorien.map((k: Kategorie) => [k.id, k.name]));

  const kinder = new Map<string | null, Budget[]>();
  for (const b of budgets) {
    const eltern = elternBudget(b, budgets, kategorien)?.id ?? null;
    const liste = kinder.get(eltern);
    if (liste) liste.push(b);
    else kinder.set(eltern, [b]);
  }

  const raus: Budgetstand[] = [];
  const gehe = (elternId: string | null, tiefe: number) => {
    const gruppe = [...(kinder.get(elternId) ?? [])].sort((a, b) =>
      (name.get(a.kategorieId) ?? "").localeCompare(name.get(b.kategorieId) ?? ""),
    );
    for (const b of gruppe) {
      raus.push({
        budget: b,
        kategorieName: name.get(b.kategorieId) ?? "?",
        tiefe,
        proMonat: betragImMonat(b, am.slice(0, 7)),
        ...budgetStand(sicht, b, am),
        ...verbrauchsFenster(b, am),
        monat: budgetMonatsstand(sicht, b, am),
      });
      gehe(b.id, tiefe + 1);
    }
  };
  gehe(null, 0);
  return raus;
}

/**
 * Die Einzelposten hinter dem Verbrauch EINES Budgets im gezeigten Monat.
 *
 * Bewusst der MONAT und nicht das kumulierte Fenster: darüber steht die Aufrechnung
 * dieses Monats, und eine Liste, die bei einem aufbauenden Budget alles seit dem Start
 * zeigte, summierte sich auf eine andere Zahl als die Zeile darüber. Wer die früheren
 * Monate sehen will, wählt sie — in der Übersicht über den Monatsumschalter, unter
 * Budgets über den Verlauf.
 */
export function budgetPostenZu(
  sicht: BudgetSicht,
  stand: Budgetstand,
): readonly Verbrauchsposten[] {
  return budgetPostenImMonat(sicht, stand.budget, stand.monat);
}

/** Dieselbe Auswahl für einen beliebigen Monat des Verlaufs. */
export function budgetPostenImMonat(
  sicht: BudgetSicht,
  budget: Budget,
  monat: Budgetmonat,
): readonly Verbrauchsposten[] {
  return budgetBuchungen(sicht, budget, monat.von, monat.bis);
}

/**
 * Der Verlauf eines Budgets: die letzten `anzahl` Monate bis einschließlich des Monats
 * von `am`, jeder als Aufrechnung.
 *
 * Rein und ohne Ladevorgang — der Bereich hat seine Sicht schon, und ein Nachladen je
 * aufgeklappter Zeile rechnete gegen einen womöglich anderen Bestand als die Zeile selbst.
 * Kürzer als `anzahl` wird die Reihe, wenn ein aufbauendes Budget später angefangen hat;
 * ein Balken vor seinem Start zeigte Ausgaben, die es nie belastet haben.
 */
export function budgetVerlauf(
  sicht: BudgetSicht,
  budget: Budget,
  am: string,
  anzahl = 12,
): Budgetmonat[] {
  const { vonMonat, bisMonat } = verlaufsfenster(am, anzahl);
  return budgetFortschreibung(sicht, budget, vonMonat, bisMonat);
}


// ---------------------------------------------------------------------------
// Der Bereich „Budgets" — dieselbe Sicht plus das, was nur seine Masken brauchen.
// ---------------------------------------------------------------------------

export interface BudgetbereichDeps extends BudgetsichtDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly einstellungenRepo: EinstellungenRepository;
}

export interface Budgetbereich extends Budgetuebersicht {
  /** Für den Kategorie-Wähler im Dialog. */
  readonly kategorien: readonly Kategorie[];
  /** Für die Konto-Spalte und die Kontoauswahl im Dialog. */
  readonly konten: readonly Zahlungskonto[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Kategorie-ID → Name, für die Einzelposten eines aufgeklappten Monats. */
  readonly kategorieNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung. */
  readonly empfaenger: ReadonlyMap<string, string>;
  /** Rahmenvorschläge für Hauptkategorien ohne Budget. */
  readonly vorschlaege: readonly Budgetvorschlag[];
}

export async function budgetbereichLaden(
  deps: BudgetbereichDeps,
  heute: string,
): Promise<Budgetbereich> {
  const [uebersicht, konten, ignoriert, umsaetze] = await Promise.all([
    budgetuebersichtLaden(deps, heute),
    deps.kontoRepo.alle(),
    ignorierteBudgetvorschlaege(deps.einstellungenRepo),
    deps.umsatzRepo.alle(),
  ]);
  const vorschlaege = await budgetvorschlaegeLaden(
    deps.ledger, deps.umsatzRepo, deps.kategorieRepo, deps.budgetRepo,
    heute.slice(0, 7), heute, ignoriert, deps.zuordnungRepo,
  );
  return {
    ...uebersicht,
    kategorien: uebersicht.sicht.kategorien,
    konten,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    kategorieNamen: new Map(uebersicht.sicht.kategorien.map((k: Kategorie) => [k.id, k.name])),
    empfaenger: empfaengerJeBuchung(umsaetze),
    vorschlaege,
  };
}

/**
 * Ein Budget entfernen. Eigener Use-Case statt `repo.loeschen` aus dem Screen heraus:
 * die UI soll das Repository gar nicht in der Hand haben — heute ist das Löschen ein
 * Einzeiler, morgen hängt eine Regel daran, und dann steht sie an EINER Stelle.
 */
export async function budgetLoeschen(repo: BudgetRepository, id: string): Promise<void> {
  await repo.loeschen(id);
}

/** Ein Budgetstand in seiner Gruppe — Tiefe gezählt nur über Budgets derselben Art. */
export interface GruppierterStand extends Budgetstand {
  /**
   * Der Name des Budgets, unter dem dieses im Baum hängt, wenn das in der ANDEREN Gruppe
   * steht. Ohne den Hinweis stünde „Urlaub" bei den aufbauenden, und woraus es
   * herausgerechnet ist, sagte nichts mehr.
   */
  readonly unter?: string;
}

/** Die Budgetstände, getrennt danach, ob ihr Rest verfällt oder bleibt. */
export interface Budgetgruppen {
  readonly monatlich: readonly GruppierterStand[];
  readonly aufbauend: readonly GruppierterStand[];
}

/**
 * Trennt die Stände nach der Art JEDES Budgets.
 *
 * Monatlich und aufbauend beantworten verschiedene Fragen („was ist diesen Monat noch
 * da" gegen „was hat sich angesammelt"), und in einer gemeinsamen Liste las man das eine
 * mit dem Blick des anderen.
 *
 * **Bis 2026-11-09 wurde nach dem DACH getrennt**, nicht je Zeile: ein aufbauendes
 * „Urlaub" unter einem monatlichen „Freizeit" blieb bei den monatlichen, mit Pille, weil
 * es aus dem Dach herausgerechnet ist. Bei einem Baum, dessen Dächer alle monatlich
 * sind, stand damit jedes Budget in einer Liste, und die Trennung war unsichtbar. Jetzt
 * steht jedes bei seiner Art; den Zusammenhang hält `unter` fest, und die Tiefe zählt
 * nur noch Vorfahren derselben Art — sonst stünde ein Kind eingerückt unter nichts.
 *
 * Die Reihenfolge bleibt die des Baums: `budgetstaende` liefert ihn in Tiefensuche, ein
 * Dach steht also immer vor seinen Kindern.
 */
export function nachArtGetrennt(staende: readonly Budgetstand[]): Budgetgruppen {
  const monatlich: GruppierterStand[] = [];
  const aufbauend: GruppierterStand[] = [];
  const artVon = (z: Budgetstand) => (z.budget.art === "aufbauend" ? "aufbauend" : "monatlich");
  /** Die Vorfahren der aktuellen Zeile, Index = Tiefe. */
  const pfad: Budgetstand[] = [];
  for (const z of staende) {
    pfad.length = z.tiefe;
    const art = artVon(z);
    const vorfahren = pfad.filter(Boolean);
    const eltern = vorfahren[vorfahren.length - 1];
    const eintrag: GruppierterStand = {
      ...z,
      tiefe: vorfahren.filter((v) => artVon(v) === art).length,
      ...(eltern && artVon(eltern) !== art ? { unter: eltern.kategorieName } : {}),
    };
    (art === "aufbauend" ? aufbauend : monatlich).push(eintrag);
    pfad[z.tiefe] = z;
  }
  return { monatlich, aufbauend };
}
