// Welche Sicherungen bleiben und welche gehen.
//
// **Wozu gestaffelt und nicht einfach „die letzten N".** Eine Reihe der letzten zehn
// Sicherungen reicht genau so weit zurück, wie man täglich startet — also oft zehn Tage.
// Der Fall, für den es Sicherungen gibt, ist aber nicht „gestern kaputtgegangen": es ist
// „vor Wochen etwas schiefgelaufen und erst jetzt bemerkt". Eine Staffelung deckt beides
// ab und kostet dabei weniger Platz als eine lange tägliche Reihe.
//
// **Der Kern rechnet, er löscht nicht.** Hier steht nur, welche Stichtage bleiben; das
// Entfernen ist Sache des Adapters. Deshalb keine Uhr und kein Dateisystem — `heute`
// steckt in den Stichtagen selbst, denn eine Sicherung von heute gibt es immer.

import { ord, parseIso } from "../basis/datum";

// **Eine Stufe zählt VORHANDENE Stände, keine Kalendereinheiten.** „Vier wöchentlich"
// heisst: die vier jüngsten Sieben-Tage-Blöcke, IN DENEN ES EINE SICHERUNG GIBT — nicht
// die vier letzten Kalenderwochen. Der Unterschied zeigt sich, sobald jemand die App
// wochenlang nicht startet: bei kalendarischer Lesart bliebe dann nichts übrig, weil die
// letzten vier Wochen leer sind. Genau dieser Nutzer braucht seine alten Stände aber am
// dringendsten. Die Staffelung greift damit erst, wenn tatsächlich viel da ist — bei
// wenigen Sicherungen bleibt schlicht alles.

/** Wie viele Stufen wie weit zurückreichen. */
export interface Aufbewahrung {
  /** Die letzten N Tage, je einer. */
  taeglich: number;
  /** Davor N Wochen, je eine. */
  woechentlich: number;
  /** Davor N Monate, je einer. */
  monatlich: number;
  /** Davor N Jahre, je eins. */
  jaehrlich: number;
}

/**
 * Der Standard: eine Woche täglich, ein Monat wöchentlich, ein Jahr monatlich, drei
 * Jahre jährlich. Zusammen höchstens 26 Dateien.
 *
 * Die Zahlen sind nicht ausgerechnet, sondern gewählt — jede Stufe reicht ungefähr so
 * weit, wie die nächstgröbere ihre Schrittweite hat, damit keine Lücke entsteht.
 */
export const AUFBEWAHRUNG: Aufbewahrung = {
  taeglich: 7,
  woechentlich: 4,
  monatlich: 12,
  jaehrlich: 3,
};

/** Ein Sieben-Tage-Block. Bewusst NICHT die ISO-Woche: für eine Staffelung zählt der
 *  gleichmässige Abstand, nicht welcher Wochentag ein Jahr beginnt. */
function wochenschluessel(iso: string): string {
  return String(Math.floor(ord(parseIso(iso)) / 7));
}

function stufe(sortiert: string[], schluessel: (iso: string) => string, anzahl: number): string[] {
  if (anzahl <= 0) return [];
  const neuesteJeGruppe = new Map<string, string>();
  // `sortiert` läuft von neu nach alt, der erste Treffer je Gruppe ist also der neueste.
  for (const iso of sortiert) {
    const k = schluessel(iso);
    if (!neuesteJeGruppe.has(k)) neuesteJeGruppe.set(k, iso);
  }
  return [...neuesteJeGruppe.values()].slice(0, anzahl);
}

/**
 * Welche Stichtage bleiben — absteigend sortiert, ohne Dubletten.
 *
 * Eine Sicherung kann in mehreren Stufen zählen (die von heute ist zugleich die der
 * laufenden Woche und des laufenden Monats). Das ist Absicht: die Stufen sind eine
 * Vereinigung, keine Aufteilung. Deshalb liegt die tatsächliche Zahl der behaltenen
 * Dateien meist deutlich unter der Summe der Stufen.
 */
export function zuBehalten(stichtage: string[], regel: Aufbewahrung = AUFBEWAHRUNG): string[] {
  const sortiert = [...new Set(stichtage)].sort().reverse();
  const behalten = new Set<string>([
    ...stufe(sortiert, (iso) => iso, regel.taeglich),
    ...stufe(sortiert, wochenschluessel, regel.woechentlich),
    ...stufe(sortiert, (iso) => iso.slice(0, 7), regel.monatlich),
    ...stufe(sortiert, (iso) => iso.slice(0, 4), regel.jaehrlich),
  ]);
  return sortiert.filter((iso) => behalten.has(iso));
}

/** Das Gegenstück — was weg darf. Absteigend sortiert. */
export function zuEntfernen(stichtage: string[], regel: Aufbewahrung = AUFBEWAHRUNG): string[] {
  const behalten = new Set(zuBehalten(stichtage, regel));
  return [...new Set(stichtage)].sort().reverse().filter((iso) => !behalten.has(iso));
}
