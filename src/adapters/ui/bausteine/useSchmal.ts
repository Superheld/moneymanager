// Ist das Fenster schmal? Die eine Layout-Frage, die die Oberflaeche in JavaScript
// stellen muss — und die einzige, fuer die das gerechtfertigt ist.
//
// **Die Regel bleibt CSS.** In `app.css` steht die schmale Form ohne Medienabfrage da,
// die breiten kommen per `min-width` dazu; die Fensterbreite ist eine Frage, die CSS
// selbst beantwortet. Das reicht, solange sich nur das AUSSEHEN aendert.
//
// Es reicht nicht, wo sich das MARKUP aendert. Eine Tabelle mit sechs Spalten wird
// schmal zu einer mit zwei, in der die uebrigen Werte als zweite Zeile unter dem Namen
// stehen. Zellen zusammenzulegen kann CSS nicht — es kann sie nur verstecken, und das
// hiesse, ihren Inhalt wegzuwerfen statt ihn zu verschieben. Dieselbe Ueberlegung wie
// bei der Schublade in `AppShell`, nur aus dem anderen Grund: dort ist die FRAGE keine
// fuer CSS, hier ist es die ANTWORT.
//
// **Die Schwelle steht damit zweimal da**, hier und in `app.css`. Das laesst sich nicht
// vermeiden: eine Medienabfrage kann keine CSS-Variable lesen — das ist die
// Spezifikation und kein Rueckstand der Browser. Wer sie hebt, hebt sie an beiden
// Stellen; die Stufen der Navigation stehen in `ui/CLAUDE.md`.

import { useSyncExternalStore } from "react";

/** Deckungsgleich mit der ersten Stufe in `app.css` (`@media (min-width: 700px)`). */
export const SCHMAL_ABFRAGE = "(max-width: 699.98px)";

function verfuegbar(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function abonnieren(neuZeichnen: () => void): () => void {
  if (!verfuegbar()) return () => {};
  const abfrage = window.matchMedia(SCHMAL_ABFRAGE);
  abfrage.addEventListener("change", neuZeichnen);
  return () => abfrage.removeEventListener("change", neuZeichnen);
}

/**
 * Ohne `matchMedia` gilt BREIT.
 *
 * jsdom bringt es nicht mit. Ohne diesen Ausweg fiele jeder Screen-Test um, und zwar mit
 * einer Meldung, die nach der Tabelle aussieht statt nach der Umgebung. Die Vorgabe ist
 * ausserdem die konservative: die bestehenden Tests pruefen weiterhin genau das, was sie
 * bisher geprueft haben, und die schmale Form wird dort geprueft, wo sie gemeint ist
 * (`matchMedia` stellen, siehe `DataTable.test.tsx`).
 */
function lesen(): boolean {
  if (!verfuegbar()) return false;
  return window.matchMedia(SCHMAL_ABFRAGE).matches;
}

/**
 * `useSyncExternalStore` und nicht `useState` plus Effekt: der ERSTE Render muss schon
 * stimmen. Sonst zeichnet ein Telefon einmal die breite Tabelle, misst sie, und ersetzt
 * sie im naechsten Bild — sichtbar als Springen, und bei langen Listen als Ruckler.
 */
export function useSchmal(): boolean {
  return useSyncExternalStore(abonnieren, lesen, () => false);
}
