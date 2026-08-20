// Zahlungskonto — liquides Geldkonto (KONZEPT §3.1). Trägt Ist-Buchungen; der
// Kontostand ist „nur eine Zahl" (Töpfe sind nicht kontogebunden). Jedes Konto hat
// genau ein internes Sachkonto-Mapping — in P1 nur Platzhalter, UI-unsichtbar.

import type { Cent } from "../basis/geld";

/**
 * Die Art eines Zahlungskontos — WAS es ist. Ein Etikett ohne Wirkung auf die Rechnung.
 *
 * `"Depot"` braucht Erklärung, weil es daneben eine `depot`-Entität gibt (`core/depot/`).
 * Zwei verschiedene Dinge:
 *
 *  • **`Depot` als Entität** ist, was die BANK meldet — eine Reihe von Beobachtungen zu
 *    Stichtagen, ohne Buchungen, ohne Saldo. Sie taucht in keiner Kontenliste auf.
 *  • **`Kontotyp: "Depot"`** ist ein Konto, das der Nutzer SELBST führt und als Depot
 *    bezeichnet. Es hat einen Saldo und Buchungen wie jedes andere.
 */
export type Kontotyp = "Giro" | "Tagesgeld" | "Bargeld" | "Kreditkarte" | "Depot";

export const KONTOTYPEN: Kontotyp[] = ["Giro", "Tagesgeld", "Bargeld", "Kreditkarte", "Depot"];

/**
 * Wofür ein Konto da ist — und daraus folgt, ob sein Geld VERFÜGBAR ist.
 *
 * Getrennt vom Typ, weil beide verschiedene Fragen beantworten: der Typ sagt, was für ein
 * Konto es ist (Giro, Tagesgeld), die Klasse, welche Rolle es im Haushalt spielt. Dasselbe
 * Tagesgeldkonto kann Alltagsreserve oder zweckgebundene Rücklage sein — der Typ ändert
 * sich dadurch nicht, die Antwort auf „wieviel habe ich" sehr wohl.
 *
 * Genau **eine** Wirkung hat die Klasse heute: `"liquide"` zählt zu den liquiden Mitteln,
 * alles andere nicht. Mehr soll sie vorerst auch nicht — die Unterscheidung zwischen
 * Rücklage und Vorsorge ist bislang eine Benennung, keine Regel. Was sie weiter trennen
 * soll, ist offen und wird sich zeigen.
 *
 * **Erweitern:** einen Wert in `KONTOKLASSEN` ergänzen, in `i18n.ts` unter
 * `einstellungen.konto.klasse` benennen — und prüfen, ob er verfügbar ist oder nicht. Nur
 * `"liquide"` ist es.
 */
export type Kontoklasse = "liquide" | "ruecklage" | "vorsorge";

export const KONTOKLASSEN: Kontoklasse[] = ["liquide", "ruecklage", "vorsorge"];

/**
 * Vorschlag für ein Konto, das noch keine Klasse trägt.
 *
 * Nur ein Vorschlag: ein Tagesgeldkonto ist mal Reserve, mal zweckgebundene Rücklage, und
 * das weiß nur der, dem es gehört. Die Vorgabe ist deshalb die harmlosere — verfügbar —,
 * außer beim Depot, wo sie offensichtlich falsch wäre.
 */
export function klasseVorschlag(typ: Kontotyp): Kontoklasse {
  return typ === "Depot" ? "vorsorge" : "liquide";
}

/** Ist das Geld auf diesem Konto verfügbar? */
export function istLiquide(konto: Pick<Zahlungskonto, "klasse">): boolean {
  return konto.klasse === "liquide";
}

export interface Zahlungskonto {
  readonly id: string;
  readonly bezeichnung: string;
  /** Was für ein Konto es ist. Reines Etikett. */
  readonly typ: Kontotyp;
  /** Welche Rolle es spielt — und damit, ob sein Geld verfügbar ist. */
  readonly klasse: Kontoklasse;
  /** Optional; wenn gesetzt, muss sie gültig sein (siehe ibanGueltig). */
  readonly iban?: string;
  /** Inhaber-Personen (n:m als Liste von Person-IDs). */
  readonly inhaberIds: string[];
  /** Aktueller Kontostand in Cent (manuell gepflegt; später aus Import). */
  readonly saldo: Cent;
}

/**
 * Summe der VERFÜGBAREN Kontostände — die liquiden Mittel, Startpunkt der
 * Liquiditätsprojektion.
 *
 * Konten der Klasse `"ruecklage"` und `"vorsorge"` bleiben draußen. Bis 2026-08-21
 * summierte diese Funktion alle Salden ohne Unterschied, und ein Depot zählte als
 * Bargeld.
 *
 * **Wer das ändert, muss die Buchungen mitnehmen.** `istMonatsverlauf` bildet aus dieser
 * Summe seinen Sockel und lässt Buchungen darüberlaufen; nimmt man den Sockel eines Kontos
 * heraus und seine Buchungen nicht, ergibt der Verlauf einen Saldo, den es nie gab. Beide
 * Seiten gehören zusammen — deshalb filtert `istMonatsverlauf` mit derselben Regel.
 */
export function liquideMittel(konten: Zahlungskonto[]): Cent {
  return konten.filter(istLiquide).reduce((s, k) => s + k.saldo, 0);
}

/** Normalisiert eine IBAN: Leerzeichen weg, Großbuchstaben. */
export function normalisiereIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Prüft eine IBAN nach ISO 7064 (mod 97 == 1). Reine Funktion ohne Länderlisten;
 * validiert Grundstruktur + Prüfsumme, nicht die landesspezifische Länge.
 */
export function ibanGueltig(iban: string): boolean {
  const s = normalisiereIban(iban);
  if (s.length < 15 || s.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  // Buchstaben → Zahlen (A=10 … Z=35), dann fortlaufend mod 97.
  let rest = 0;
  for (const ch of umgestellt) {
    const wert = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    rest = wert > 9 ? (rest * 100 + wert) % 97 : (rest * 10 + wert) % 97;
  }
  return rest === 1;
}
