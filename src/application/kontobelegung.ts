// Kontobelegung laden — wem das Geld auf jedem Konto gehört, fertig gerechnet.
//
// Die Rechnung selbst steht in `core/konten/kontobelegung`; hier wird nur zusammengetragen,
// WER Ansprüche hat. Seit Migration 81 ist das nur noch eine Sorte: die Rücklagen (ihr
// Stand über null — das Soll, abzüglich dessen, was sie seit ihrem Fundfenster über die
// Kategorie gefunden haben). Bis dahin kamen die Reste der aufbauenden Budgets als zweite
// dazu; die sind jetzt selbst Rücklagen der Sorte `fortlaufend`. Wer einen neuen Anspruch
// einführt, trägt ihn HIER ein — und nur hier: die Rücklagen-Deckung holt ihren Bestand
// über `anspruchsbestandLaden` von derselben Stelle, damit sie nicht an einem Konto anders
// rechnet als die Kontenansicht, und die Karte „Wo das Geld liegt" im Bereich Rücklagen
// liest `belegungssicht` selbst (`application/ruecklagen/geldJeKonto.ts`).
//
// **Liegt direkt in `src/application/`, weil es bereichsübergreifend abwägt:** den Stand
// der Konten (`konten`, gerechnet über `buchung`) gegen die Ansprüche der Rücklagen
// (`ruecklagen`), deren Fund über die Zuständigkeit Budgets (`budgets`) und
// Vertragsbuchungen (`vertraege`) braucht. Rücklagen und Budgets lesen das Ergebnis.

import {
  kontobelegung,
  realerKontostand,
  ruecklagenAnsprueche,
  ruecklagenEntnahmenAus,
  type Anspruchsbestand,
  type Budget,
  type Zustaendigkeitssicht,
  type IstBuchung,
  type Kontobelegung,
  type Ruecklage,
  type Zahlungskonto,
} from "../core";
import { vertragsBuchungenLaden } from "./vertraege/vertragszuordnung";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  RuecklagenzuordnungRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "./ports";
import { alleRuecklagen, ruecklagenbestandLaden, type Ruecklagenbestand } from "./ruecklagen/ruecklagenbestand";

export interface BudgetanspruchDeps {
  readonly ledger: LedgerPort;
  readonly budgetRepo: BudgetRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  /**
   * Die Rücklagen gehören dazu, seit eine Rücklage ihre Ausgaben über die Kategorie findet:
   * was sie gefunden hat, beansprucht sie nicht mehr, und ein monatliches Budget darüber
   * verliert die Buchungen an sie.
   */
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ruecklagenzuordnungRepo: RuecklagenzuordnungRepository;
}

export interface KontobelegungDeps extends BudgetanspruchDeps {
  readonly kontoRepo: ZahlungskontoRepository;
}

/**
 * Was der Anspruch einer Rücklage ausser ihr selbst braucht: was sie über ihre Kategorie
 * gefunden hat (dieselbe Auswahl wie der Verbrauch eines Budgets) und die Abschlüsse, die
 * das Fenster ihres laufenden Zyklus begrenzen.
 */
export function anspruchsbestand(sicht: Zustaendigkeitssicht): Anspruchsbestand {
  return { entnahmen: ruecklagenEntnahmenAus(sicht), abschluesse: sicht.ausbuchungen ?? [] };
}

/** Die Budget-Sicht samt Rücklagen — wie die Übersicht sie baut. */
export function zustaendigkeitssichtMit(
  basis: Omit<Zustaendigkeitssicht, "ruecklagen" | "ruecklagenzuordnungen" | "ausbuchungen">,
  rb: Ruecklagenbestand,
): Zustaendigkeitssicht {
  return { ...basis, ruecklagen: alleRuecklagen(rb), ruecklagenzuordnungen: rb.ruecklagenzuordnungen, ausbuchungen: rb.ausbuchungen };
}

export interface Belegungssicht {
  /** Je Konto — auch die ohne Anspruch. */
  readonly jeKonto: ReadonlyMap<string, Kontobelegung>;
  /** Wie ein Anspruch heisst: die Bezeichnung der Rücklage. */
  readonly namen: ReadonlyMap<string, string>;
}

/**
 * Der Bestand, den der Anspruch einer Rücklage braucht, samt der Budgets.
 *
 * Eigene Funktion, weil die Rücklagen-Deckung genau diesen braucht — und ihn bekommen
 * soll, ohne die Regel „was hat eine Rücklage gefunden" ein zweites Mal aufzuschreiben.
 * Bis Migration 81 hiess sie `budgetAnspruecheLaden` und lieferte die Ansprüche der
 * aufbauenden Budgets mit.
 */
export async function anspruchsbestandLaden(deps: BudgetanspruchDeps): Promise<{
  /** Für den Anspruch der Rücklagen (`anspruchsbestand`). */
  bestand: Anspruchsbestand;
  /** Mitgegeben für die Hinweise im Dialog einer Rücklage (ein Budget an der Kategorie). */
  budgets: readonly Budget[];
  /** Die Sicht dahinter — für den Verlauf einer Rücklage und ihre Buchungen je Monat. */
  sicht: Zustaendigkeitssicht;
}> {
  const [buchungen, kategorien, budgets, vertragsBuchungen, rb] = await Promise.all([
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
    deps.budgetRepo.alle(),
    vertragsBuchungenLaden(deps.zuordnungRepo),
    ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo),
  ]);
  const sicht = zustaendigkeitssichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb);
  return { bestand: anspruchsbestand(sicht), budgets, sicht };
}

/**
 * Die Belegung aus schon geladenen Daten — für Sichten, die ohnehin alles in der Hand
 * haben (die Übersicht). Dieselbe Zusammenstellung der Ansprüche wie in
 * `kontobelegungLaden`: wer einen neuen Anspruch einführt, trägt ihn HIER ein.
 */
export function belegungssicht(
  e: {
    konten: readonly Zahlungskonto[];
    buchungen: IstBuchung[];
    ruecklagen: readonly Ruecklage[];
    sicht: Zustaendigkeitssicht;
  },
  heute: string,
): Belegungssicht {
  const namen = new Map(e.ruecklagen.map((r) => [r.id, r.bezeichnung]));
  const staende = new Map(e.konten.map((k) => [k.id, realerKontostand(k, e.buchungen)]));
  return {
    jeKonto: kontobelegung(staende, ruecklagenAnsprueche(e.ruecklagen, heute, anspruchsbestand(e.sicht))),
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
    { konten, buchungen, ruecklagen: rb.ruecklagen, sicht: zustaendigkeitssichtMit({ buchungen, kategorien, budgets, vertragsBuchungen }, rb) },
    heute,
  );
}
