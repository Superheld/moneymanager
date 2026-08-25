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
} from "../application/budgets/budgetsichten";
import { uebersichtLaden, type Uebersichtsdaten } from "../application/uebersicht";
import {
  budgetAnlegen as budgetAnlegenUseCase,
  budgetBetragLoeschen as budgetBetragLoeschenUseCase,
  type BudgetEingabe,
} from "../application/budgets/budgetAnlegen";
import { budgetvorschlagIgnorieren } from "../application/budgets/budgetvorschlaege";
import {
  abrufAusfuehren,
  type Abrufergebnis,
} from "../application/fints/abrufAusfuehren";
import type { TanFrager } from "../application/fints/abrufPort";
import { fintsAbruf } from "./fints";
import { hanseaticAbruf } from "./hanseatic";
import { konfigurationLaden, herkunftSchalten, merkmalsansicht, type Merkmalsansicht, wirkungMessen, wortAusschliessen, wortZulassen } from "../application/kategorien/merkmalskonfiguration";
import { trainingsmaterial, type Materialbefund } from "../application/kategorien/trainingsmaterial";
import { klassifikatorTrainieren, modellzustand, type Modellzustand } from "../application/kategorien/klassifikatorTraining";
import { abgleichVorschau, planAnwenden, type Abgleichsplan } from "../application/kategorien/kategorieAbgleich";
import { festlegungAufheben, festlegungSetzen } from "../application/kategorien/kategoriefestlegungen";
import type { Merkmalskonfiguration, Merkmalsherkunft } from "../core";
import { zuordnungenAbgleichen } from "../application/vertraege/vertragszuordnung";
import { zahlungsspuren } from "../application/buchung/zahlungsspuren";
import { kategorisierungsquellen } from "../application/kategorien/kategorisierungsquellen";
import { festlegungAnwenden as festlegungAnwendenUseCase } from "../application/kategorien/kategoriefestlegungen";
import { umsaetzeVerbuchen } from "../application/import";
import type { Kategorie } from "../core";
import {
  umsaetzeUebernehmen,
  type UebernahmeEingabe,
  type UebernahmeErgebnis,
  type Umsatz,
} from "../application/import";
import {
  sqliteDublettenfreigabeRepository,
  sqliteImportLaufRepository,
} from "./persistence/sqliteImportRepositories";
import { sqliteKategoriefestlegungRepository } from "./persistence/sqliteKategoriefestlegungRepository";
import { sqliteKontostandsankerRepository } from "./persistence/sqliteKontostandRepository";
import { sqliteDepotRepository } from "./persistence/sqliteDepotRepository";
import { sqliteKlassifikatorRepository } from "./persistence/sqliteKlassifikatorRepository";
import { sqliteMerkmalskonfigurationRepository } from "./persistence/sqliteMerkmalskonfigurationRepository";
import { einstellungenLaden, regionWaehlen, type Haushaltseinstellungen } from "../application/einstellungen";
import {
  aktualisierungEinspielen,
  aktualisierungPruefen,
  pruefungErlaubt,
  pruefungSchalten,
  type Aktualisierung,
} from "../application/aktualisierung";
import { tauriAktualisierung } from "./aktualisierung";
import {
  experimenteLaden,
  experimentSchalten,
  type ExperimentId,
  type Experimente,
} from "../application/experimente";
import { stammdatenLaden, type Stammdaten } from "../application/stammdaten/stammdatensichten";
import { inventarLaden, type Inventarsicht } from "../application/inventar/inventarsichten";
import { depotsLaden, type Depotdaten } from "../application/depot/depotsichten";
import { analyseLaden, type Analysebasis } from "../application/analysesichten";
import { vertraegeLaden, type Vertragssicht } from "../application/vertraege/vertragssichten";
import { kontenLaden, type Kontensicht } from "../application/konten/kontensichten";
import { buchungsdetailLaden, type Buchungsdetaildaten } from "../application/buchung/buchungsdetail";
import {
  dublettenFreigabeAufheben as dublettenFreigabeAufhebenUseCase,
  dublettenFreigeben as dublettenFreigebenUseCase,
} from "../application/dubletten/dublettenFreigabe";
import {
  anfangsbestandAbgleichen as anfangsbestandAbgleichenUseCase,
  kontostandFesthalten as kontostandFesthaltenUseCase,
} from "../application/konten/kontostandAnker";
import {
  buchungBearbeiten as buchungBearbeitenUseCase,
  buchungErfassen as buchungErfassenUseCase,
  buchungLoeschen as buchungLoeschenUseCase,
  type BuchungEingabe,
} from "../application/buchung/buchungErfassen";
import { umbuchungLoeschen as umbuchungLoeschenUseCase } from "../application/buchung/umbuchungErfassen";
import { bankzeileVerwerfen as bankzeileVerwerfenUseCase } from "../application/import/bankzeileVerwerfen";
import { abgleichLaden as abgleichLadenUseCase } from "../application/konten/abgleichsicht";
import { herkunftLaden as herkunftLadenUseCase } from "../application/konten/herkunftsicht";
import { pruefmarkerSetzen as pruefmarkerSetzenUseCase } from "../application/buchung/pruefmarker";
import { buchungSplitten as buchungSplittenUseCase, splitAufheben as splitAufhebenUseCase } from "../application/buchung/buchungSplitten";
import { paarungLoesen as paarungLoesenUseCase } from "../application/buchung/umbuchungAusBuchung";
import {
  buchungenPaaren as buchungenPaarenUseCase,
  gegenbeinErzeugen as gegenbeinErzeugenUseCase,
  umbuchungsBeinBearbeiten as umbuchungsBeinBearbeitenUseCase,
} from "../application/buchung/umbuchungAusBuchung";
import { zuordnungVonHand as zuordnungVonHandUseCase, zuordnungZuruecksetzen as zuordnungZuruecksetzenUseCase } from "../application/vertraege/vertragszuordnung";
import { umbuchungErfassen as umbuchungErfassenUseCase } from "../application/buchung/umbuchungErfassen";
import { postenBezahltMarkieren, bezahltZuruecknehmen } from "../application/buchung/bezahltMarkieren";
import {
  buchungenLoeschen as buchungenLoeschenUseCase,
  buchungenSammelbearbeiten as buchungenSammelbearbeitenUseCase,
  type SammelAenderung,
} from "../application/buchung/buchungenSammelbearbeiten";
import type { IstBuchung, Zahlungsregel } from "../core";
import {
  vertragAktualisieren as vertragAktualisierenUseCase,
  vertragAnlegen as vertragAnlegenUseCase,
  vertragLoeschen as vertragLoeschenUseCase,
  type VertragEingabe,
} from "../application/vertraege/vertragAnlegen";
import { vorschlagIgnorieren as vertragsvorschlagIgnorierenUseCase } from "../application/vertraege/vertragsvorschlaege";
import { sqliteVertragRepository } from "./persistence/sqliteVertragRepository";
import {
  sqliteVertragserkennungRepository,
  vertragsAbgleichDeps,
} from "./persistence/sqliteVertragZuordnungRepositories";
import {
  inventarAktualisieren as inventarAktualisierenUseCase,
  inventarAnlegen as inventarAnlegenUseCase,
  inventarErsetzt as inventarErsetztUseCase,
  inventarLoeschen as inventarLoeschenUseCase,
  type InventarEingabe,
} from "../application/inventar/inventarAnlegen";
import {
  kategorieAnlegen as kategorieAnlegenUseCase,
  kontoAnlegen as kontoAnlegenUseCase,
  personAnlegen as personAnlegenUseCase,
  type KategorieEingabe,
  type KontoEingabe,
  type PersonEingabe,
} from "../application/stammdaten/stammdatenAnlegen";
import { standardkategorienAnlegen as standardkategorienUseCase } from "../application/kategorien/standardkategorien";
import type { Abrufadapter, Bankzugang, Zugangsart } from "../application/fints/abrufPort";
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

export function budgetBetragLoeschen(budgetId: string, abMonat: string): Promise<void> {
  return budgetBetragLoeschenUseCase(sqliteBudgetRepository, budgetId, abMonat);
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

/** Welche experimentellen Funktionen eingeschaltet sind. Ohne Zutun: alle aus. */
export function experimente(): Promise<Experimente> {
  return experimenteLaden(sqliteEinstellungenRepository);
}

export function experimentSetzen(id: ExperimentId, an: boolean): Promise<void> {
  return experimentSchalten(sqliteEinstellungenRepository, id, an);
}

/**
 * Liegt eine neuere Fassung bereit? `null` heißt „nein" — und ebenso „ging nicht" und
 * „ist abgeschaltet". Die Oberfläche behandelt alle drei gleich, absichtlich.
 */
export function aktualisierungSuchen(): Promise<Aktualisierung | null> {
  return aktualisierungPruefen(tauriAktualisierung, sqliteEinstellungenRepository);
}

/** Spielt die bereitliegende Fassung ein und startet neu. Kehrt im Erfolgsfall nie zurück. */
export function aktualisierungInstallieren(): Promise<void> {
  return aktualisierungEinspielen(tauriAktualisierung);
}

/** Ob beim Start nach Aktualisierungen gesucht wird. Ohne Zutun: ja. */
export async function aktualisierungspruefung(): Promise<boolean> {
  return pruefungErlaubt(await sqliteEinstellungenRepository.lesen());
}

export function aktualisierungspruefungSetzen(erlaubt: boolean): Promise<void> {
  return pruefungSchalten(sqliteEinstellungenRepository, erlaubt);
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


// --- Depots ----------------------------------------------------------------
//
// Ein einziger Port: Depots stehen für sich und rechnen gegen nichts anderes. Das ist der
// sichtbare Ausdruck davon, dass ein Depotwert weder ein Kontostand noch eine Buchung ist.

export function depots(): Promise<Depotdaten> {
  return depotsLaden({ depotRepo: sqliteDepotRepository });
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


// --- Verträge --------------------------------------------------------------

const VERTRAG_DEPS = {
  vertragRepo: sqliteVertragRepository,
  regelRepo: sqliteZahlungsregelRepository,
  personRepo: sqlitePersonRepository,
  kategorieRepo: sqliteKategorieRepository,
  erkennungRepo: sqliteVertragserkennungRepository,
  zuordnungRepo: sqliteVertragszuordnungRepository,
  ledger: sqliteLedgerRepository,
  umsatzRepo: sqliteUmsatzRepository,
  einstellungenRepo: sqliteEinstellungenRepository,
  abgleich: vertragsAbgleichDeps,
};

/** Die Verträge samt abgeleiteten Terminen, Zahlungen und Kennzahlen. */
export function vertraege(heute: string): Promise<Vertragssicht> {
  return vertraegeLaden(VERTRAG_DEPS, heute);
}

/** Die Zuordnungsseite, die beim Anlegen/Ändern eines Vertrags mitgezogen wird. */
const VERTRAG_ZUORDNUNG = {
  erkennungRepo: sqliteVertragserkennungRepository,
  zuordnungRepo: sqliteVertragszuordnungRepository,
};

export function vertragAnlegen(eingabe: VertragEingabe) {
  return vertragAnlegenUseCase(sqliteVertragRepository, sqliteZahlungsregelRepository, eingabe, VERTRAG_ZUORDNUNG);
}

export function vertragAktualisieren(id: string, eingabe: VertragEingabe) {
  return vertragAktualisierenUseCase(sqliteVertragRepository, sqliteZahlungsregelRepository, id, eingabe, VERTRAG_ZUORDNUNG);
}

export function vertragLoeschen(id: string) {
  return vertragLoeschenUseCase(sqliteVertragRepository, sqliteZahlungsregelRepository, id, VERTRAG_ZUORDNUNG);
}

export function vertragsvorschlagIgnorieren(schluessel: string) {
  return vertragsvorschlagIgnorierenUseCase(sqliteEinstellungenRepository, schluessel);
}

/** Erkennungen und Zuordnungen neu rechnen — nach jeder Änderung an einem Vertrag. */
export function vertragszuordnungenAbgleichen() {
  return zuordnungenAbgleichen(vertragsAbgleichDeps);
}

/** Alle Erkennungsregeln — je Vertrag eine. */
export function vertragserkennungen() {
  return sqliteVertragserkennungRepository.alle();
}

export function vertragserkennungSpeichern(regel: Parameters<typeof sqliteVertragserkennungRepository.speichern>[0]) {
  return sqliteVertragserkennungRepository.speichern(regel);
}

/**
 * Die Zahlungsspuren des ganzen Bestands: Buchung plus das, was am Umsatz hängt
 * (Empfänger, Gläubiger-ID). Grundlage jeder Erkennungsprobe.
 */
export function spuren() {
  return zahlungsspuren(sqliteLedgerRepository, sqliteUmsatzRepository);
}


// --- Import ----------------------------------------------------------------

/**
 * Die Kategorisierungs-Kette: Umbuchung → Festlegung → Vertrag → Modell.
 *
 * Einmal vor einem Lauf geladen, nicht je Zeile — der Bestand ändert sich währenddessen
 * nicht, und ein Import über tausende Zeilen soll nicht tausendmal dasselbe holen.
 */
export function kategorisierung() {
  return kategorisierungsquellen({
    kategorieRepo: sqliteKategorieRepository,
    festlegungRepo: sqliteKategoriefestlegungRepository,
    vertragRepo: sqliteVertragRepository,
    erkennungRepo: sqliteVertragserkennungRepository,
    klassifikatorRepo: sqliteKlassifikatorRepository,
    merkmalRepo: sqliteMerkmalskonfigurationRepository,
  });
}

/** Einen Dateiimport übernehmen — mit Dedup, Kategorie-Vorschlag und Review-Inbox. */
export async function importUebernehmen(auftrag: UebernahmeEingabe): Promise<UebernahmeErgebnis> {
  return umsaetzeUebernehmen(auftrag, {
    kontoRepo: sqliteZahlungskontoRepository,
    kategorieRepo: sqliteKategorieRepository,
    umsatzRepo: sqliteUmsatzRepository,
    laufRepo: sqliteImportLaufRepository,
    id: () => crypto.randomUUID(),
    kategorisierung: await kategorisierung(),
  });
}

export function offeneUmsaetze(): Promise<Umsatz[]> {
  return sqliteUmsatzRepository.offene();
}

export function umsatzSpeichern(u: Umsatz): Promise<void> {
  return sqliteUmsatzRepository.speichern(u);
}

export function importLaeufe() {
  return sqliteImportLaufRepository.alle();
}

/** „Immer bei diesem Empfänger" — setzen und sofort auf den offenen Stapel anwenden. */
export function festlegungAnwenden(
  muster: string,
  kategorie: Kategorie,
  offene: readonly Umsatz[],
  ausserId: string,
): Promise<number> {
  return festlegungAnwendenUseCase(
    { festlegungRepo: sqliteKategoriefestlegungRepository, umsatzRepo: sqliteUmsatzRepository },
    muster, kategorie, offene, ausserId,
  );
}

/** Offene Umsätze ins Ledger buchen und die frischen Zahlungen ihren Verträgen zuordnen. */
export async function umsaetzeBuchen(umsaetze: readonly Umsatz[]) {
  const ergebnis = await umsaetzeVerbuchen(umsaetze, {
    ledgerRepo: sqliteLedgerRepository,
    umsatzRepo: sqliteUmsatzRepository,
    id: () => crypto.randomUUID(),
  });
  // Bewusst HIER und nicht in `umsaetzeVerbuchen`: der Use-Case schreibt Fakten ins
  // Ledger, die Zuordnung ist eine Interpretation darüber.
  await zuordnungenAbgleichen(vertragsAbgleichDeps);
  return ergebnis;
}


// --- Bankabruf -------------------------------------------------------------

/**
 * Eine Banksitzung: abrufen, verbuchen, den Verträgen zuordnen.
 *
 * Die PIN wird durchgereicht und nirgends gespeichert — sie lebt im State des Dialogs
 * und ist mit dem Schließen weg.
 */
/**
 * Welcher Adapter diesen Zugang bedient.
 *
 * Die einzige Stelle, an der aus der Art eines Zugangs sein Abrufweg wird. Sie steht hier
 * und nicht in der Oberflaeche, weil sonst jeder Aufrufer die Zuordnung selbst kennen
 * muesste — und der naechste sie anders traefe.
 *
 * Ein unbekannter Wert kann hier nicht ankommen: `Zugangsart` ist eine geschlossene
 * Aufzaehlung, und das Repository faengt ab, was in der Spalte sonst noch stehen koennte.
 */
export function abrufAdapterFuer(art: Zugangsart): Abrufadapter {
  return art === "hanseatic" ? hanseaticAbruf : fintsAbruf;
}

export async function bankAbrufen(
  zugang: Bankzugang,
  pin: string,
  // Der Typ aus dem Port, nicht eine eigene Schreibweise davon: die hier ausgeschriebene
  // Ein-Parameter-Fassung nahm den Aufrufern still den zweiten weg (das Rückzugssignal
  // bei decoupled), und der Adapter reichte ihn dann ins Leere.
  frageTan: TanFrager,
  heute: string,
  rueckgriffTage?: number,
): Promise<Abrufergebnis> {
  return abrufAusfuehren(zugang, pin, frageTan, {
    adapter: abrufAdapterFuer(zugang.art),
    zugangRepo: sqliteBankzugangRepository,
    zuordnungRepo: sqliteKontozuordnungRepository,
    kontoRepo: sqliteZahlungskontoRepository,
    kategorieRepo: sqliteKategorieRepository,
    ledgerRepo: sqliteLedgerRepository,
    ankerRepo: sqliteKontostandsankerRepository,
    // Depots werden mitgeholt: sie hängen an keiner Kontozuordnung, weil sie keine Konten
    // sind — jedes, das die Bank freigibt, kommt als Beobachtung in die Wertreihe.
    depotRepo: sqliteDepotRepository,
    umsatzRepo: sqliteUmsatzRepository,
    laufRepo: sqliteImportLaufRepository,
    // Der Abruf hängt die frisch gebuchten Zeilen selbst an ihre Verträge. Ohne das
    // zählte jede abgerufene Vertragsrate gegen das Budget ihrer Kategorie, bis jemand
    // zufällig einen Verträge-Screen öffnet.
    erkennungRepo: sqliteVertragserkennungRepository,
    vertragszuordnungRepo: sqliteVertragszuordnungRepository,
    id: () => crypto.randomUUID(),
    // Dieselbe Kette wie beim Dateiimport: Umbuchung → Festlegung → Vertrag → Modell.
    kategorisierung: await kategorisierung(),
    heute,
    rueckgriffTage,
  });
}


// --- Training und Kategorisierungs-Kette -----------------------------------
//
// Hier stehen keine neuen Regeln, nur die Verdrahtung: die Use-Cases gab es schon, der
// Bereich „Training" hat sie sich bisher nur selbst zusammengesteckt (acht Repositories
// in einer Datei).

/** Alle Quellen der Kategorisierungs-Kette — dieselben wie beim Import. */
const KETTE = {
  kategorieRepo: sqliteKategorieRepository,
  festlegungRepo: sqliteKategoriefestlegungRepository,
  vertragRepo: sqliteVertragRepository,
  erkennungRepo: sqliteVertragserkennungRepository,
  klassifikatorRepo: sqliteKlassifikatorRepository,
  merkmalRepo: sqliteMerkmalskonfigurationRepository,
};

const MODELL_DEPS = {
  ledger: sqliteLedgerRepository,
  umsatzRepo: sqliteUmsatzRepository,
  klassifikatorRepo: sqliteKlassifikatorRepository,
};

export function merkmalskonfiguration() {
  return konfigurationLaden(sqliteMerkmalskonfigurationRepository);
}

export function trainingsdaten(konfiguration: Merkmalskonfiguration): Promise<Materialbefund> {
  return trainingsmaterial(sqliteLedgerRepository, sqliteUmsatzRepository, konfiguration);
}

export function modellStand(konfiguration: Merkmalskonfiguration): Promise<Modellzustand> {
  return modellzustand({ ...MODELL_DEPS, konfiguration });
}

export function modellTrainieren(konfiguration: Merkmalskonfiguration) {
  return klassifikatorTrainieren({
    ...MODELL_DEPS,
    konfiguration,
    jetzt: () => new Date().toISOString(),
  });
}

export function merkmalswirkung(konfiguration: Merkmalskonfiguration) {
  return wirkungMessen({
    ledger: sqliteLedgerRepository,
    umsatzRepo: sqliteUmsatzRepository,
    konfiguration,
  });
}

export function herkunftUmschalten(h: Merkmalsherkunft, aktiv: boolean) {
  return herkunftSchalten(sqliteMerkmalskonfigurationRepository, h, aktiv);
}

export function wortSperren(wort: string, herkuenfte?: readonly Merkmalsherkunft[]) {
  return wortAusschliessen(sqliteMerkmalskonfigurationRepository, wort, herkuenfte);
}

export function wortFreigeben(wort: string) {
  return wortZulassen(sqliteMerkmalskonfigurationRepository, wort);
}

export function kategorieAbgleichVorschau(): Promise<Abgleichsplan> {
  return abgleichVorschau(sqliteLedgerRepository, sqliteUmsatzRepository, KETTE);
}

export function kategorieAbgleichAnwenden(plan: Abgleichsplan) {
  return planAnwenden(sqliteLedgerRepository, plan);
}

// --- Kategorie-Festlegungen ------------------------------------------------

export function festlegungen() {
  return sqliteKategoriefestlegungRepository.alle();
}

export function festlegungSpeichern(muster: string, kategorieId: string) {
  return festlegungSetzen(sqliteKategoriefestlegungRepository, muster, kategorieId);
}

export function festlegungEntfernen(muster: string) {
  return festlegungAufheben(sqliteKategoriefestlegungRepository, muster);
}

/** Was das Modell an EINER Buchung sieht — die Antwort auf „warum diese Kategorie?". */
export function merkmaleZuBuchung(
  quelle: { gegenpartei: string; verwendungszweck: string; glaeubigerId?: string; betrag: number },
): Promise<Merkmalsansicht> {
  return merkmalsansicht(
    {
      ledger: sqliteLedgerRepository,
      umsatzRepo: sqliteUmsatzRepository,
      klassifikatorRepo: sqliteKlassifikatorRepository,
      merkmalRepo: sqliteMerkmalskonfigurationRepository,
    },
    quelle,
  );
}


// --- Konten ----------------------------------------------------------------

/** Kontoliste und Registergrundlage — einmal geladen, danach rein gerechnet. */
export function konten(): Promise<Kontensicht> {
  return kontenLaden({
    kontoRepo: sqliteZahlungskontoRepository,
    ledger: sqliteLedgerRepository,
    regelRepo: sqliteZahlungsregelRepository,
    kategorieRepo: sqliteKategorieRepository,
    umsatzRepo: sqliteUmsatzRepository,
    laufRepo: sqliteImportLaufRepository,
    freigabeRepo: sqliteDublettenfreigabeRepository,
    ankerRepo: sqliteKontostandsankerRepository,
    kontozuordnungen: () => sqliteKontozuordnungRepository.alle(),
    // Damit ein Depot-Konto seinen Bestand zeigt statt einer leeren Buchungsliste.
    depotRepo: sqliteDepotRepository,
  });
}

const ANKER_DEPS = {
  kontoRepo: sqliteZahlungskontoRepository,
  ledger: sqliteLedgerRepository,
  ankerRepo: sqliteKontostandsankerRepository,
};

/** Kassensturz: den Stand eines Kontos zu einem Stichtag festhalten. */
export function kontostandFesthalten(eingabe: { kontoId: string; datum: string; betrag: number }) {
  return kontostandFesthaltenUseCase(ANKER_DEPS, eingabe);
}

/** Den Anfangsbestand einmalig auf den jüngsten Anker ausrichten. */
export function anfangsbestandAbgleichen(kontoId: string) {
  return anfangsbestandAbgleichenUseCase(ANKER_DEPS, kontoId);
}

/** „Diese beiden sind NICHT dasselbe" — und der Weg zurück. */
export function dublettenFreigeben(umsatzA: string, umsatzB: string) {
  return dublettenFreigebenUseCase(sqliteDublettenfreigabeRepository, umsatzA, umsatzB);
}

export function dublettenFreigabeAufheben(umsatzA: string, umsatzB: string) {
  return dublettenFreigabeAufhebenUseCase(sqliteDublettenfreigabeRepository, umsatzA, umsatzB);
}

export function umbuchungErfassen(eingabe: Parameters<typeof umbuchungErfassenUseCase>[1]) {
  return umbuchungErfassenUseCase(sqliteLedgerRepository, eingabe);
}

export function alsBezahltMarkieren(regel: Zahlungsregel, faelligkeit: string, kontoId: string) {
  return postenBezahltMarkieren(sqliteLedgerRepository, { regel, faelligkeit, kontoId });
}

export function bezahltZurueck(quelleId: string, faelligkeit: string) {
  return bezahltZuruecknehmen(sqliteLedgerRepository, quelleId, faelligkeit);
}

export function buchungenSammelbearbeiten(
  buchungen: readonly IstBuchung[],
  aenderung: SammelAenderung,
  kategorien: readonly Kategorie[],
) {
  return buchungenSammelbearbeitenUseCase(sqliteLedgerRepository, buchungen, aenderung, kategorien);
}

export function buchungenLoeschen(
  buchungen: readonly IstBuchung[],
  gesperrteIds: ReadonlySet<string>,
) {
  return buchungenLoeschenUseCase(
    sqliteLedgerRepository, buchungen, gesperrteIds, sqliteUmsatzRepository,
  );
}


// --- Buchungsdialog --------------------------------------------------------

/** Alles, was der Dialog LESEND braucht — Herkunft, Gegenbein, Vertrag, Auswahl. */
/**
 * Der Kontoabgleich — unsere Rechnung gegen die Meldungen von Bank und Kassensturz.
 *
 * Eigener Dienst statt eines Ausschnitts aus `konten()`: die Kontensicht lädt Umsätze,
 * Regeln, Kategorien und Dublettenurteile mit, weil ein Register das alles braucht. Der
 * Abgleich braucht davon nichts.
 */
export function abgleich() {
  return abgleichLadenUseCase({
    kontoRepo: sqliteZahlungskontoRepository,
    ledger: sqliteLedgerRepository,
    ankerRepo: sqliteKontostandsankerRepository,
    kontozuordnungen: () => sqliteKontozuordnungRepository.alle(),
  });
}

/** Woher die Zeilen eines Kontos kommen — Läufe und Rohdaten, auch die weggelegten. */
export function herkunft() {
  return herkunftLadenUseCase({
    kontoRepo: sqliteZahlungskontoRepository,
    umsatzRepo: sqliteUmsatzRepository,
    laufRepo: sqliteImportLaufRepository,
    ledger: sqliteLedgerRepository,
  });
}

export function buchungsdetail(): Promise<Buchungsdetaildaten> {
  return buchungsdetailLaden({
    kontoRepo: sqliteZahlungskontoRepository,
    kategorieRepo: sqliteKategorieRepository,
    regelRepo: sqliteZahlungsregelRepository,
    umsatzRepo: sqliteUmsatzRepository,
    laufRepo: sqliteImportLaufRepository,
    ledger: sqliteLedgerRepository,
    vertragRepo: sqliteVertragRepository,
    zuordnungRepo: sqliteVertragszuordnungRepository,
    freigabeRepo: sqliteDublettenfreigabeRepository,
    kontozuordnungen: () => sqliteKontozuordnungRepository.alle(),
  });
}

export function buchungErfassen(eingabe: BuchungEingabe) {
  return buchungErfassenUseCase(sqliteLedgerRepository, eingabe);
}

export function buchungBearbeiten(buchung: IstBuchung, eingabe: Parameters<typeof buchungBearbeitenUseCase>[2]) {
  return buchungBearbeitenUseCase(sqliteLedgerRepository, buchung, eingabe);
}

export function buchungLoeschen(id: string) {
  return buchungLoeschenUseCase(sqliteLedgerRepository, id);
}

/** Setzt den „noch ansehen"-Marker einer Buchung oder nimmt ihn weg. */
export function pruefmarkerSetzen(istbuchungId: string, vorgemerkt: boolean) {
  return pruefmarkerSetzenUseCase(sqliteLedgerRepository, istbuchungId, vorgemerkt);
}

export function umbuchungLoeschen(transferId: string) {
  return umbuchungLoeschenUseCase(sqliteLedgerRepository, transferId);
}

/**
 * Verwirft eine Bankzeile: Buchung raus, Umsatz auf „verworfen" — der nächste Abruf holt
 * sie damit nicht zurück. Der Gegenweg zum Löschen einer Datei-Zeile.
 */
export function bankzeileVerwerfen(istbuchungId: string) {
  return bankzeileVerwerfenUseCase(
    { ledger: sqliteLedgerRepository, umsatzRepo: sqliteUmsatzRepository },
    istbuchungId,
  );
}

export function buchungSplitten(buchung: IstBuchung, teile: Parameters<typeof buchungSplittenUseCase>[2]) {
  return buchungSplittenUseCase(sqliteLedgerRepository, buchung, teile);
}

export function splitAufheben(buchung: IstBuchung) {
  return splitAufhebenUseCase(sqliteLedgerRepository, buchung);
}

export function buchungenPaaren(a: IstBuchung, b: IstBuchung) {
  return buchungenPaarenUseCase(sqliteLedgerRepository, a, b);
}

export async function gegenbeinErzeugen(buchung: IstBuchung, kontoId: string) {
  // Die Online-Konten werden hier frisch geholt und nicht vom Aufrufer mitgegeben: der
  // Dialog kann seit Minuten offen sein, und eine inzwischen angelegte Bankverbindung
  // soll sofort greifen.
  const zuordnungen = await sqliteKontozuordnungRepository.alle();
  return gegenbeinErzeugenUseCase(
    sqliteLedgerRepository,
    buchung,
    kontoId,
    new Set(zuordnungen.map((z) => z.zahlungskontoId)),
  );
}

export function umbuchungsBeinBearbeiten(buchung: IstBuchung, eingabe: Parameters<typeof umbuchungsBeinBearbeitenUseCase>[2]) {
  return umbuchungsBeinBearbeitenUseCase(sqliteLedgerRepository, buchung, eingabe);
}

export function vertragZuordnenVonHand(istbuchungId: string, vertragId: string | null) {
  return zuordnungVonHandUseCase(sqliteVertragszuordnungRepository, istbuchungId, vertragId);
}

export function vertragZuordnungZuruecksetzen(istbuchungId: string) {
  return zuordnungZuruecksetzenUseCase(sqliteVertragszuordnungRepository, istbuchungId);
}

export function paarungLoesen(transferId: string) {
  return paarungLoesenUseCase(sqliteLedgerRepository, transferId);
}
