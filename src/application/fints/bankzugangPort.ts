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
  /**
   * Welches Umsatzformat für dieses Konto zuletzt getragen hat („CAMT" oder „MT940").
   *
   * Wir fragen CAMT zuerst und fallen bei leerem Ergebnis auf MT940 zurück. Wo der
   * Rückfall schon einmal nötig war, ist die erste Runde beim nächsten Mal absehbar
   * vergeblich — der Vermerk spart sie. Er ist ein Gedächtnis, keine Festlegung: das
   * Profil kann sich ändern, und ein Abruf darf ihn jederzeit überschreiben.
   */
  readonly letztesFormat?: string;
  // Der gemeldete Kontostand stand bis 2026-08-20 hier und wurde bei jedem Abruf
  // überschrieben. Er ist jetzt ein Kontostands-Anker (`core/kontostand.ts`): aufgehoben
  // statt überschrieben, damit sich eine Abweichung zeitlich einkreisen lässt.
}

export interface KontozuordnungRepository {
  /** Alle Zuordnungen — Grundlage der Frage „ist dieses Konto online?". */
  alle(): Promise<Kontozuordnung[]>;
  nachZugang(zugangId: string): Promise<Kontozuordnung[]>;
  speichern(zuordnung: Kontozuordnung): Promise<void>;
  loeschen(zugangId: string, schluessel: string): Promise<void>;
}
