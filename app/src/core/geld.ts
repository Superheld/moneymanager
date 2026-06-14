// Geldbetrag — Value Object. Intern in ganzen Cent (Integer), nie Float-Euro,
// damit keine Rundungsfehler durch binäre Gleitkommazahlen entstehen.
// Vorzeichen trägt die Richtung: negativ = Abfluss, positiv = Zufluss.

export type Cent = number;

/** Euro (z. B. 120.5) → Cent (12050). Rundet kaufmännisch auf den ganzen Cent. */
export function euroZuCent(euro: number): Cent {
  return Math.round(euro * 100);
}

/** Cent → Euro als Zahl (z. B. 12050 → 120.5). */
export function centZuEuro(cent: Cent): number {
  return cent / 100;
}

/**
 * Formatiert Cent als de-DE-Betrag mit Tausenderpunkt und „−" (U+2212) für Minus,
 * wie im Design-System-Glossar gefordert. Ohne €-Suffix — das setzt die UI separat.
 */
export function formatBetrag(cent: Cent, mitVorzeichen = false): string {
  const negativ = cent < 0;
  const betrag = Math.abs(cent) / 100;
  const s = betrag.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (negativ) return "−" + s;
  return mitVorzeichen ? "+" + s : s;
}
