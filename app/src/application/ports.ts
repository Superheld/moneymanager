// Ports — Schnittstellen zwischen Anwendungsschicht und Außenwelt (hexagonal).
// Adapter (z. B. SQLite) implementieren sie; der Kern kennt sie nicht.

import type {
  Budget,
  Inventargegenstand,
  IstBuchung,
  Kategorie,
  Person,
  Szenario,
  Topf,
  Vertrag,
  Zahlungskonto,
  Zahlungsregel,
} from "../core";

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

export interface BudgetRepository {
  alle(): Promise<Budget[]>;
  speichern(budget: Budget): Promise<void>;
  loeschen(id: string): Promise<void>;
}

export interface TopfRepository {
  alle(): Promise<Topf[]>;
  speichern(topf: Topf): Promise<void>;
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

export interface SzenarioRepository {
  alle(): Promise<Szenario[]>;
  speichern(szenario: Szenario): Promise<void>;
  loeschen(id: string): Promise<void>;
  /** Zusatzposten (Zahlungsregeln) eines Szenarios — physisch getrennt vom Plan. */
  posten(szenarioId: string): Promise<Zahlungsregel[]>;
  postenSpeichern(szenarioId: string, posten: Zahlungsregel): Promise<void>;
  postenLoeschen(postenId: string): Promise<void>;
}
