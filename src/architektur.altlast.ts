// Die Altlast der Rangfolge: Bezüge, die gegen die Rangfolge der Bereiche verstossen und
// (noch) bleiben dürfen. Die Regel selbst steht in `architektur.test.ts` (`RANG`), ihr
// Grund in der `CLAUDE.md` des Projekts unter „Zwischen den Bereichen gibt es eine Rangfolge".
//
// **Sie ist leer.** Jeder Bezug im Code folgt der Rangfolge; solange der Abbau lief, stand
// die Restschuld hier, nach Bereichspaar gruppiert, je Gruppe ein Satz, wie der Abbau
// aussieht.
//
// Sie bleibt stehen, aus demselben Grund wie die leere `ALTLAST` der Schichtgrenzen: sie
// benennt den Ausnahmefall, falls es je wieder einen gibt, und der Test hält sie ehrlich.
// Wie sie gehalten wird (geprüft im Test):
//
// - Ein Eintrag ist `quelldatei → zieldatei`, Pfade relativ zu `src/` mit `/`. Ein weiterer
//   Name aus DERSELBEN Zieldatei bricht nichts; ein Bezug auf eine ANDERE Datei des
//   höheren Bereichs ist ein neuer Verstoss und macht den Test rot.
// - Ein Eintrag, der nichts mehr verletzt, macht den Test ebenfalls rot. Wer eine Datei
//   umzieht, streicht ihre Einträge hier — ein abgebauter Bezug kann nicht still
//   zurückkommen.
// - Jeder Eintrag steht in der Gruppe seines Paares; sonst stimmte der Satz darüber nicht.
//
// Neue Einträge gehören nicht hinein: was neu gebaut wird, wird gleich richtig gebaut.

export interface AltlastGruppe {
  /** Der Bereich, aus dem bezogen wird. */
  readonly von: string;
  /** Der gleich- oder höherrangige Bereich, auf den er sich bezieht. */
  readonly auf: string;
  /** Was zu tun ist, damit die Gruppe verschwindet. */
  readonly abbau: string;
  readonly eintraege: readonly string[];
}

export const RANG_ALTLAST: readonly AltlastGruppe[] = [];
