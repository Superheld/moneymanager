// Währung — Value Object (ADR-0004). Eine Währung pro Haushalt; kein FX, keine
// gemischten Konten. Die Währung sagt nur, WIE Minor Units (intern gespeicherte
// Ganzzahlen) zu Major Units (Euro, Dollar, Yen …) stehen — nämlich über die Skala
// (= Anzahl Nachkommastellen, ISO-4217-Minor-Unit-Exponent).
//
// Welche Währung ein Haushalt nutzt, leitet sich strikt aus seiner Region/Locale ab
// (siehe region.ts). Die Skala holen wir aus Intl, das die ISO-4217-Daten kennt —
// keine handgepflegte Tabelle, jede der ~160 Währungen funktioniert.

export interface Waehrung {
  /** ISO-4217-Alpha-Code, z. B. "EUR". */
  readonly code: string;
  /** Nachkommastellen der Minor Units. EUR/USD = 2, JPY = 0, KWD/BHD = 3. */
  readonly skala: number;
}

/** Vorgabe, solange nichts gewählt ist — Bestand sind deutsche EUR-Haushalte. */
export const STANDARD_WAEHRUNG: Waehrung = { code: "EUR", skala: 2 };

/**
 * Währung zu einem ISO-Code. Die Skala kommt aus Intl (ISO-4217-Minor-Units);
 * unbekannte/ungültige Codes fallen konservativ auf Skala 2 — den mit Abstand
 * häufigsten Fall — zurück, damit nie etwas crasht.
 */
export function waehrungNachCode(code: string): Waehrung {
  let skala = 2;
  try {
    skala = new Intl.NumberFormat("en", { style: "currency", currency: code })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    skala = 2;
  }
  return { code, skala };
}
