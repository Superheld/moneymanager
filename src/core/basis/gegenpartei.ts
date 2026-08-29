// Der Empfänger einer Zahlung, normalisiert — ein Domänen-Primitiv wie Geld oder Datum.
//
// Es liegt hier und nicht bei den Verträgen, obwohl es dort entstanden ist: den
// Gruppierungsschlüssel eines Empfängers brauchen inzwischen drei Bereiche, die
// nichts miteinander zu tun haben — die Vertragserkennung (gruppiert Zahlungen zu
// Kandidaten), die Kategorie-Festlegung (matcht ihr Muster gegen beide Formen) und die
// Merkmalsbildung des Klassifikators (baut daraus ihr Empfänger-Merkmal).
//
// Solange er im Vertragsordner lag, importierten `kategorien/` und `klassifikator/` aus
// `vertraege/`. Das ist die Art Abhängigkeit, die eine Bereichsgliederung stillschweigend
// aufhebt: sie sagt "die Kategorien hängen an den Verträgen", und das stimmt nicht.

/** Rechtsformen und Füllwörter, die denselben Anbieter verschieden aussehen lassen. */
const RECHTSFORMEN = new Set([
  "gmbh", "mbh", "ag", "kg", "kgaa", "ohg", "gbr", "ug", "se", "ev", "eg",
  "co", "cokg", "ltd", "plc", "sa", "sas", "bv", "nv", "as", "ab", "oy", "inc", "llc",
  "und", "the",
]);

/**
 * Empfängername → Gruppierungsschlüssel.
 *
 * Bewusst zurückhaltend: Kleinschreibung, Umlaute auflösen, Satzzeichen und Ziffern
 * raus, Rechtsformen raus. NICHT gekürzt auf die ersten Wörter — „Petrossen Bonn" und
 * „Petrossen Bremen" würden sonst zu einem Anbieter verschmelzen, und ein falsch
 * zusammengefasster Vorschlag ist schlimmer als zwei getrennte.
 */
export function anbieterSchluessel(name: string): string {
  const roh = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const woerter = roh.split(" ").filter((w) => w && !RECHTSFORMEN.has(w) && !/^\d+$/.test(w));
  return woerter.join(" ") || roh;
}
