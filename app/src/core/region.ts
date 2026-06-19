// Region/Locale (ADR-0004) — strikte Kopplung: die gewählte Locale ist die Quelle der
// Wahrheit und bestimmt zugleich UI-Sprache UND Haushaltswährung. Kein separater
// Währungs-Picker (bewusste Entscheidung: einfacheres Setup; der seltene Expat-Fall —
// deutsche UI mit USD — ist es nicht wert, jeden Nutzer drei Dinge wählen zu lassen).
//
// Kuratiert: hier stehen nur Locales, deren UI-Sprache wir tatsächlich übersetzt haben
// (de/en). Eine neue Region kommt erst dazu, wenn ihre Sprache ein Übersetzungs-Bundle
// hat — sonst stünde die Oberfläche auf Fallback. Erweitern ist append-only.
//
// Datenseitig bleibt die Tür zum Entkoppeln offen: gespeichert wird die Locale; Währung
// und Sprache werden beim Laden abgeleitet. Ein späterer Währungs-Override wäre eine
// reine UI-/Settings-Erweiterung, keine Migration.

export interface Region {
  /** BCP-47-Locale — Quelle der Wahrheit, einziger gespeicherter Wert. */
  readonly locale: string;
  /** Anzeigename im Umschalter (Eigenname der Region). */
  readonly label: string;
  /** i18n-Sprachcode; MUSS ein Übersetzungs-Bundle haben. */
  readonly sprache: string;
  /** ISO-4217-Code der Standardwährung dieser Region. */
  readonly waehrungCode: string;
}

export const REGIONEN: readonly Region[] = [
  { locale: "de-DE", label: "Deutschland", sprache: "de", waehrungCode: "EUR" },
  { locale: "de-AT", label: "Österreich", sprache: "de", waehrungCode: "EUR" },
  { locale: "de-CH", label: "Schweiz", sprache: "de", waehrungCode: "CHF" },
  { locale: "en-US", label: "United States", sprache: "en", waehrungCode: "USD" },
  { locale: "en-GB", label: "United Kingdom", sprache: "en", waehrungCode: "GBP" },
  { locale: "en-IE", label: "Ireland", sprache: "en", waehrungCode: "EUR" },
];

export const STANDARD_REGION: Region = REGIONEN[0];

/** Region zu einer Locale; unbekannte Locale → Standard (de-DE). */
export function regionNachLocale(locale: string): Region {
  return REGIONEN.find((r) => r.locale === locale) ?? STANDARD_REGION;
}
