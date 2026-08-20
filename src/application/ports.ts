// Ports — Schnittstellen zwischen Anwendungsschicht und Außenwelt (hexagonal).
// Adapter (z. B. SQLite) implementieren sie; der Kern kennt sie nicht.

import type {
  Budget,
  Depot,
  Depotposition,
  Depotwert,
  Inventargegenstand,
  IstBuchung,
  Kategorie,
  Kategoriefestlegung,
  Merkmalsausschluss,
  Merkmalsherkunft,
  Modell,
  Person,
  Vertrag,
  Vertragserkennung,
  Vertragszuordnung,
  Zahlungskonto,
  Zahlungsregel,
  Ankerherkunft,
  Kontostandsanker,
} from "../core";
import type { ImportLauf, Umsatz } from "./import";
import type { Dublettenfreigabe } from "./dubletten/dublettensicht";

export interface ZahlungsregelRepository {
  alle(): Promise<Zahlungsregel[]>;
  speichern(regel: Zahlungsregel): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface PersonRepository {
  alle(): Promise<Person[]>;
  speichern(person: Person): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface ZahlungskontoRepository {
  alle(): Promise<Zahlungskonto[]>;
  speichern(konto: Zahlungskonto): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface KategorieRepository {
  alle(): Promise<Kategorie[]>;
  speichern(kategorie: Kategorie): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface VertragRepository {
  alle(): Promise<Vertrag[]>;
  speichern(vertrag: Vertrag): Promise<void>;
  loeschen(id: string): Promise<void>;
}

/**
 * Die Erkennungsregeln der Verträge — woran ihre Zahlungen zu erkennen sind.
 * Getrennt vom Vertrag wie die Zahlungsregel: der Vertrag beschreibt Konditionen,
 * die Erkennung beschreibt Zuordnungspolitik (siehe core/vertragZuordnung).
 */
export interface VertragserkennungRepository {
  alle(): Promise<Vertragserkennung[]>;
  speichern(erkennung: Vertragserkennung): Promise<void>;
  loeschen(vertragId: string): Promise<void>;
}

/**
 * Welche Buchung zu welchem Vertrag gehört — samt Herkunft, damit ein Abgleich die
 * Handarbeit nicht überschreibt. `loeschen` gibt eine Buchung wieder an die Automatik
 * zurück; das ist der Rückweg aus einer manuellen Entscheidung.
 */
export interface VertragszuordnungRepository {
  alle(): Promise<Vertragszuordnung[]>;
  speichern(zuordnung: Vertragszuordnung): Promise<void>;
  loeschen(istbuchungId: string): Promise<void>;
}

/**
 * Die Kategorie-Festlegungen — „immer bei diesem Empfänger". Der Schlüssel ist das
 * Muster: ein zweites Festlegen auf denselben Text ersetzt die alte Aussage, statt eine
 * zweite danebenzustellen.
 */
export interface KategoriefestlegungRepository {
  alle(): Promise<Kategoriefestlegung[]>;
  speichern(festlegung: Kategoriefestlegung): Promise<void>;
  loeschen(muster: string): Promise<void>;
}

export interface BudgetRepository {
  alle(): Promise<Budget[]>;
  speichern(budget: Budget): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface InventarRepository {
  alle(): Promise<Inventargegenstand[]>;
  speichern(gegenstand: Inventargegenstand): Promise<void>;
  loeschen(id: string): Promise<void>;
}

/**
 * Ledger-Port (ADR-0002) — Zugang zum app-seitigen Ist-Journal. Hinter DIESEM Port
 * docken später das echte Buchungspackage und der Bankimport an (austauschbar).
 */
export interface LedgerPort {
  alle(): Promise<IstBuchung[]>;
  speichern(buchung: IstBuchung): Promise<void>;
  loeschen(id: string): Promise<void>;
}

/**
 * Haushalts-Einstellungen (ADR-0004) — Key/Value, eine Zeile je Schlüssel. Bewusst
 * generisch (Währung, Locale, Sprache und künftige Schalter ohne neue Migration).
 */
export interface EinstellungenRepository {
  /** Alle Schlüssel→Wert; fehlende Schlüssel bedeuten „noch nicht gesetzt". */
  lesen(): Promise<Record<string, string>>;
  schreiben(schluessel: string, wert: string): Promise<void>;
}

/**
 * Das gespeicherte Modell samt der Angaben, die es einordnen — wann es entstand, aus wie
 * vielen Beispielen, und wie gut es an ungesehenen Zeilen abschnitt. Ohne diese drei ist
 * eine Genauigkeit eine Zahl ohne Grundlage.
 */
export interface Modellstand {
  readonly modell: Modell;
  /** ISO-Zeitpunkt des Trainings. */
  readonly trainiertAm: string;
  /** Genauigkeit an der Prüfmenge (0…1); fehlt, wenn zu wenig Material für einen Split war. */
  readonly genauigkeit?: number;
}

/**
 * Der Klassifikator der automatischen Kategorisierung. Genau EIN aktuelles Modell —
 * `speichern` ersetzt es. Eine Historie gäbe es nur, um alte Stände aufzuheben, die aus
 * dem Bestand in Millisekunden neu entstehen.
 */
export interface KlassifikatorRepository {
  /** Der gespeicherte Stand, oder null, wenn noch nie trainiert wurde. */
  laden(): Promise<Modellstand | null>;
  speichern(stand: Modellstand): Promise<void>;
}

/**
 * Ein Ausschluss samt seiner Herkunft im Sinne von „wer hat ihn gesetzt".
 * `standard` kam mit der App, `manuell` hat jemand entschieden — nur so lässt sich die
 * eigene Pflege von der Grundausstattung trennen.
 */
export interface GespeicherterAusschluss extends Merkmalsausschluss {
  readonly quelle: "standard" | "manuell";
}

/**
 * Was ins Training geht: die aktiven Merkmalsherkünfte und die Ausschlussliste.
 *
 * Getrennte Operationen für Schalter und Liste, weil sie sich verschieden verhalten —
 * die fünf Schalter entscheidet man einmal, die Liste wächst über Jahre am Einzelfall.
 */
export interface MerkmalskonfigurationRepository {
  /** Aktive Herkünfte; null, solange nie etwas gesetzt wurde (dann gilt der Standard). */
  herkuenfteLesen(): Promise<Merkmalsherkunft[] | null>;
  herkuenfteSetzen(herkuenfte: readonly Merkmalsherkunft[]): Promise<void>;
  ausschluesseLesen(): Promise<GespeicherterAusschluss[]>;
  ausschlussSetzen(a: GespeicherterAusschluss): Promise<void>;
  ausschlussEntfernen(wort: string): Promise<void>;
}

/**
 * Import-Repositories (TAKTIK-IMPORT §5). Der Entwurfs-Stapel: Umsätze überleben den
 * Lauf, werden in der Review-Inbox bearbeitet und erst beim Verbuchen zu Ist-Buchungen.
 */
export interface ImportLaufRepository {
  alle(): Promise<ImportLauf[]>;
  speichern(lauf: ImportLauf): Promise<void>;
  loeschen(id: string): Promise<void>;
}

/**
 * Kontostands-Anker: was an einem Stichtag wirklich auf dem Konto lag.
 *
 * Sie werden AUFGEHOBEN, nicht überschrieben — ein einzelner Anker sagt „hier fehlen 600
 * Euro", zwei sagen „zwischen dem 31.07. und dem 31.08.". Das ist der Unterschied
 * zwischen einer Zahl und einer brauchbaren Auskunft.
 */
export interface KontostandsankerRepository {
  alle(): Promise<Kontostandsanker[]>;
  speichern(anker: Kontostandsanker): Promise<void>;
  entfernen(kontoId: string, datum: string, herkunft: Ankerherkunft): Promise<void>;
}

/**
 * Depots und ihre Wertreihe.
 *
 * Ein Port und nicht drei, weil die drei Tabellen immer zusammen gelesen und geschrieben
 * werden: ein Abruf liefert Depot, Stichtagswert und Positionen in einem Stück, und eine
 * Wertreihe ohne ihr Depot ist nichts.
 *
 * `positionenErsetzen` heisst so, wie es sich verhält: die Positionen eines Stichtags
 * werden vollständig ersetzt, nicht ergänzt. Ein zweiter Abruf desselben Tages liefert
 * dieselbe Aufstellung, und eine Position, die dabei verschwindet, ist verkauft — sie
 * stehen zu lassen ergäbe ein Depot, das nur wächst.
 */
export interface DepotRepository {
  alle(): Promise<Depot[]>;
  speichern(depot: Depot): Promise<void>;
  loeschen(id: string): Promise<void>;
  /** Alle Stichtagswerte, optional auf ein Depot eingegrenzt. */
  werte(depotId?: string): Promise<Depotwert[]>;
  wertSpeichern(wert: Depotwert, erfasstAm: string): Promise<void>;
  positionen(depotId: string, stichtag?: string): Promise<Depotposition[]>;
  positionenErsetzen(
    depotId: string,
    stichtag: string,
    positionen: readonly Depotposition[],
  ): Promise<void>;
}

/**
 * Die von Hand gesetzten Entscheidungen „diese beiden sind NICHT dasselbe".
 *
 * Bewusst ein eigener Port und keine Spalte am Umsatz: festgehalten wird das PAAR. Dass A
 * nicht dasselbe ist wie B, sagt nichts darüber, ob A dasselbe ist wie C.
 */
export interface DublettenfreigabeRepository {
  alle(): Promise<Dublettenfreigabe[]>;
  speichern(freigabe: Dublettenfreigabe): Promise<void>;
  /** Nimmt eine Freigabe zurück — die Reihenfolge der beiden IDs ist egal. */
  entfernen(umsatzA: string, umsatzB: string): Promise<void>;
}

export interface UmsatzRepository {
  speichern(umsatz: Umsatz): Promise<void>;
  speichernViele(umsaetze: readonly Umsatz[]): Promise<void>;
  /** Alle Umsätze (inkl. verbuchte) — z. B. für Detail-Join über istbuchungId. */
  alle(): Promise<Umsatz[]>;
  /** Umsätze eines Laufs. */
  nachLauf(laufId: string): Promise<Umsatz[]>;
  /** Noch nicht verbuchte/verworfene Umsätze — die Review-Inbox. */
  offene(): Promise<Umsatz[]>;
  loeschen(id: string): Promise<void>;
  /**
   * Vorhandene Dedup-Schlüssel (für die Duplikaterkennung beim nächsten Import).
   * `hashesOhneId` enthält nur die Hashes der Bestandszeilen OHNE native ID — gegen sie
   * darf auch ein Kandidat MIT ID über den Hash geprüft werden, ohne dass zwei echte
   * Buchungen derselben Quelle fälschlich zusammenfallen (siehe rohHash.ts).
   */
  bestandsSchluessel(): Promise<{
    hashes: string[];
    nativeIds: string[];
    hashesOhneId?: string[];
  }>;
}
