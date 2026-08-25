// Wie hoch ein aufgeklappter Bereich höchstens wird.
//
// **Warum es überhaupt eine Grenze braucht.** Ein Aufklappbereich steht IN einer Liste,
// und was er zeigt, ist unbegrenzt lang: die Buchungen einer Kategorie über zwei Jahre,
// die Unterkategorien einer Hauptgruppe. Ohne Deckel schiebt ein einziger Klick alles
// darunter aus dem Bild — auch die Zeile, die man als Nächstes aufklappen wollte, und die
// Zeile, die man gerade zugeklappt hat. Man verliert die Stelle, von der man ausgegangen
// ist, und scrollt danach zurück statt weiter.
//
// **Warum die Zahl in ZEILEN steht und nicht in Pixeln.** Ein Deckel soll sagen „hier ist
// mehr, als hineinpasst", und das liest man an angeschnittenen Zeilen ab — an einer
// Pixelhöhe nicht. Die Höhe einer Zeile weiss nur die Stelle, die sie zeichnet; die kommt
// deshalb von dort, die ANZAHL steht hier.
//
// **Zwei Zahlen, weil es zwei Breiten gibt.** Eine Tabelle über die volle Kartenbreite
// trägt fünf Spalten und vertraegt zehn Zeilen, ohne die Karte zu sprengen. Eine Liste in
// einer halb so breiten Karte steht neben einer zweiten, die dabei mitwächst — dort sind
// zehn Zeilen schon der ganze Bildschirm. Die Grenze folgt also der Breite und nicht der
// Art des Inhalts.

/** Aufgeklappte Tabelle über die volle Breite — zehn Zeilen, dann wird gescrollt. */
export const AUFKLAPP_ZEILEN_BREIT = 10;

/** Aufgeklappte Liste in einer schmalen Karte — fünf Zeilen, dann wird gescrollt. */
export const AUFKLAPP_ZEILEN_SCHMAL = 5;

/**
 * Die Höhe für so viele Zeilen, in Pixeln.
 *
 * `kopfhoehe` ist für Tabellen: deren Kopfzeile bleibt beim Scrollen stehen (`sticky`) und
 * gehört deshalb ZUSÄTZLICH in den Deckel — sonst zeigt die Tabelle neun Zeilen und eine
 * Überschrift, wo zehn Zeilen gemeint waren.
 */
export function aufklappHoehe(zeilen: number, zeilenhoehe: number, kopfhoehe = 0): number {
  return kopfhoehe + zeilen * zeilenhoehe;
}
