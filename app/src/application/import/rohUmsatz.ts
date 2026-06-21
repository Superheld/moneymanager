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
  /** IBAN des eigenen Kontos (Referenzkonto) — Basis fürs spätere Konto-Mapping. */
  readonly kontoIban?: string;
  /** SEPA-Gläubiger-ID (nur bei Lastschriften gesetzt) — später Anker der Regel-Schicht. */
  readonly glaeubigerId?: string;

  // ── Quellen-native Zusatzinfos (keine Domäne, aber wertvoll) ──────────────────
  /** ID des Quellen-Adapters, der diese Zeile erzeugt hat, z. B. „finanzguru". */
  readonly quelle: string;
  /** Stabile native ID der Quelle (z. B. Finanzgurus „Buchungs-ID") — exakte Re-Import-Dedup. */
  readonly nativeId?: string;
  /** Roher Kategorie-Hinweis der Quelle (z. B. FG „Analyse-Unterkategorie") — Input fürs Remapping. */
  readonly kategorieHinweis?: string;
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
