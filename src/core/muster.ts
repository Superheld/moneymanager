// Textmuster mit `*` — die eine Ebene, auf der zwei sonst unterschiedliche Dinge
// dasselbe tun.
//
// Sie stand bis hierher in `vertragZuordnung` und wurde von der Erkennungsregel eines
// Vertrags benutzt. Mit den Kategorie-Festlegungen kommt ein zweiter Nutzer dazu, der von
// der Regel*struktur* nichts braucht (keine Betragsspanne, kein Zeitraum) — nur das
// Vergleichen. Zwei Kopien wären zwei Antworten auf die Frage, was ein Stern bedeutet und
// ob Groß-/Kleinschreibung zählt; wer eine Zeile eintippt, soll sie an beiden Stellen
// gleich wirken sehen.

/**
 * Ein Muster mit `*` als kompilierter Ausdruck. Alles außer dem Stern wird wörtlich
 * genommen — ein Punkt im Anbieternamen ist ein Punkt, kein „beliebiges Zeichen".
 *
 * Gecacht, weil die Prüfung im Abgleich über den GANZEN Bestand läuft: bei ein paar
 * tausend Buchungen mal einem Dutzend Mustern wäre das sonst fünfstellig viele
 * Regex-Bauten pro Lauf. Die Zahl verschiedener Muster ist dagegen winzig — es sind die
 * Zeilen, die jemand von Hand eingetippt hat.
 */
const musterCache = new Map<string, RegExp>();

function alsRegex(muster: string): RegExp {
  const fertig = musterCache.get(muster);
  if (fertig) return fertig;
  // Erst ALLES escapen (der Stern wird zu `\*`), dann gezielt den Stern freigeben.
  const quelle = muster.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
  const regex = new RegExp(`^${quelle}$`, "i");
  musterCache.set(muster, regex);
  return regex;
}

/**
 * Trifft ein Muster diesen Text? Ohne Stern ein schlichter Vergleich ohne Groß-/
 * Kleinschreibung — der Normalfall, und der billigste.
 */
export function musterTrifft(muster: string, text: string): boolean {
  if (!text) return false;
  if (!muster.includes("*")) return muster.toLowerCase() === text.toLowerCase();
  return alsRegex(muster).test(text);
}

/**
 * Wie festgelegt ein Muster ist — je höher, desto weniger lässt es offen.
 *
 * Gebraucht überall dort, wo mehrere Muster denselben Text treffen und eine Reihenfolge
 * her muss, die nicht vom Zufall der Einfügereihenfolge abhängt. Ein Muster ohne Stern
 * bindet sich an genau einen Text; mit Stern zählt, wie viel Text drumherum noch
 * festgeschrieben ist.
 */
export function musterSchaerfe(muster: string): number {
  const sterne = (muster.match(/\*/g) ?? []).length;
  // Ohne Stern deutlich vor allem mit — ein exakter Treffer ist keine Frage des Grades.
  return (sterne === 0 ? 1000 : 0) + muster.length - sterne * 10;
}
