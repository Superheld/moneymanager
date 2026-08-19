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
import { einstellungenLaden, regionWaehlen, type Haushaltseinstellungen } from "../application/einstellungen";
import { stammdatenLaden, type Stammdaten } from "../application/stammdatensichten";
import { inventarLaden, type Inventarsicht } from "../application/inventarsichten";
import { analyseLaden, type Analysebasis } from "../application/analysesichten";
import {
  inventarAktualisieren as inventarAktualisierenUseCase,
  inventarAnlegen as inventarAnlegenUseCase,
  inventarErsetzt as inventarErsetztUseCase,
  inventarLoeschen as inventarLoeschenUseCase,
  type InventarEingabe,
} from "../application/inventarAnlegen";
import {
  kategorieAnlegen as kategorieAnlegenUseCase,
  kontoAnlegen as kontoAnlegenUseCase,
  personAnlegen as personAnlegenUseCase,
  type KategorieEingabe,
  type KontoEingabe,
  type PersonEingabe,
} from "../application/stammdatenAnlegen";
import { standardkategorienAnlegen as standardkategorienUseCase } from "../application/standardkategorien";
import type { Bankzugang } from "../application/fints/abrufPort";
import type { Kontozuordnung } from "../application/fints/bankzugangPort";
import {
  sqliteBankzugangRepository,
  sqliteKontozuordnungRepository,
} from "./persistence/sqliteBankzugangRepositories";
import { sqlitePersonRepository } from "./persistence/sqliteStammdatenRepositories";
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

/** Die Haushaltseinstellungen — Währung, Locale, Sprache. */
export function einstellungen(): Promise<Haushaltseinstellungen> {
  return einstellungenLaden(sqliteEinstellungenRepository);
}

export function regionSetzen(locale: string): Promise<void> {
  return regionWaehlen(sqliteEinstellungenRepository, locale);
}


// --- Stammdaten ------------------------------------------------------------

const STAMMDATEN_DEPS = {
  personRepo: sqlitePersonRepository,
  kontoRepo: sqliteZahlungskontoRepository,
  kategorieRepo: sqliteKategorieRepository,
  ledger: sqliteLedgerRepository,
};

/** Personen, Konten, Kategorien — samt fertig gerechneter Kontostände. */
export function stammdaten(): Promise<Stammdaten> {
  return stammdatenLaden(STAMMDATEN_DEPS);
}

export function personAnlegen(eingabe: PersonEingabe, id?: string) {
  return personAnlegenUseCase(sqlitePersonRepository, eingabe, id);
}

export function kontoAnlegen(eingabe: KontoEingabe, id?: string) {
  return kontoAnlegenUseCase(sqliteZahlungskontoRepository, eingabe, id);
}

export function kategorieAnlegen(eingabe: KategorieEingabe, id?: string) {
  return kategorieAnlegenUseCase(sqliteKategorieRepository, eingabe, id);
}

export function standardkategorienAnlegen(): Promise<number> {
  return standardkategorienUseCase(sqliteKategorieRepository);
}

// --- Bankzugänge -----------------------------------------------------------
//
// Hier gibt es (noch) keinen Use-Case dazwischen: die Screens legen Zugänge und
// Zuordnungen unverändert ab, es ist nichts zu entscheiden. Der Weg über diese Datei
// hält die Repositories trotzdem aus der Oberfläche heraus — kommt morgen eine Regel
// dazu, hat sie hier bereits ihren Platz.

export function bankzugaenge(): Promise<Bankzugang[]> {
  return sqliteBankzugangRepository.alle();
}

export function bankzugangSpeichern(zugang: Bankzugang): Promise<void> {
  return sqliteBankzugangRepository.speichern(zugang);
}

export function bankzugangLoeschen(id: string): Promise<void> {
  return sqliteBankzugangRepository.loeschen(id);
}

export function kontozuordnungen(): Promise<Kontozuordnung[]> {
  return sqliteKontozuordnungRepository.alle();
}

export function kontozuordnungenNachZugang(zugangId: string): Promise<Kontozuordnung[]> {
  return sqliteKontozuordnungRepository.nachZugang(zugangId);
}

export function kontozuordnungSpeichern(z: Kontozuordnung): Promise<void> {
  return sqliteKontozuordnungRepository.speichern(z);
}

export function kontozuordnungLoeschen(zugangId: string, schluessel: string): Promise<void> {
  return sqliteKontozuordnungRepository.loeschen(zugangId, schluessel);
}

export function personLoeschen(id: string): Promise<void> {
  return sqlitePersonRepository.loeschen(id);
}

export function kategorieLoeschen(id: string): Promise<void> {
  return sqliteKategorieRepository.loeschen(id);
}

export function kontoLoeschen(id: string): Promise<void> {
  return sqliteZahlungskontoRepository.loeschen(id);
}

/** Alle bekannten Umsätze — für die Dublettenprüfung beim Anlegen einer Verbindung. */
export function umsaetze() {
  return sqliteUmsatzRepository.alle();
}


// --- Inventar --------------------------------------------------------------

const INVENTAR_DEPS = {
  inventarRepo: sqliteInventarRepository,
  ledger: sqliteLedgerRepository,
  kontoRepo: sqliteZahlungskontoRepository,
};

export function inventar(heute: string): Promise<Inventarsicht> {
  return inventarLaden(INVENTAR_DEPS, heute);
}

export function inventarAnlegen(eingabe: InventarEingabe) {
  return inventarAnlegenUseCase(sqliteInventarRepository, eingabe);
}

export function inventarAktualisieren(id: string, eingabe: InventarEingabe) {
  return inventarAktualisierenUseCase(sqliteInventarRepository, id, eingabe);
}

export function inventarErsetzt(g: Parameters<typeof inventarErsetztUseCase>[1], datum: string, wert?: number) {
  return inventarErsetztUseCase(sqliteInventarRepository, g, datum, wert);
}

export function inventarLoeschen(id: string) {
  return inventarLoeschenUseCase(sqliteInventarRepository, id);
}

/** Die Datengrundlage des Analyse-Bereichs — einmal geladen, danach rein gerechnet. */
export function analyse(): Promise<Analysebasis> {
  return analyseLaden({
    ledger: sqliteLedgerRepository,
    kontoRepo: sqliteZahlungskontoRepository,
    kategorieRepo: sqliteKategorieRepository,
    umsatzRepo: sqliteUmsatzRepository,
  });
}
