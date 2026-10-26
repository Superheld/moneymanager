// Kontobelegung laden — wem das Geld auf jedem Konto gehört, fertig gerechnet.
//
// Die Rechnung selbst steht in `core/konten/kontobelegung`; hier wird nur zusammengetragen,
// WER Ansprüche hat. Das sind heute zwei: Rücklagen (ihr Soll) und aufbauende Budgets
// (ihr Rest). Wer einen dritten einführt, trägt ihn HIER ein — und nur hier: die
// Rücklagen-Deckung holt ihre fremden Ansprüche über `budgetAnspruecheLaden` von derselben
// Stelle, damit sie nicht an einem Konto anders rechnet als die Kontenansicht.

import {
  aufbauendeAnsprueche,
  kontobelegung,
  realerKontostand,
  ruecklagenAnsprueche,
  type Anspruch,
  type Kontobelegung,
} from "../../core";
import { vertragsBuchungenLaden } from "../budgets/budgetsichten";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "../ports";

export interface BudgetanspruchDeps {
  readonly ledger: LedgerPort;
  readonly budgetRepo: BudgetRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
}

export interface KontobelegungDeps extends BudgetanspruchDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ruecklagenRepo: RuecklagenRepository;
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
): Promise<{ ansprueche: Anspruch[]; namen: Map<string, string> }> {
  const [buchungen, kategorien, budgets, vertragsBuchungen] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
  ]);
  const kategorie = new Map(kategorien.map((k) => [k.id, k.name]));
  return {
    ansprueche: aufbauendeAnsprueche({ buchungen, kategorien, budgets, vertragsBuchungen }, heute),
    namen: new Map(budgets.map((b) => [b.id, kategorie.get(b.kategorieId) ?? "?"])),
  };
}

export async function kontobelegungLaden(deps: KontobelegungDeps, heute: string): Promise<Belegungssicht> {
  const [konten, buchungen, ruecklagen, budget] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    deps.ruecklagenRepo.alle(),
    budgetAnspruecheLaden(deps, heute),
  ]);
  const staende = new Map(konten.map((k) => [k.id, realerKontostand(k, buchungen)]));
  const namen = new Map(budget.namen);
  for (const r of ruecklagen) namen.set(r.id, r.bezeichnung);
  return {
    jeKonto: kontobelegung(staende, [...ruecklagenAnsprueche(ruecklagen, heute), ...budget.ansprueche]),
    namen,
  };
}
