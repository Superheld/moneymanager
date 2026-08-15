// Datum-Helfer — Monatsarithmetik auf ISO-Datumsstrings „YYYY-MM-DD", ohne
// Zeitzonen-Fallen. Reine Funktionen; geteilt von Projektion und Kündigungslogik.

import { FachlicherFehler } from "./fehler";

export interface Ymd {
  y: number;
  m: number; // 1–12
  d: number; // 1–31
}

/**
 * „YYYY-MM-DD" → Ymd. Wirft bei allem, was kein existierendes Kalenderdatum ist.
 *
 * Vorher wurde blind zerlegt: aus "" wurde {y:NaN,…} und daraus in der Projektion die
 * Beschriftung „undefined aN"; "2026-01-00" überlebte als Tag 0 bis in die Planbuchung
 * und die DB; "2026-00-15" wurde still zum Dezember des Vorjahres umgedeutet. Die
 * Formprüfungen der Use-Cases (/^\d{4}-\d{2}-\d{2}$/) prüfen die FORM, nicht die
 * Existenz — deshalb muss der Kern hier selbst hart sein.
 */
export function parseIso(iso: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) throw new FachlicherFehler("datum.ungueltig");
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (ymd.m < 1 || ymd.m > 12) throw new FachlicherFehler("datum.ungueltig");
  if (ymd.d < 1 || ymd.d > tageImMonat(ymd.y, ymd.m)) throw new FachlicherFehler("datum.ungueltig");
  return ymd;
}

export function tageImMonat(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Addiert n Monate; klemmt den Tag auf den letzten gültigen Tag des Zielmonats. */
export function addMonate(ymd: Ymd, n: number): Ymd {
  const gesamt = ymd.y * 12 + (ymd.m - 1) + n;
  const y = Math.floor(gesamt / 12);
  const m = (gesamt % 12) + 1;
  const d = Math.min(ymd.d, tageImMonat(y, m));
  return { y, m, d };
}

/** Vergleichbarer Schlüssel YYYYMMDD für Datumsordnung. */
export function ord(ymd: Ymd): number {
  return ymd.y * 10000 + ymd.m * 100 + ymd.d;
}

/** Addiert n Kalendertage (echte Tagesarithmetik, kein Klemmen). */
export function addTage(ymd: Ymd, n: number): Ymd {
  const ms = Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * 86_400_000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Ymd → „YYYY-MM-DD". Das Jahr wird auf vier Stellen gepolstert.
 *
 * Ohne Polsterung wurde aus dem Jahr 26 der String „26-01-15" — und weil die ganze
 * Codebase Daten als STRINGS vergleicht (Budget-Fenster, Kontoauszug, Sortierungen),
 * kippte damit die Ordnung: „0026-01-15" < „2026-01-01" ist wahr, „26-01-15" < „2026-01-01"
 * ist falsch. Dasselbe Datum sortierte nach einer Konvertierung in die Zukunft.
 *
 * Ausserhalb von 0001..9999 gibt es keine gültige ISO-Darstellung — dann lieber werfen
 * als einen String erzeugen, den keine Vergleichslogik mehr richtig einordnet.
 */
export function toIso(ymd: Ymd): string {
  if (!Number.isInteger(ymd.y) || ymd.y < 1 || ymd.y > 9999) {
    throw new FachlicherFehler("datum.ungueltig");
  }
  const yyyy = String(ymd.y).padStart(4, "0");
  const mm = String(ymd.m).padStart(2, "0");
  const dd = String(ymd.d).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Monatsindex relativ zu einem Startdatum (0 = Startmonat). */
export function monatsIndex(start: Ymd, jahr: number, monat: number): number {
  return jahr * 12 + (monat - 1) - (start.y * 12 + (start.m - 1));
}

/** Volle Monate von `vonIso` bis `bisIso` (kann negativ sein). */
export function monateZwischen(vonIso: string, bisIso: string): number {
  const a = parseIso(vonIso);
  const b = parseIso(bisIso);
  return b.y * 12 + (b.m - 1) - (a.y * 12 + (a.m - 1));
}

/** Tage von `vonIso` bis `bisIso` (positiv, wenn bis in der Zukunft liegt). */
export function tageBis(vonIso: string, bisIso: string): number {
  const a = parseIso(vonIso);
  const b = parseIso(bisIso);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}
