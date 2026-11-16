// Kontobelegung laden — wem das Geld auf jedem Konto gehört, fertig gerechnet.
//
// Die Rechnung selbst steht in `core/konten/kontobelegung`; hier wird nur zusammengetragen,
// WER Ansprüche hat. Das sind heute zwei: Rücklagen (ihr Stand über null — das Soll,
// abzüglich dessen, was sie seit ihrem Fundfenster über die Kategorie gefunden haben) und
// aufbauende Budgets (ihr Rest). Wer einen dritten einführt, trägt ihn HIER ein — und nur hier: die
// Rücklagen-Deckung holt ihre fremden Ansprüche über `budgetAnspruecheLaden` von derselben
// Stelle, damit sie nicht an einem Konto anders rechnet als die Kontenansicht, und die
// Karte „Wo das Geld liegt" im Bereich Rücklagen liest `belegungssicht` selbst
// (`application/ruecklagen/geldJeKonto.ts`).

import {
  aufbauendeAnsprueche,
  kontobelegung,
  realerKontostand,
  ruecklagenAnsprueche,
  ruecklagenEntnahmenAus,
  type Anspruch,
  type Anspruchsbestand,
  type Budget,
  type BudgetSicht,
  type IstBuchung,
  type Kontobelegung,
  type Ruecklage,
  type Zahlungskonto,
} from "../../core";
import { vertragsBuchungenLaden } from "../budgets/budgetsichten";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  RuecklagenzuordnungRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "../ports";
import { alleRuecklagen, ruecklagenbestandLaden, type Ruecklagenbestand } from "../ruecklagen/ruecklagenbestand";

export interface BudgetanspruchDeps {
  readonly ledger: LedgerPort;
  readonly budgetRepo: BudgetRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  /**
   * Die Rücklagen gehören dazu, seit eine Rücklage ihre Ausgaben über die Kategorie findet:
   * eine auf einer Unterkategorie nimmt dem aufbauenden Budget darüber seine Buchungen ab,
   * wie in der Ergebnisrechnung.
   */
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ruecklagenzuordnungRepo: RuecklagenzuordnungRepository;
}

export interface KontobelegungDeps extends BudgetanspruchDeps {
  readonly kontoRepo: ZahlungskontoRepository;
}

/**
 * Was der Anspruch einer Rücklage von Hand ausser ihr selbst braucht: was sie über ihre
 * Kategorie gefunden hat (dieselbe Auswahl wie der Verbrauch eines Budgets) und die
 * Abschlüsse, die das Fenster ihres laufenden Zyklus begrenzen.
 */
export function anspruchsbestand(sicht: BudgetSicht): Anspruchsbestand {
  return { entnahmen: ruecklagenEntnahmenAus(sicht), abschluesse: sicht.ausbuchungen ?? [] };
}

/** Die Budget-Sicht samt Rücklagen — wie die Übersicht sie baut. */
export function budgetsichtMit(
  basis: Omit<BudgetSicht, "ruecklagen" | "ruecklagenzuordnungen" | "ausbuchungen">,
  rb: Ruecklagenbestand,
): BudgetSicht {
  return { ...basis, ruecklagen: alleRuecklagen(rb), ruecklagenzuordnungen: rb.ruecklagenzuordnungen, ausbuchungen: rb.ausbuchungen };
}

export interface Belegungssicht {
  /** Je Konto — auch die ohne Anspruch. */
  readonly jeKonto: ReadonlyMap<string, Kontobelegung>;
  /** Wie ein Anspruch heisst: Bezeichnung der Rücklage bzw. Kategorie des Budgets. */
  readonly namen: ReadonlyMap<string, string>;
}

/**
 * Die Ansprüche der aufbauenden Budgets samt ihrer Namen.
 *
 * Eigene Funktion, weil die Rücklagen-Deckung genau diese braucht — und sie bekommen soll,
 * ohne die Regel „welche Budgets beanspruchen was" ein zweites Mal aufzuschreiben.
 */
export async function budgetAnspruecheLaden(
  deps: BudgetanspruchDeps,
  heute: string,
): Promise<{
  ansprueche: Anspruch[];
  namen: Map<string, string>;
  budgets: readonly Budget[];
  /** Für den Anspruch der Rücklagen von Hand (`anspruchsbestand`). */
  bestand: Anspruchsbestand;
}> {
  const [buchungen, kategorien, budgets, vertragsBuchungen, rb] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
    ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo),
  ]);
  const kategorie = new Map(kategorien.map((k) => [k.id, k.name]));
  const sicht = budgetsichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb);
  return {
    bestand: anspruchsbestand(sicht),
    ansprueche: aufbauendeAnsprueche(sicht, heute),
    namen: new Map(budgets.map((b) => [b.id, kategorie.get(b.kategorieId) ?? "?"])),
    // Mitgegeben, weil der Bereich Rücklagen die aufbauenden auch für Bedarf und
    // Rücklagenkonten braucht — und sie sonst ein zweites Mal läse.
    budgets,
  };
}

/**
 * Die Belegung aus schon geladenen Daten — für Sichten, die ohnehin alles in der Hand
 * haben (die Übersicht). Dieselbe Zusammenstellung der Ansprüche wie in
 * `kontobelegungLaden`: wer einen dritten Anspruch einführt, trägt ihn HIER ein.
 */
export function belegungssicht(
  e: {
    konten: readonly Zahlungskonto[];
    buchungen: IstBuchung[];
    ruecklagen: readonly Ruecklage[];
    sicht: BudgetSicht;
  },
  heute: string,
): Belegungssicht {
  const kategorie = new Map(e.sicht.kategorien.map((k) => [k.id, k.name]));
  const namen = new Map(e.sicht.budgets.map((b) => [b.id, kategorie.get(b.kategorieId) ?? "?"]));
  for (const r of e.ruecklagen) namen.set(r.id, r.bezeichnung);
  const staende = new Map(e.konten.map((k) => [k.id, realerKontostand(k, e.buchungen)]));
  return {
    jeKonto: kontobelegung(staende, [
      ...ruecklagenAnsprueche(e.ruecklagen, heute, anspruchsbestand(e.sicht)),
      ...aufbauendeAnsprueche(e.sicht, heute),
    ]),
    namen,
  };
}

export async function kontobelegungLaden(deps: KontobelegungDeps, heute: string): Promise<Belegungssicht> {
  const [konten, buchungen, rb, kategorien, budgets, vertragsBuchungen] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
  ]);
  return belegungssicht(
    { konten, buchungen, ruecklagen: rb.ruecklagen, sicht: budgetsichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb) },
    heute,
  );
}
