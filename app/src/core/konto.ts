// Zahlungskonto — liquides Geldkonto (KONZEPT §3.1). Trägt Ist-Buchungen; der
// Kontostand ist „nur eine Zahl" (Töpfe sind nicht kontogebunden). Jedes Konto hat
// genau ein internes Sachkonto-Mapping — in P1 nur Platzhalter, UI-unsichtbar.

export type Kontotyp = "Giro" | "Tagesgeld" | "Bargeld";

export const KONTOTYPEN: Kontotyp[] = ["Giro", "Tagesgeld", "Bargeld"];

export interface Zahlungskonto {
  readonly id: string;
  readonly bezeichnung: string;
  readonly typ: Kontotyp;
  /** Optional; wenn gesetzt, muss sie gültig sein (siehe ibanGueltig). */
  readonly iban?: string;
  /** Inhaber-Personen (n:m als Liste von Person-IDs). */
  readonly inhaberIds: string[];
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
