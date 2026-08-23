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
// Welche Buchungen zu einem Vertrag gehören, sagt die Tabelle `vertrag_zuordnung`
// (`VertragszuordnungRepository`) — eine erfasste Verknüpfung, keine Schätzung. Auf dem
// echten Bestand liefert sie für den August exakt dieselben Zahlen wie die
// Betragsheuristik des Monatsausblicks (0,00 / 131,00 / 45,87 / 289,51 / 26,50); wir
// tauschen also kein Verhalten, sondern nur eine Vermutung gegen eine Tatsache.

import {
  budgetBuchungen,
  budgetFortschreibung,
  budgetMonatsstand,
  budgetStand,
  effektiverMonatsbetrag,
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
   * Was pro Monat auf dieses Budget entfällt, nachdem die eingebetteten ihren Teil
   * bekommen haben. Kann negativ werden — dann fordern die Unterbudgets zusammen mehr,
   * als das Dach hergibt. Bewusst nicht auf 0 geklemmt: das ist ein Widerspruch in der
   * Planung, den man sehen soll.
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
        proMonat: effektiverMonatsbetrag(b, budgets, kategorien),
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
    empfaenger: new Map(
      umsaetze
        .filter((u) => u.istbuchungId && u.gegenpartei)
        .map((u) => [u.istbuchungId!, u.gegenpartei!]),
    ),
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
