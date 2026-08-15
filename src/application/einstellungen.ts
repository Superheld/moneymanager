// Haushalts-Einstellungen (ADR-0004). Gespeichert wird genau EINE Sache: die Locale.
// Sprache und Währung leiten sich strikt aus der Region ab (region.ts) — so kann der
// Haushalt mit einer einzigen Auswahl alles korrekt vorbelegen, und es gibt keinen
// Drift zwischen Locale, Sprache und Währung.

import { regionNachLocale, STANDARD_REGION, waehrungNachCode, type Waehrung } from "../core";
import type { EinstellungenRepository } from "./ports";

export interface Haushaltseinstellungen {
  /** Die eine Währung des Haushalts (Code + Skala), abgeleitet aus der Region. */
  waehrung: Waehrung;
  /** BCP-47-Locale für Zahlen-/Datumsformat, z. B. "de-CH". Quelle der Wahrheit. */
  locale: string;
  /** i18n-Sprachcode für die Oberfläche, abgeleitet aus der Region. */
  sprache: string;
}

const SCHLUESSEL_LOCALE = "locale";

function ausRegion(locale: string): Haushaltseinstellungen {
  const region = regionNachLocale(locale);
  return {
    locale: region.locale,
    sprache: region.sprache,
    waehrung: waehrungNachCode(region.waehrungCode),
  };
}

export const STANDARD_EINSTELLUNGEN: Haushaltseinstellungen = ausRegion(STANDARD_REGION.locale);

/** Lädt die Einstellungen; fehlende/unbekannte Locale fällt auf die Standard-Region. */
export async function einstellungenLaden(
  repo: EinstellungenRepository,
): Promise<Haushaltseinstellungen> {
  const kv = await repo.lesen();
  return ausRegion(kv[SCHLUESSEL_LOCALE] ?? STANDARD_REGION.locale);
}

/**
 * Setzt die Region des Haushalts (speichert nur die Locale). Sprache und Währung
 * ergeben sich daraus beim nächsten Laden.
 */
export async function regionWaehlen(
  repo: EinstellungenRepository,
  locale: string,
): Promise<void> {
  await repo.schreiben(SCHLUESSEL_LOCALE, locale);
}
