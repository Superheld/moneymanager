// Use-Case „zum Prüfen vormerken" — der Marker an einer Buchung, und wie er wieder weggeht.
//
// Der Marker beantwortet keine Frage über die ZAHLUNG, sondern eine über den Nutzer: habe
// ich mir das angesehen? Deshalb steht hier auch nichts zu rechnen — er wird gesetzt und
// weggenommen, sonst nichts.
//
// Warum er trotzdem ein Use-Case ist und nicht ein Feld, das die Oberfläche direkt
// schreibt: das Setzen muss die Buchung sonst KOMPLETT durch die UI schicken und
// zurückspeichern, und dabei überschreibt ein veralteter Stand im Dialog stillschweigend
// alles andere. Hier wird nur das eine Feld angefasst, gegen den frischen Stand.
//
// Zwei Wege in der Oberfläche, absichtlich derselbe Marker: die Pille im Register (Klick
// nimmt sie weg) und die Angabe im Detail (setzen und wegnehmen). Der zweite Weg ist der
// Grund, warum der Marker an der Buchung liegt und nicht als „zuletzt gesehen"-Zeitpunkt
// in den Einstellungen: ein Zeitstempel kann nur ALLES auf einmal abräumen und niemals
// eine einzelne Zeile von Hand vormerken.

import { FachlicherFehler } from "../../core";
import type { LedgerPort } from "../ports";

/**
 * Setzt den Prüfmarker einer Buchung oder nimmt ihn weg.
 *
 * Gelesen wird vorher aus dem Ledger, nicht aus dem, was der Aufrufer glaubt zu wissen:
 * zwischen dem Öffnen eines Dialogs und dem Klick kann die Buchung woanders geändert
 * worden sein, und der Marker soll keine Kategorie mitrollen.
 */
export async function pruefmarkerSetzen(
  ledger: LedgerPort,
  istbuchungId: string,
  vorgemerkt: boolean,
): Promise<void> {
  const buchung = (await ledger.alle()).find((b) => b.id === istbuchungId);
  if (!buchung) throw new FachlicherFehler("buchung.fehlt", { id: istbuchungId });
  // `undefined` statt `false`, damit eine abgehakte Zeile wieder aussieht wie eine, die
  // den Marker nie hatte — sonst unterscheiden sich zwei gleichwertige Zustände in jedem
  // Vergleich und in jedem Test.
  await ledger.speichern({ ...buchung, zuPruefen: vorgemerkt || undefined });
}
