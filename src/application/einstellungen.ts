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

// ---------------------------------------------------------------------------------
// Die Zeitsperre
// ---------------------------------------------------------------------------------

const SCHLUESSEL_ZEITSPERRE = "zeitsperreMinuten";

/**
 * Nach wie vielen Minuten ohne Bedienung wieder zugesperrt wird. `0` heisst: nie.
 *
 * **Fünfzehn Minuten ohne Zutun**, und das ist eine Abwägung: eine Sperre, die beim
 * Kaffeeholen zuschnappt, wird abgeschaltet — und dann schützt sie gar nichts mehr.
 */
export const ZEITSPERRE_STANDARD = 15;

/** Die Werte, die zur Wahl stehen. `0` steht für „aus". */
export const ZEITSPERRE_STUFEN = [0, 1, 5, 15, 30, 60] as const;

export async function zeitsperreLaden(repo: EinstellungenRepository): Promise<number> {
  const kv = await repo.lesen();
  const roh = kv[SCHLUESSEL_ZEITSPERRE];

  // Ein unlesbarer Wert fällt auf den Standard zurück, NICHT auf „aus". Ein kaputter
  // Eintrag darf die Sperre nicht stillschweigend abschalten — das wäre genau die Sorte
  // Fehler, die niemand bemerkt.
  //
  // **Die leere Zeichenkette muss ausdrücklich weg**, und das hat ein Test gefunden:
  // `Number("")` ist 0, und 0 heisst hier „aus". Ein leerer Eintrag hätte die Sperre
  // also abgeschaltet und dabei ausgesehen wie eine Entscheidung.
  if (roh === undefined || roh.trim() === "") return ZEITSPERRE_STANDARD;

  const zahl = Number(roh);
  return Number.isFinite(zahl) && zahl >= 0 ? Math.floor(zahl) : ZEITSPERRE_STANDARD;
}

export async function zeitsperreSetzen(
  repo: EinstellungenRepository,
  minuten: number,
): Promise<void> {
  const sauber = Number.isFinite(minuten) && minuten > 0 ? Math.floor(minuten) : 0;
  await repo.schreiben(SCHLUESSEL_ZEITSPERRE, String(sauber));
}
