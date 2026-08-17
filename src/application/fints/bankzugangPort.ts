// Ports rund um den Bankzugang. Getrennt von `ports.ts` gehalten, weil sie zum
// Abruf-Kontext gehören und nicht zum Bestand der App.

import type { Bankzugang } from "./abrufPort";

/**
 * Aufbewahrung der hinterlegten Zugänge — OHNE PIN. Die ist bewusst nicht Teil von
 * `Bankzugang` und hat damit auch keinen Weg hierher.
 */
export interface BankzugangRepository {
  alle(): Promise<Bankzugang[]>;
  speichern(zugang: Bankzugang): Promise<void>;
  loeschen(id: string): Promise<void>;
}

/** Ein Bankkonto der Bank ist einem Zahlungskonto der App zugeordnet. */
export interface Kontozuordnung {
  readonly zugangId: string;
  /** `kontonummer|unterkontomerkmal` — nie die Kontonummer allein. */
  readonly schluessel: string;
  readonly zahlungskontoId: string;
  /** Bis wohin zuletzt abgerufen wurde (ISO-Datum) — Grundlage des fortlaufenden Abrufs. */
  readonly letzterAbrufBis?: string;
}

export interface KontozuordnungRepository {
  nachZugang(zugangId: string): Promise<Kontozuordnung[]>;
  speichern(zuordnung: Kontozuordnung): Promise<void>;
  loeschen(zugangId: string, schluessel: string): Promise<void>;
}
