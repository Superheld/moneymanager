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
  /**
   * Das zuletzt erhobene Bankfähigkeitsprofil, serialisiert.
   *
   * Abgeleitet aus denselben Bankparametern wie `bankparameter` und insofern redundant —
   * aber in einer Form, die die Anwendungsschicht lesen darf. `bankparameter` ist ein
   * Objekt der Bibliothek und bleibt im Adapter.
   */
  readonly profil?: string;
}

/**
 * Ein Konto, wie die BANK es meldet — noch kein `Zahlungskonto` der App.
 *
 * Der Schlüssel ist `nummer` + `unterkonto`, nie die Nummer allein: manche Institute senden
 * für Girokonto und Depot dieselbe Kontonummer und unterscheiden nur über das
 * Unterkontomerkmal, in dem der Produktname steht. Beides zusammen identifiziert ein Konto
 * — so, wie FinTS es vorsieht.
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
  /** Ob die Bank für dieses Konto eine Depotaufstellung hergibt. */
  readonly kannDepot: boolean;
  /** Klartext, warum ein Konto eingeschränkt ist — leer, wenn es nichts zu sagen gibt. */
  readonly hinweis?: string;
}

/**
 * Ein TAN-Verfahren, wie die Bank es anbietet — soweit es für die Auswahl zählt.
 *
 * Bis hierher nahm der Abruf immer das erste gemeldete Verfahren. Das ist bei Instituten,
 * die mehrere anbieten, eine stille Entscheidung über die Bequemlichkeit des Nutzers: ob
 * er eine TAN abtippt oder in der Banking-App auf „freigeben" tippt, steht in dieser Liste.
 */
export interface TanVerfahren {
  /** Bank-interne ID, wie sie in `Bankzugang.tanVerfahrenId` gehört. */
  readonly id: number;
  readonly name: string;
  /** true = Freigabe geschieht in der Banking-App, es wird nichts eingetippt. */
  readonly decoupled: boolean;
  /** Ob ein Medium gewählt werden MUSS — die Bank sagt das, nicht die Länge der Liste. */
  readonly mediumPflicht: boolean;
  readonly medien: readonly string[];
}

/**
 * Was die Bank zu einem Geschäftsvorfall sagt.
 *
 * Alle Felder sind optional, weil jeder Vorfall andere Parameter mitbringt und Banken
 * ältere Segmentversionen senden, in denen Felder schlicht fehlen. Ein fehlendes Feld
 * heißt „die Bank hat dazu nichts gesagt", nicht „nein" — der Unterschied entscheidet,
 * ob man einen Abruf wagt oder ihn unterlässt.
 */
export interface Vorfallprofil {
  /** FinTS-Segmentkürzel, z. B. „HKKAZ". Die Oberfläche übersetzt es. */
  readonly segment: string;
  /** Höchste Version, die Bank UND Bibliothek gemeinsam können. */
  readonly version?: number;
  /** Wie weit die Bank für diesen Vorfall zurückreicht. Kann je Format abweichen. */
  readonly speicherzeitraumTage?: number;
  /** Ob alle Konten in einem Auftrag abgefragt werden dürfen. */
  readonly alleKontenAmStueck?: boolean;
  /** Ob die Anzahl der Einträge begrenzt werden darf. */
  readonly anzahlBegrenzbar?: boolean;
  /** Ob eine Währung gewählt werden darf (Depot). */
  readonly waehrungWaehlbar?: boolean;
  /** Ob Echtzeitkurse statt verzögerter angefordert werden dürfen (Depot). */
  readonly kursqualitaetWaehlbar?: boolean;
  /** Unterstützte Datenformate, z. B. CAMT-Fassungen oder Auszugsformate. */
  readonly formate?: readonly string[];
}

/**
 * Was diese Bank kann — abgefragt statt angenommen.
 *
 * Das steckt alles in den Bankparametern (BPD/UPD), die wir ohnehin als `bankparameter`
 * aufbewahren. Der Unterschied ist die Form: dort ist es ein Objekt der Bibliothek, das
 * nur der Adapter lesen darf und niemand ansehen kann. Hier sind es Fachbegriffe, die
 * ohne Anmeldung und ohne PIN dastehen — und damit die Antwort auf „warum holt der Abruf
 * nur 30 Tage" hergeben, bevor jemand sich einloggt, um nachzusehen.
 */
export interface Bankprofil {
  /** Wann dieses Profil erhoben wurde (ISO-Datum). */
  readonly standAm: string;
  readonly tanVerfahren: readonly TanVerfahren[];
  readonly vorfaelle: readonly Vorfallprofil[];
  /**
   * Welche Vorfälle je Konto freigegeben sind — Schlüssel ist `Bankkonto.schluessel`.
   * Die Bank meldet das je Konto verschieden; ein Depot kann Umsätze verweigern und
   * Bestände liefern.
   */
  readonly kontoVorfaelle: Readonly<Record<string, readonly string[]>>;
  /**
   * Ob die Bank die nationalen Kontofelder in der internationalen Kontoverbindung
   * erlaubt (`HISPAS.nationalAccountAllowed`). `false` ist der Grund, warum bei manchen
   * Instituten CAMT nur ohne diese Felder durchgeht.
   */
  readonly nationaleFelderErlaubt?: boolean;
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

/**
 * Eine Position im Depot, zu einem Stichtag.
 *
 * Zu den Zahlen: `wert` und `einstand` sind Geld und damit Integer Cent wie überall.
 * `stueck` und `kurs` sind es NICHT — und das ist kein Versehen:
 *
 *  • `stueck` ist eine Menge, keine Summe. Fondsanteile kommen mit Nachkommastellen, und
 *    ein Bestand von 12,3456 Anteilen auf Cent zu runden ergibt keinen Sinn.
 *  • `kurs` ist eine NOTIERUNG der Bank, oft mit vier Nachkommastellen. In Cent gepresst
 *    verlöre er still an Genauigkeit — und weil er dann fast richtig aussähe, fiele es
 *    niemandem auf.
 *
 * Deshalb die Regel dazu: gerechnet wird mit `wert` und `einstand`. `stueck` und `kurs`
 * werden ANGEZEIGT, nie summiert. Wer aus ihnen einen Betrag bildet, hat die Cent-Regel
 * über eine Hintertür verlassen.
 */
export interface Depotposition {
  readonly isin?: string;
  readonly wkn?: string;
  readonly name?: string;
  /** Stückzahl bzw. Anteile — eine Menge, kein Geld. */
  readonly stueck?: number;
  /** Kursnotierung der Bank — zur Anzeige, nicht zum Rechnen. */
  readonly kurs?: number;
  /** Der Wert der Position in Cent, wie die Bank ihn beziffert. */
  readonly wert?: Cent;
  readonly waehrung?: string;
  /** Wann gekauft wurde, sofern die Bank es mitschickt (ISO-Datum). */
  readonly einstandDatum?: string;
  /** Einstandskurs — ebenfalls eine Notierung. */
  readonly einstandKurs?: number;
}

/**
 * Das Depot zu einem Stichtag, wie die Bank es aufstellt.
 *
 * Der Stichtag ist Teil der Aussage, nicht Beiwerk: ein Depotwert ohne Datum ist wertlos,
 * weil er sich täglich ändert, ohne dass etwas gebucht wurde. Genau darin unterscheidet
 * sich ein Depot von einem Zahlungskonto — es hat keine Buchungen, aus denen sich sein
 * Stand ableiten liesse, sondern nur Beobachtungen.
 */
export interface Depotbestand {
  readonly stichtag: string;
  readonly gesamtwert?: Cent;
  readonly waehrung?: string;
  readonly positionen: readonly Depotposition[];
  /** Rückmeldungen der Bank zu diesem Abruf. */
  readonly hinweise: readonly string[];
}

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
  /** Was diese Bank kann, wie sie es selbst meldet. */
  readonly profil: Bankprofil;
  saldo(konto: Bankkonto): Promise<Saldo | null>;
  /**
   * Umsätze holen.
   *
   * `bevorzugtesFormat` ist das, was für dieses Konto zuletzt getragen hat („CAMT" oder
   * „MT940"). Es entscheidet nur die REIHENFOLGE der beiden Versuche, nie das Ergebnis:
   * bleibt der erste leer, läuft der zweite. Damit spart ein Konto, das nur über MT940
   * geht, die ergebnislose CAMT-Runde — und ein Institut, das CAMT nachrüstet, kommt
   * trotzdem wieder darauf, statt für immer auf dem alten Weg zu bleiben.
   */
  umsaetze(
    konto: Bankkonto,
    vonIso: string,
    bisIso: string,
    bevorzugtesFormat?: string,
  ): Promise<AbrufErgebnis>;
  /**
   * Die Depotaufstellung, sofern die Bank sie für dieses Konto freigibt.
   *
   * `null` heisst „für dieses Konto nicht vorgesehen" — kein Fehler. Ob Währung und
   * Kursqualität mitgeschickt werden dürfen, sagt die Bank über ihre Parameter; sie
   * ungefragt zu senden hiess bis zum Umstieg auf den Fork, es auf gut Glück zu tun.
   */
  depot(konto: Bankkonto, echtzeitkurse?: boolean): Promise<Depotbestand | null>;
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
