// Abruf-Port — der ZWEITE Port neben `quellenAdapter`, nicht dessen Erweiterung.
//
// Der Quellen-Port ist datei-basiert und synchron: `erkennt(bytes)` / `lies(bytes)`.
// Ein Bankabruf ist das Gegenteil — eine asynchrone, zustandsbehaftete Sitzung mit
// Zugangsdaten, einer Rückfrage an den Nutzer (TAN) und Bankparametern (BPD/UPD), die
// zwischen Sitzungen aufbewahrt werden müssen. Das in `Quellenadapter` zu pressen hieße,
// beide Seiten zu verbiegen.
//
// Der Konvergenzpunkt ist deshalb nicht der Port, sondern `RohUmsatz`/`ImportErgebnis`:
//
//   Quellenadapter (Datei: Finanzguru, später CAMT/MT940-Datei) ─┐
//   Abrufadapter   (FinTS)                                      ─┼→ ImportErgebnis → alles Bestehende
//   Abrufadapter   (PSD2, falls je nötig)                       ─┘
//
// Ab `ImportErgebnis` gilt unverändert, was schon steht: Dedup über `rohHash`,
// Konto-Match, Kategorie-Vorschlag, Review-Inbox.
//
// Diese Datei kennt weder `lib-fints` noch Tauri — nur die Fachbegriffe. Die Bibliothek
// steht ausschließlich im Adapter (`adapters/fints/`).

import type { Cent } from "../../core";
import type { ImportErgebnis } from "../import";

/**
 * Ein hinterlegter Bankzugang. Die PIN steht bewusst NICHT darin: sie lebt nur in der
 * Sitzung, wird als Parameter durchgereicht und nirgends gespeichert.
 *
 * `bankparameter` ist das serialisierte `BankingInformation`-Objekt der Bibliothek
 * (BPD/UPD + systemId). Ohne diese Aufbewahrung synchronisiert jeder Abruf neu — zwei
 * zusätzliche Dialogrunden und im ungünstigen Fall eine TAN mehr.
 */
export interface Bankzugang {
  readonly id: string;
  /** Anzeigename der Bank, wie sie sich selbst nennt. */
  readonly bezeichnung: string;
  /** FinTS-PIN/TAN-Endpunkt der Bank. */
  readonly url: string;
  /** Bankleitzahl. */
  readonly blz: string;
  /** Anmeldename — bei manchen Banken die Zugangsnummer, NICHT die Kontonummer. */
  readonly benutzer: string;
  /** Nur setzen, wenn die Bank eine abweichende Kunden-ID verlangt. */
  readonly kundenId?: string;
  /** Serialisierte Bankparameter der letzten Sitzung (BPD/UPD). */
  readonly bankparameter?: string;
  /** Zuletzt gewähltes TAN-Verfahren (Bank-interne ID). */
  readonly tanVerfahrenId?: number;
  /** Zuletzt gewähltes TAN-Medium (Name laut Bank). */
  readonly tanMedium?: string;
}

/**
 * Ein Konto, wie die BANK es meldet — noch kein `Zahlungskonto` der App.
 *
 * Der Schlüssel ist `nummer` + `unterkonto`, nie die Nummer allein: manche Institute senden für
 * Girokonto und Depot dieselbe Kontonummer und unterscheidet über das Unterkontomerkmal,
 * in dem der Produktname steht. Wer nur über die Nummer adressiert, bekommt still das
 * erste passende Konto — im Spike sichtbar an einem „Depot-Saldo", der der Girokonto-Saldo
 * war.
 */
export interface Bankkonto {
  readonly nummer: string;
  readonly unterkonto?: string;
  /** Eindeutiger Schlüssel: Nummer UND Unterkontomerkmal. */
  readonly schluessel: string;
  readonly iban?: string;
  /** Sprechende Bezeichnung — aus `product`, nicht aus `accountType` (der ist oft leer). */
  readonly bezeichnung: string;
  readonly waehrung?: string;
  readonly inhaber?: string;
  /** Fähigkeitsmatrix, wie die Bank sie je Konto meldet. */
  readonly kannSaldo: boolean;
  readonly kannUmsaetze: boolean;
  /**
   * false, wenn die Kontonummer mehrfach vorkommt: die Bibliothek adressiert allein über
   * die Nummer und träfe damit möglicherweise das falsche Konto. Solche Konten werden
   * BENANNT, nicht stillschweigend abgerufen und nicht verschwiegen.
   */
  readonly adressierbar: boolean;
  /** Klartext, warum ein Konto nicht adressierbar oder eingeschränkt ist. */
  readonly hinweis?: string;
}

/** Rückfrage der Bank nach einer TAN. Das Bild kommt bei photoTAN inline mit. */
export interface TanHerausforderung {
  readonly text?: string;
  readonly bild?: { readonly mimeType: string; readonly daten: Uint8Array };
  /** true = Freigabe geschieht in der Banking-App, es wird KEINE TAN eingetippt. */
  readonly decoupled: boolean;
}

/**
 * Holt die TAN beim Nutzer. `undefined` heißt „abgebrochen"; bei decoupled wird die
 * Funktion gar nicht nach einer Eingabe gefragt, sondern nur zur Anzeige gerufen.
 */
export type TanFrager = (h: TanHerausforderung) => Promise<string | undefined>;

export interface Saldo {
  readonly betrag: Cent;
  readonly datum: string;
  readonly waehrung: string;
}

/** Ergebnis eines Umsatzabrufs: das kanonische Import-Ergebnis plus, was die Bank dazu sagte. */
export interface AbrufErgebnis {
  readonly ergebnis: ImportErgebnis;
  /** „MT940" oder „CAMT" — was die Bank tatsächlich geliefert hat, nicht was gewünscht war. */
  readonly format: string;
  readonly hinweise: readonly string[];
}

/**
 * Eine offene Sitzung. Lebt nur im Speicher; die PIN darin wird nicht weitergereicht.
 */
export interface Abrufsitzung {
  readonly konten: readonly Bankkonto[];
  /** Serialisierte Bankparameter — nach JEDER Antwort neu holen und speichern. */
  bankparameter(): string;
  /** Rückmeldungen der Bank im Klartext (Code + Text), auch die harmlosen. */
  readonly hinweise: readonly string[];
  /** Nachrichten der Bank an den Nutzer (Postfach-Hinweise o. Ä.). */
  readonly bankNachrichten: readonly string[];
  /** Name des benutzten TAN-Verfahrens, für die Anzeige. */
  readonly tanVerfahren?: string;
  /** Wie weit die Bank Umsätze überhaupt vorhält (Tage) — von ihr selbst gemeldet. */
  readonly speicherzeitraumTage?: number;
  saldo(konto: Bankkonto): Promise<Saldo | null>;
  umsaetze(konto: Bankkonto, vonIso: string, bisIso: string): Promise<AbrufErgebnis>;
}

export interface Abrufadapter {
  /** Stabiler technischer Schlüssel, z. B. „fints". */
  readonly id: string;
  readonly name: string;
  /**
   * Meldet sich an und liefert die Kontenliste. Die PIN wird nur durchgereicht, nie
   * gespeichert. `frageTan` wird gerufen, wenn die Bank eine Freigabe verlangt — beim
   * Lesen ist das die Ausnahme (PSD2), nicht der Normalfall.
   */
  anmelden(zugang: Bankzugang, pin: string, frageTan: TanFrager): Promise<Abrufsitzung>;
}
