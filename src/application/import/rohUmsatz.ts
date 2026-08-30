// RohUmsatz — die kanonische, quellen-AGNOSTISCHE Form einer eingelesenen Buchung.
// Jeder Quellen-Adapter (Finanzguru, später CAMT/FinTS) übersetzt sein eigenes Format
// in genau diese Struktur. Alles darüber (Dedup, Kategorisierung, Verbuchung) arbeitet
// nur noch hiermit und kennt die Quelle nicht mehr.
//
// Noch KEIN Aggregat mit Lebenszyklus (das ist `Umsatz` in Slice 2) — nur das geparste
// Rohdatum, plus ein paar quellen-native Zusatzfelder, die spätere Slices billig machen.

import type { Cent } from "../../core";

export interface RohUmsatz {
  /** Buchungstag als ISO „YYYY-MM-DD". */
  readonly buchungstag: string;
  /** Valuta/Wertstellung als ISO, falls die Quelle sie getrennt liefert. */
  readonly valuta?: string;
  /** Betrag in Minor Units (Integer, vorzeichenbehaftet: negativ = Abfluss). */
  readonly betrag: Cent;
  /** Währungs-Code, z. B. „EUR". */
  readonly waehrung: string;
  /** Begünstigter/Auftraggeber (die Gegenpartei). */
  readonly gegenpartei: string;
  /** IBAN der Gegenpartei, falls vorhanden. */
  readonly gegenparteiIban?: string;
  /** Verwendungszweck (Freitext). */
  readonly verwendungszweck: string;
  /** IBAN des eigenen Kontos (Referenzkonto) — Basis fürs Konto-Mapping. */
  readonly kontoIban?: string;
  /** Anzeigename des eigenen Kontos aus der Quelle (z. B. „Girokonto") — Vorschlag beim Anlegen. */
  readonly kontoName?: string;
  /** SEPA-Gläubiger-ID (nur bei Lastschriften gesetzt) — später Anker der Regel-Schicht. */
  readonly glaeubigerId?: string;
  /**
   * SEPA-Mandatsreferenz. Zusammen mit der Gläubiger-ID der einzige von der BANK
   * vergebene Schlüssel, den beide Quellen tragen — der Dublettenfinder erklärt damit
   * zwei Lastschriften ohne jede Textähnlichkeit für dieselbe.
   */
  readonly mandatsreferenz?: string;
  /**
   * SEPA-End-to-End-Referenz. Wäre der saubere Schlüssel für alles; Finanzguru liefert
   * die Spalte `E-Ref` aber am echten Bestand durchweg leer. Von der Bank nehmen wir sie
   * trotzdem mit: sobald zwei Bankquellen aufeinandertreffen, trägt sie.
   */
  readonly e2eReferenz?: string;
  /**
   * Art der Buchung in der Sprache der QUELLE — „KARTENVERFÜGUNG" bei der einen Bank,
   * „Kartenzahlung" bei Finanzguru. Bewusst nicht vereinheitlicht und bewusst NICHT
   * für den Abgleich benutzt: die Vokabulare sind verschieden, und ein hier erfundenes
   * drittes wäre eine Behauptung über Daten, die wir nicht haben.
   */
  readonly umsatzart?: string;
  /** Geschäftsvorfallcode der Bank (MT940 `:61:`, z. B. 005, 700, 820). */
  readonly buchungsschluessel?: string;
  /**
   * SEPA-Verwendungszweckcode — `SALA` (Gehalt), `RENT` (Miete), `LOAN` … Nur CAMT
   * liefert ihn.
   *
   * Eine Einordnung, die die BANK schon vorgenommen hat. Anders als `umsatzart` ist das
   * kein Vokabular, das je Institut anders aussieht, sondern eine feste Liste aus dem
   * SEPA-Standard — und damit das einzige Merkmal dieser Art, das man ohne Umdeutung
   * verwenden kann.
   */
  readonly zweckCode?: string;
  /**
   * Wer die Zahlung WIRKLICH bekommt oder schickt, wenn ein Zahlungsdienstleister
   * dazwischensteht. Nur CAMT (`UltmtCdtr`/`UltmtDbtr`).
   *
   * Ohne dieses Feld steht in `gegenpartei` der Dienstleister, und der Händler dahinter
   * lässt sich aus dem Verwendungszweck bestenfalls raten — bei manchen Anbietern gar
   * nicht. Für die Kategorie-Erkennung ist der Unterschied erheblich: der Dienstleister
   * ist bei jedem Händler derselbe.
   */
  readonly endempfaenger?: string;
  /**
   * Institutseigene Referenz aus dem Freitext (etwa `Ref. …`).
   *
   * ABSICHTLICH KEIN Dedup-Schlüssel: im Spike trugen 64 von 65 Buchungen eine, davon
   * aber nur 59 verschiedene — und ob sie über mehrere Abrufe stabil bleibt, ist
   * ungeprüft. Gespeichert wird sie, damit genau diese Frage am Bestand beantwortbar
   * wird, statt sie zu raten.
   */
  readonly bankreferenz?: string;
  /** Interne Umbuchung zwischen eigenen Konten (von der Quelle markiert) → Umschichtung. */
  readonly istUmbuchung: boolean;

  // ── Quellen-native Zusatzinfos (keine Domäne, aber wertvoll) ──────────────────
  /** ID des Quellen-Adapters, der diese Zeile erzeugt hat, z. B. „finanzguru". */
  readonly quelle: string;
  /** Stabile native ID der Quelle (z. B. Finanzgurus „Buchungs-ID") — exakte Re-Import-Dedup. */
  readonly nativeId?: string;
  /** Roher Kategorie-Hinweis der Quelle (z. B. FG „Analyse-Unterkategorie") — bleibt am Beleg. */
  readonly kategorieHinweis?: string;
  /**
   * Derselbe Hinweis, übersetzt in UNSER Vokabular — ein Kategorie-NAME, keine Id.
   *
   * Übersetzt hat ihn der Adapter, denn nur der kennt das Vokabular seiner Quelle
   * (`adapters/import/finanzguruKategorien.ts`). Die Kategorisierungskette löst den Namen
   * gegen den Katalog des Nutzers auf und entscheidet über den Rang; sie weiss dabei
   * nicht, welche Quelle geliefert hat, und das ist der Punkt: ein zweiter Importeur
   * bringt seine eigene Übersetzung mit, nicht eine zweite Stufe in der Kette.
   *
   * **Nicht dasselbe wie `kategorieHinweis`.** Der ist, was die Quelle SAGTE, und bleibt
   * unverändert am Beleg. Dieser hier ist, was wir daraus gemacht haben — dieselbe
   * Trennung wie zwischen `umsatz_roh` und `umsatz_verarbeitung`.
   */
  readonly kategorieVorschlag?: string;
}

/**
 * Ergebnis eines Einlese-Vorgangs: die geparsten Umsätze plus nicht-fatale Warnungen
 * (z. B. übersprungene Zeilen mit kaputtem Betrag). Der Import wirft NICHT bei einzelnen
 * schlechten Zeilen — er sammelt sie, damit der Nutzer das Gesamtbild sieht.
 */
export interface ImportErgebnis {
  readonly quelle: string;
  readonly umsaetze: readonly RohUmsatz[];
  readonly warnungen: readonly string[];
}
