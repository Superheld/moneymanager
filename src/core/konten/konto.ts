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
 * Genau **eine** Wirkung hat die Klasse: `"liquide"` zählt zu den liquiden Mitteln, alles
 * andere nicht. Die vier übrigen Werte unterscheiden sich für die RECHNUNG also nicht —
 * sie sind eine Benennung, und das ist Absicht. Was sie weiter trennen soll, ist offen.
 *
 * **Seit 2026-09-22 sind es fünf, und die zwei neuen haben die Kontogruppen ersetzt.**
 * Bis dahin gab es daneben eine frei benannte `Kontogruppe` — eine Sicht, die nichts
 * entschied. Zwei Felder, die beide „wofür ist dieses Konto da" beantworteten, und nur
 * eines davon galt. Was dabei verloren geht, gehört benannt: **ein Konto liegt in genau
 * einer Klasse.** Ein Bargeldbestand, der in „Lebenshaltung" UND „Urlaub" lag, lässt sich
 * so nicht mehr abbilden — wer beliebige Bündel über Konten legen will, braucht dafür
 * etwas Neues, und es darf dann wieder nichts entscheiden.
 *
 * **Erweitern:** einen Wert in `KONTOKLASSEN` ergänzen, in `i18n.ts` unter
 * `einstellungen.konto.klasse` und `klasseHinweis` benennen — und entscheiden, ob er
 * verfügbar ist. Nur `"liquide"` ist es. Die Reihenfolge in `KONTOKLASSEN` ist dabei die
 * Reihenfolge in der Karte „Was da ist" und im Auswahlfeld: von verfügbar nach gebunden.
 */
export type Kontoklasse = "liquide" | "ruecklage" | "vorsorge" | "sparen" | "investment";

export const KONTOKLASSEN: Kontoklasse[] = [
  "liquide",
  "ruecklage",
  "vorsorge",
  "sparen",
  "investment",
];

/**
 * Vorschlag für ein Konto, das noch keine Klasse trägt.
 *
 * Nur ein Vorschlag: ein Tagesgeldkonto ist mal Reserve, mal zweckgebundene Rücklage, und
 * das weiß nur der, dem es gehört. Die Vorgabe ist deshalb die harmlosere — verfügbar —,
 * außer beim Depot, wo sie offensichtlich falsch wäre.
 */
export function klasseVorschlag(typ: Kontotyp): Kontoklasse {
  return typ === "Depot" ? "investment" : "liquide";
}

/** Ist das Geld auf diesem Konto verfügbar? */
export function istLiquide(konto: Pick<Zahlungskonto, "klasse">): boolean {
  return konto.klasse === "liquide";
}

/**
 * Wird dieses Konto noch geführt?
 *
 * Ein stillgelegtes Konto gibt es nicht mehr — aufgelöst bei der Bank, oder eine Kasse,
 * die niemand mehr führt. Seine Buchungen BLEIBEN, und daran hängt der ganze Sinn: ein
 * Konto loszuwerden, ohne seine Vergangenheit mitzunehmen.
 *
 * **Das hier ist eine Sicht auf die GEGENWART, keine Rechenregel.** Der Unterschied
 * entscheidet, was diese Funktion beantworten darf und was nicht: Sie sagt, ob man auf das
 * Konto noch etwas buchen, es noch abrufen, noch abgleichen, noch als Ziel wählen kann —
 * und ob sein Geld für den nächsten Monat zur Verfügung steht. Sie sagt **nicht**, ob seine
 * Buchungen in einer Auswertung mitzählen. Wer sie dort einsetzt, schreibt mit einem Klick
 * in der Verwaltung rückwirkend jeden Monat um, und die Zahlen von letztem Jahr sind
 * danach andere als vorher.
 *
 * Deshalb steht sie hier als FRAGE und nicht als Filter in `liquideMittel`: welche Summe
 * ein stillgelegtes Konto mitnimmt, entscheidet die Aufrufstelle, weil die Aufrufstellen
 * verschiedene Fragen stellen. Dieselbe Arbeitsteilung wie bei der Kontoklasse.
 */
export function istAktiv(konto: Pick<Zahlungskonto, "aktiv">): boolean {
  return konto.aktiv !== false;
}

/**
 * Die Konten, die eine Auswahl anbieten darf — plus das bereits Gewählte.
 *
 * Ein stillgelegtes Konto soll man nicht mehr WÄHLEN können; das ist der halbe Sinn der
 * Stilllegung. Es einfach herauszufiltern ist aber der naheliegende und falsche Weg: eine
 * Buchung, die auf einem stillgelegten Konto LIEGT, fände ihr eigenes Konto in der Liste
 * nicht mehr — das Feld stünde leer oder zeigte stillschweigend ein anderes, und beim
 * nächsten Speichern wäre die Buchung umgezogen. Auf einem Konto, das es nicht mehr gibt,
 * kann man nichts Neues buchen; was dort schon liegt, muss man trotzdem ansehen und
 * bearbeiten können.
 *
 * Deshalb nimmt diese Funktion beides: die geführten Konten, und dazu genau das eine, das
 * ohnehin schon dransteht. Die Reihenfolge bleibt, wie sie hereinkam.
 */
export function waehlbareKonten(
  konten: readonly Zahlungskonto[],
  bereitsGewaehlt?: string,
): Zahlungskonto[] {
  return konten.filter((k) => istAktiv(k) || k.id === bereitsGewaehlt);
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
  /**
   * Wird das Konto noch geführt? **Fehlend heißt JA** — dieselbe Form wie
   * `Istbuchung.budgetrelevant`, und aus demselben Grund: ein fehlender Wert muss die
   * harmlose Aussage sein, sonst fällt ein Konto aus einer Liste, weil jemand ein Feld
   * nicht gesetzt hat. Gefragt wird deshalb über `istAktiv`, nie über `konto.aktiv` direkt.
   */
  readonly aktiv?: boolean;
}

/**
 * Summe der VERFÜGBAREN Kontostände — die liquiden Mittel, Startpunkt der
 * Liquiditätsprojektion.
 *
 * Konten jeder anderen Klasse bleiben draußen. Bis 2026-08-21
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
