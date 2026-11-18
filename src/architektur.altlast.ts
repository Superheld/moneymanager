// Die Altlast der Rangfolge: Bezüge, die heute gegen die Rangfolge der Bereiche verstossen
// und (noch) bleiben dürfen. Die Regel selbst steht in `architektur.test.ts` (`RANG`), ihr
// Grund in der `CLAUDE.md` des Projekts unter „Zwischen den Bereichen gibt es eine Rangfolge".
//
// Warum eine eigene Datei: die Liste ist lang, und im Test verdeckte sie die Regel. Hier
// steht sie nach Bereichspaar gruppiert, je Gruppe ein Satz, wie der Abbau aussieht — der
// Messbericht dazu liegt in der Doku ausserhalb des Repos, dieser Satz muss für sich stehen.
//
// Wie sie gehalten wird (geprüft im Test):
//
// - Ein Eintrag ist `quelldatei → zieldatei`, Pfade relativ zu `src/` mit `/`. Ein weiterer
//   Name aus DERSELBEN Zieldatei bricht nichts; ein Bezug auf eine ANDERE Datei des
//   höheren Bereichs ist ein neuer Verstoss und macht den Test rot.
// - Ein Eintrag, der nichts mehr verletzt, macht den Test ebenfalls rot. Wer eine Datei
//   umzieht, streicht ihre Einträge hier — die Liste wird mit jedem Umzug kürzer, und ein
//   abgebauter Bezug kann nicht still zurückkommen.
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

export const RANG_ALTLAST: readonly AltlastGruppe[] = [
  {
    von: "konten",
    auf: "buchung",
    abbau:
      "Die Oberfläche des Kontoauszugs liegt in `ui/kontoauszug/`. Übrig sind seine Sichten " +
      "der Anwendung: sie ziehen bereichsübergreifend direkt in den Ordner ihrer Schicht " +
      "(`kontensichten`, `abgleichsicht`, `kontobelegung`); " +
      "`kontostand` und `kontoregister` rechnen über Buchungen je Konto und gehören zu " +
      "`buchung`; `liquiditaet` wägt Konto gegen Budgetlast ab und gehört direkt nach `src/core/`; " +
      "der Typ `Klassenstand` gehört zum Konto.",
    eintraege: [
      "application/konten/abgleichsicht.ts → core/buchung/istbuchung.ts",
      "application/konten/kontensichten.ts → application/buchung/belegZuBuchung.ts",
      "application/konten/kontensichten.ts → application/buchung/buchungszeile.ts",
      "application/konten/kontensichten.ts → core/buchung/istbuchung.ts",
      "application/konten/kontobelegung.ts → core/buchung/istbuchung.ts",
      "core/konten/kontobelegung.ts → core/buchung/istbuchung.ts",
      "core/konten/kontoregister.ts → core/buchung/istbuchung.ts",
      "core/konten/kontoregister.ts → core/buchung/projektion.ts",
      "core/konten/kontostand.ts → core/buchung/istbuchung.ts",
      "core/konten/liquiditaet.ts → core/buchung/istbuchung.ts",
      "core/konten/liquiditaet.ts → core/buchung/projektion.ts",
    ],
  },
  {
    von: "konten",
    auf: "fints",
    abbau:
      "Die Oberfläche ist abgebaut (Bankzugänge in `ui/fints/`, die Kontenverwaltung in " +
      "`ui/kontenverwaltung/`). Übrig sind die Sichten der Anwendung (siehe konten → buchung).",
    eintraege: [
      "application/konten/abgleichsicht.ts → application/fints/bankzugangPort.ts",
      "application/konten/kontensichten.ts → application/fints/bankzugangPort.ts",
    ],
  },
  {
    von: "konten",
    auf: "import",
    abbau:
      "Die Oberfläche ist abgebaut (`HerkunftBereich` in `bausteine/`, `KontoAnlegenModal` in " +
      "`ui/kontenverwaltung/`). Übrig sind `herkunftsicht` und `kontensichten`: sie ziehen " +
      "Konto, Beleg und Buchung zusammen und gehören direkt nach `src/application/`.",
    eintraege: [
      "application/konten/herkunftsicht.ts → application/import/importLauf.ts",
      "application/konten/herkunftsicht.ts → application/import/umsatz.ts",
      "application/konten/kontensichten.ts → application/import/importLauf.ts",
      "application/konten/kontensichten.ts → application/import/umsatz.ts",
    ],
  },
  {
    von: "konten",
    auf: "ruecklagen",
    abbau:
      "`kontobelegung` der Anwendung holt Rücklagen UND Budgets und wägt ab: direkt nach `src/application/`, " +
      "mit ihm `kontensichten`.",
    eintraege: [
      "application/konten/kontensichten.ts → application/ruecklagen/ruecklagenbestand.ts",
      "application/konten/kontobelegung.ts → application/ruecklagen/ruecklagenbestand.ts",
      "application/konten/kontobelegung.ts → core/ruecklagen/ruecklage.ts",
    ],
  },
  {
    von: "konten",
    auf: "vertraege",
    abbau:
      "Übrig sind die Sichten der Anwendung (siehe konten → buchung).",
    eintraege: [
      "application/konten/kontensichten.ts → application/vertraege/vertragszuordnung.ts",
      "application/konten/kontobelegung.ts → application/vertraege/vertragszuordnung.ts",
    ],
  },
  {
    von: "konten",
    auf: "budgets",
    abbau:
      "`liquiditaet` (Kern) und `kontobelegung` (Anwendung) wägen Konto gegen Budget ab und " +
      "gehören direkt nach `src/core/` bzw. `src/application/`.",
    eintraege: [
      "application/konten/kontobelegung.ts → core/budgets/budget.ts",
      "core/konten/liquiditaet.ts → core/budgets/budget.ts",
    ],
  },
  {
    von: "konten",
    auf: "depot",
    abbau:
      "Der Depotauszug liegt mit dem Kontoauszug in `ui/kontoauszug/`; übrig ist " +
      "`kontensichten`, das direkt nach `src/application/` zieht.",
    eintraege: [
      "application/konten/kontensichten.ts → application/depot/depotsichten.ts",
    ],
  },
  {
    von: "konten",
    auf: "dubletten",
    abbau:
      "Übrig sind die Sichten der Anwendung (siehe konten → buchung).",
    eintraege: [
      "application/konten/kontensichten.ts → application/dubletten/dublettensicht.ts",
    ],
  },
];
