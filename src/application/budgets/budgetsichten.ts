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

import { buchungszeile, zeilenkontext, type Buchungszeile, type Zeilenkontext } from "../buchung/buchungszeile";
import { vertragsBuchungenLaden, vertragsnamenLaden } from "../vertraege/vertragszuordnung";
import {
  betragImMonat,
  budgetBuchungen,
  ruecklagenAnteile,
  budgetFortschreibung,
  budgetMonatsstand,
  budgetStand,
  elternBudget,
  herausgerechnet,
  verbrauchsFenster,
  verlaufsfenster,
  type Budget,
  type Fortschreibungsmonat,
  type Zustaendigkeitssicht,
  type Budgetvorschlag,
  type Cent,
  type Kategorie,
  type Zahlungskonto,
} from "../../core";
import { budgetvorschlaegeLaden, ignorierteBudgetvorschlaege } from "./budgetvorschlaege";
import { zustaendigkeitssichtMit } from "../kontobelegung";
import { ruecklagenbestandLaden } from "../ruecklagen/ruecklagenbestand";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  RuecklagenzuordnungRepository,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "../ports";

export interface BudgetsichtDeps {
  readonly ledger: LedgerPort;
  readonly kategorieRepo: KategorieRepository;
  readonly budgetRepo: BudgetRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  /**
   * Seit eine Rücklage ihre Ausgaben über die Kategorie findet, nimmt sie dem Budget
   * darüber ihre Buchungen ab — dieselbe Zuständigkeit wie in der Ergebnisrechnung.
   */
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ruecklagenzuordnungRepo: RuecklagenzuordnungRepository;
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
  /** Rahmen und Verbrauch des Monats; `rest` ist ihre Differenz. */
  readonly rahmen: Cent;
  readonly verbraucht: Cent;
  readonly rest: Cent;
  /** Das Fenster, über das `verbraucht` zählt: der Monat. */
  readonly von: string;
  readonly bis: string;
  /**
   * Derselbe Stand als Aufrechnung DIESES Monats. `monat.rest === rest`, immer — siehe
   * `core/budgets/budgetverlauf`.
   */
  readonly monat: Fortschreibungsmonat;
  /**
   * Die Namen der Rücklagen, die diesem Budget heute Buchungen abnehmen, weil sie
   * darunter hängen (`herausgerechnet`). Ohne den Hinweis wäre der Verbrauch kleiner als
   * die Ausgaben der Kategorie, und nichts sagte warum. Fehlt, wenn nichts
   * herausgerechnet ist.
   */
  readonly abgezogen?: readonly string[];
}

export interface Budgetuebersicht {
  readonly staende: readonly Budgetstand[];
  /**
   * Die geladene Sicht — nur für Nachfragen wie `budgetBuchungenZu`. Sie mit
   * herauszugeben ist bewusst: der Screen soll die Einzelposten eines aufgeklappten
   * Budgets holen können, ohne alles neu zu laden, aber weiterhin nicht selbst über
   * die Auswahl entscheiden.
   */
  readonly sicht: Zustaendigkeitssicht;
}

/**
 * Alle Budgetstände zum Stichtag `am`, in Baumordnung: ein eingebettetes Budget steht
 * unter seinem Dach, Geschwister alphabetisch nach Kategoriename.
 */
export async function budgetuebersichtLaden(
  deps: BudgetsichtDeps,
  am: string,
): Promise<Budgetuebersicht> {
  const [buchungen, kategorien, budgets, vertragsBuchungen, rb] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
    ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo),
  ]);
  const sicht = zustaendigkeitssichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb);
  return { staende: budgetstaende(sicht, am), sicht };
}

/** Reine Baumordnung + Stände über eine fertige Sicht — getrennt, damit sie testbar ist. */
export function budgetstaende(sicht: Zustaendigkeitssicht, am: string): Budgetstand[] {
  const { budgets, kategorien } = sicht;
  const name = new Map(kategorien.map((k: Kategorie) => [k.id, k.name]));

  const kinder = new Map<string | null, Budget[]>();
  for (const b of budgets) {
    const eltern = elternBudget(b, budgets, kategorien)?.id ?? null;
    const liste = kinder.get(eltern);
    if (liste) liste.push(b);
    else kinder.set(eltern, [b]);
  }

  const { ausBudget } = herausgerechnet(kategorien, budgets, sicht.ruecklagen ?? [], am);
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
        ...(ausBudget.has(b.id) ? { abgezogen: (ausBudget.get(b.id) ?? []).map((r) => r.bezeichnung) } : {}),
      });
      gehe(b.id, tiefe + 1);
    }
  };
  gehe(null, 0);
  return raus;
}

/**
 * Die Buchungen hinter dem Verbrauch EINES Budgets im gezeigten Monat — als
 * `Buchungszeile`, dieselbe Form wie in der Analyse.
 *
 * Der MONAT: darüber steht die Aufrechnung dieses Monats. Wer die früheren
 * Monate sehen will, wählt sie — in der Übersicht über den Monatsumschalter, unter
 * Budgets über den Verlauf.
 *
 * Der Betrag kommt MIT Vorzeichen heraus: ein Verbrauchsposten zählt „positiv heisst
 * verbraucht", eine Buchungsliste zeigt die Richtung wie überall sonst. Die Ausgabe ist
 * also negativ, die Erstattung positiv.
 */
export function budgetzeilenZu(
  sicht: Zustaendigkeitssicht,
  stand: Budgetstand,
  kontext: Zeilenkontext,
): readonly Buchungszeile[] {
  return budgetzeilenImMonat(sicht, stand.budget, stand.monat, kontext);
}

/** Dieselbe Auswahl für einen beliebigen Monat des Verlaufs. */
export function budgetzeilenImMonat(
  sicht: Zustaendigkeitssicht,
  budget: Budget,
  monat: Fortschreibungsmonat,
  kontext: Zeilenkontext,
): readonly Buchungszeile[] {
  return budgetBuchungen(sicht, budget, monat.von, monat.bis).map((p) =>
    buchungszeile(p.buchung, -p.betrag, p.kategorieId, kontext),
  );
}

/**
 * Der Verlauf eines Budgets: die letzten `anzahl` Monate bis einschließlich des Monats
 * von `am`, jeder als Aufrechnung.
 *
 * Rein und ohne Ladevorgang — der Bereich hat seine Sicht schon, und ein Nachladen je
 * aufgeklappter Zeile rechnete gegen einen womöglich anderen Bestand als die Zeile selbst.
 */
export function budgetVerlauf(
  sicht: Zustaendigkeitssicht,
  budget: Budget,
  am: string,
  anzahl = 12,
): Fortschreibungsmonat[] {
  const { vonMonat, bisMonat } = verlaufsfenster(am, anzahl);
  return budgetFortschreibung(sicht, budget, vonMonat, bisMonat);
}


// ---------------------------------------------------------------------------
// Der Bereich „Budgets" — dieselbe Sicht plus das, was nur seine Masken brauchen.
// ---------------------------------------------------------------------------

export interface BudgetbereichDeps extends BudgetsichtDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly vertragRepo: VertragRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly einstellungenRepo: EinstellungenRepository;
}

export interface Budgetbereich extends Budgetuebersicht {
  /** Für den Kategorie-Wähler im Dialog. */
  readonly kategorien: readonly Kategorie[];
  /** Für die Konto-Spalte und die Kontoauswahl im Dialog. */
  readonly konten: readonly Zahlungskonto[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Was die Buchungszeilen eines aufgeklappten Monats brauchen (`budgetzeilenImMonat`). */
  readonly zeilenkontext: Zeilenkontext;
  /** Rahmenvorschläge für Hauptkategorien ohne Budget. */
  readonly vorschlaege: readonly Budgetvorschlag[];
  /**
   * Gibt es überhaupt Buchungen? Ohne sie gibt es nichts, woraus sich ein Budget
   * vorschlagen liesse — der leere Bereich führt dann zuerst in den Import.
   */
  readonly hatBuchungen: boolean;
}

export async function budgetbereichLaden(
  deps: BudgetbereichDeps,
  heute: string,
): Promise<Budgetbereich> {
  const [uebersicht, konten, ruecklagen, ignoriert, umsaetze, vertragsnamen] = await Promise.all([
    budgetuebersichtLaden(deps, heute),
    deps.kontoRepo.alle(),
    deps.ruecklagenRepo.alle(),
    ignorierteBudgetvorschlaege(deps.einstellungenRepo),
    deps.umsatzRepo.alle(),
    vertragsnamenLaden(deps.zuordnungRepo, deps.vertragRepo),
  ]);
  const vorschlaege = await budgetvorschlaegeLaden(
    deps.ledger, deps.umsatzRepo, deps.kategorieRepo, deps.budgetRepo,
    heute.slice(0, 7), heute, ignoriert, deps.zuordnungRepo, ruecklagenAnteile(uebersicht.sicht), ruecklagen,
  );
  return {
    ...uebersicht,
    kategorien: uebersicht.sicht.kategorien,
    konten,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    zeilenkontext: zeilenkontext(umsaetze, konten, uebersicht.sicht.kategorien, vertragsnamen),
    vorschlaege,
    hatBuchungen: uebersicht.sicht.buchungen.length > 0,
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
