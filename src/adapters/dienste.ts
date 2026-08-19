// Verdrahtung — der Kompositionspunkt zwischen Use-Cases und SQLite.
//
// Die Use-Cases in `application/` nehmen Ports entgegen; die Umsetzungen liegen in
// `adapters/persistence/`. Irgendwo müssen die beiden zusammenkommen, und irgendwo heißt
// hier: in EINER Datei, nicht in achtundvierzig Screens. Genau das war der Zustand
// vorher — 100 Import-Stellen von Repositories über die UI verteilt, und mit jeder
// davon die Freiheit, die Regeln der Anwendungsschicht zu umgehen.
//
// Diese Datei liegt in `adapters/`, nicht in `application/`: sie darf beide Seiten
// kennen, weil sie selbst ein Adapter ist. Die Abhängigkeitsrichtung bleibt intakt —
// `application/` weiß nichts von SQLite.
//
// Sie wächst mit der Migration. Was hier noch fehlt, holt sich der jeweilige Screen
// vorerst noch selbst (siehe ALTLAST in `src/architektur.test.ts`).

import {
  budgetbereichLaden,
  budgetLoeschen as budgetLoeschenUseCase,
  budgetuebersichtLaden,
  type Budgetbereich,
  type Budgetuebersicht,
} from "../application/budgetsichten";
import { uebersichtLaden, type Uebersichtsdaten } from "../application/uebersicht";
import { budgetAnlegen as budgetAnlegenUseCase, type BudgetEingabe } from "../application/budgetAnlegen";
import { budgetvorschlagIgnorieren } from "../application/budgetvorschlaege";
import { sqliteBudgetRepository } from "./persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "./persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository } from "./persistence/sqliteStammdatenRepositories";
import { sqliteVertragszuordnungRepository } from "./persistence/sqliteVertragZuordnungRepositories";
import { sqliteZahlungsregelRepository } from "./persistence/sqliteZahlungsregelRepository";
import { sqliteInventarRepository } from "./persistence/sqliteInventarRepository";
import { sqliteUmsatzRepository } from "./persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository } from "./persistence/sqliteStammdatenRepositories";
import { sqliteEinstellungenRepository } from "./persistence/sqliteEinstellungenRepository";

const BUDGET_DEPS = {
  ledger: sqliteLedgerRepository,
  kategorieRepo: sqliteKategorieRepository,
  budgetRepo: sqliteBudgetRepository,
  zuordnungRepo: sqliteVertragszuordnungRepository,
};

/** Budgetstände zum Stichtag `am` — fertig gerechnet, Verträge herausgerechnet. */
export function budgetuebersicht(am: string): Promise<Budgetuebersicht> {
  return budgetuebersichtLaden(BUDGET_DEPS, am);
}

/** Alles, was der Übersichts-Screen zeigt — drei Monatskarten plus Budgetliste. */
export function uebersicht(heute: string): Promise<Uebersichtsdaten> {
  return uebersichtLaden(
    { ...BUDGET_DEPS, regelRepo: sqliteZahlungsregelRepository, inventarRepo: sqliteInventarRepository, umsatzRepo: sqliteUmsatzRepository },
    heute,
  );
}

/** Alles, was der Bereich „Budgets" zeigt — Stände, Konten, Kategorien, Vorschläge. */
export function budgetbereich(heute: string): Promise<Budgetbereich> {
  return budgetbereichLaden(
    {
      ...BUDGET_DEPS,
      kontoRepo: sqliteZahlungskontoRepository,
      umsatzRepo: sqliteUmsatzRepository,
      einstellungenRepo: sqliteEinstellungenRepository,
    },
    heute,
  );
}

export function budgetLoeschen(id: string): Promise<void> {
  return budgetLoeschenUseCase(sqliteBudgetRepository, id);
}

export function budgetAnlegen(eingabe: BudgetEingabe, id?: string) {
  return budgetAnlegenUseCase(sqliteBudgetRepository, eingabe, id);
}

export function vorschlagIgnorieren(kategorieId: string): Promise<void> {
  return budgetvorschlagIgnorieren(sqliteEinstellungenRepository, kategorieId);
}
