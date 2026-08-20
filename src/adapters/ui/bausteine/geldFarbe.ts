// Die eine Regel, welche Farbe ein Geldbetrag trägt.
//
// Vorher stand sie viermal im Baum, jedes Mal etwas anders: KontenScreen färbte
// Zuflüsse grün und Abflüsse schwarz (Umschichtungen teal), MonatsAusblick färbte nur
// das Minus, die Historie nur die Netto-Spalte, und die meisten Tabellen färbten gar
// nicht. Derselbe Betrag sah je nach Screen anders aus — und „schwarz" hiess mal
// „Ausgabe", mal „unauffällig".
//
// Jetzt: Plus ist grün, Minus trägt den negativen Ton, die Null bleibt neutral. Keine
// Sonderfarbe mehr für Umschichtungen — dass Geld nur das Konto wechselt, sagt die
// Pille in der Zeile, nicht der Betrag. Ein Betrag beantwortet genau eine Frage:
// kommt er rein oder geht er raus?
//
// `--warn-deep` trägt damit zwei Bedeutungen (Abfluss und Warnung). Bewusst so
// entschieden (2026-08-19): lieber ein Ton weniger als ein Ton, den niemand benennen
// kann. Warnungen unterscheiden sich über Pille und Meta-Zeile, nicht über die Farbe.

/** Farbe eines vorzeichenbehafteten Betrags — als CSS-Wert, direkt in `style.color`. */
export function geldFarbe(betrag: number): string {
  if (betrag > 0) return "var(--ok-deep)";
  if (betrag < 0) return "var(--warn-deep)";
  return "var(--ink-3)";
}
