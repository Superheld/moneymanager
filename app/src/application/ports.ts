// Ports — Schnittstellen zwischen Anwendungsschicht und Außenwelt (hexagonal).
// Adapter (z. B. SQLite) implementieren sie; der Kern kennt sie nicht.

import type {
  Kategorie,
  Person,
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
