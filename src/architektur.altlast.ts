// Die Altlast der Rangfolge: Bezüge, die heute gegen die Rangfolge der Bereiche verstossen
// und (noch) bleiben dürfen. Die Regel selbst steht in `architektur.test.ts` (`RANG`), ihr
// Grund in der Wurzel-`CLAUDE.md` unter „Zwischen den Bereichen gibt es eine Rangfolge".
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
      "Der Kontoauszug ist eine Sicht und zieht in die Wurzel (`kontensichten`, " +
      "`abgleichsicht`, `kontobelegung` der Anwendung, `KontenScreen` und Verwandte); " +
      "`kontostand` und `kontoregister` rechnen über Buchungen je Konto und gehören zu " +
      "`buchung`; `liquiditaet` wägt Konto gegen Budgetlast ab und gehört in die Wurzel; " +
      "der Typ `Klassenstand` gehört zum Konto.",
    eintraege: [
      "adapters/ui/konten/EinordnungsPillen.tsx → application/buchung/einordnungssicht.ts",
      "adapters/ui/konten/KontenScreen.tsx → adapters/ui/buchung/BuchungDetail.tsx",
      "adapters/ui/konten/KontenScreen.tsx → adapters/ui/buchung/DublettenVergleich.tsx",
      "adapters/ui/konten/KontenScreen.tsx → adapters/ui/buchung/SammelDialog.tsx",
      "adapters/ui/konten/KontenScreen.tsx → application/buchung/buchungenSammelbearbeiten.ts",
      "adapters/ui/konten/KontenScreen.tsx → application/buchung/pruefmarker.ts",
      "adapters/ui/konten/KontenScreen.tsx → core/buchung/istbuchung.ts",
      "adapters/ui/konten/UmbuchungModal.tsx → application/buchung/umbuchungErfassen.ts",
      "application/konten/abgleichsicht.ts → core/buchung/istbuchung.ts",
      "application/konten/kontensichten.ts → application/buchung/belegZuBuchung.ts",
      "application/konten/kontensichten.ts → application/buchung/buchungszeile.ts",
      "application/konten/kontensichten.ts → application/buchung/einordnungssicht.ts",
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
    von: "kategorien",
    auf: "klassifikator",
    abbau:
      "Das Training ist nicht der Kategorienbaum: `application/kategorien` (ohne die " +
      "Standardkategorien) und `ui/training` werden zum Bereich `klassifikator`.",
    eintraege: [
      "adapters/ui/training/ErklaerungsTafel.tsx → core/klassifikator/erklaerung.ts",
      "adapters/ui/training/KategorisierungCards.tsx → core/klassifikator/merkmale.ts",
      "adapters/ui/training/KategorisierungCards.tsx → core/klassifikator/modell.ts",
      "adapters/ui/training/MerkmaleBlock.tsx → core/klassifikator/merkmale.ts",
      "adapters/ui/training/ModellInhalt.tsx → core/klassifikator/merkmale.ts",
      "adapters/ui/training/ModellInhalt.tsx → core/klassifikator/modell.ts",
      "adapters/ui/training/WoerterInhalt.tsx → core/klassifikator/merkmale.ts",
      "adapters/ui/training/kartenteile.tsx → core/klassifikator/laeufe.ts",
      "adapters/ui/training/kartenteile.tsx → core/klassifikator/merkmale.ts",
      "application/kategorien/kategorisierungsquellen.ts → core/klassifikator/merkmale.ts",
      "application/kategorien/klassifikatorTraining.ts → core/klassifikator/laeufe.ts",
      "application/kategorien/klassifikatorTraining.ts → core/klassifikator/merkmale.ts",
      "application/kategorien/klassifikatorTraining.ts → core/klassifikator/messung.ts",
      "application/kategorien/klassifikatorTraining.ts → core/klassifikator/modell.ts",
      "application/kategorien/merkmalsbestand.ts → core/klassifikator/merkmale.ts",
      "application/kategorien/merkmalskonfiguration.ts → core/klassifikator/erklaerung.ts",
      "application/kategorien/merkmalskonfiguration.ts → core/klassifikator/merkmale.ts",
      "application/kategorien/merkmalskonfiguration.ts → core/klassifikator/modell.ts",
      "application/kategorien/trainingsmaterial.ts → core/klassifikator/merkmale.ts",
    ],
  },
  {
    von: "buchung",
    auf: "vertraege",
    abbau:
      "Der Buchungsdialog ist eine Sicht über fast alles: `buchungsdetail` und " +
      "`einordnungssicht` in die Wurzel der Anwendung, `BuchungDetail`, `SammelDialog` und " +
      "`VertragsBlock` nach `bausteine/` (er wird aus vielen Bereichen geöffnet).",
    eintraege: [
      "adapters/ui/buchung/BuchungDetail.tsx → adapters/ui/vertraege/VertragModal.tsx",
      "adapters/ui/buchung/BuchungDetail.tsx → adapters/ui/vertraege/vertragFormular.ts",
      "adapters/ui/buchung/BuchungDetail.tsx → application/vertraege/vertragszuordnung.ts",
      "adapters/ui/buchung/BuchungDetail.tsx → core/vertraege/vertrag.ts",
      "adapters/ui/buchung/BuchungDetail.tsx → core/vertraege/vertragZuordnung.ts",
      "adapters/ui/buchung/SammelDialog.tsx → application/vertraege/vertragszuordnung.ts",
      "adapters/ui/buchung/SammelDialog.tsx → core/vertraege/vertrag.ts",
      "adapters/ui/buchung/VertragsBlock.tsx → core/vertraege/vertrag.ts",
      "adapters/ui/buchung/VertragsBlock.tsx → core/vertraege/vertragZuordnung.ts",
      "application/buchung/buchungsdetail.ts → core/vertraege/vertrag.ts",
      "application/buchung/buchungsdetail.ts → core/vertraege/vertragZuordnung.ts",
      "application/buchung/einordnungssicht.ts → core/vertraege/vertrag.ts",
      "application/buchung/einordnungssicht.ts → core/vertraege/vertragZuordnung.ts",
    ],
  },
  {
    von: "konten",
    auf: "fints",
    abbau:
      "Die Bankzugangs-Oberfläche (`BankzugaengeScreen`, `Bankprofilkarte`) zieht in einen " +
      "eigenen Ordner `ui/fints`, die Kontoauszug-Sichten in die Wurzel. Offen: ob die " +
      "Bankzuordnung beim Anlegen eines Kontos (`KontoAnlegenModal`, " +
      "`KontenVerwaltungScreen`) zum Konto gehört oder ein eigener Schritt des Bankzugangs " +
      "wird.",
    eintraege: [
      "adapters/ui/konten/Bankprofilkarte.tsx → application/fints/abrufPort.ts",
      "adapters/ui/konten/BankzugaengeScreen.tsx → application/fints/abrufPort.ts",
      "adapters/ui/konten/BankzugaengeScreen.tsx → application/fints/bankprofil.ts",
      "adapters/ui/konten/BankzugaengeScreen.tsx → application/fints/bankzugangPort.ts",
      "adapters/ui/konten/KontenVerwaltungScreen.tsx → application/fints/abrufPort.ts",
      "adapters/ui/konten/KontenVerwaltungScreen.tsx → application/fints/bankzugangPort.ts",
      "adapters/ui/konten/KontoAnlegenModal.tsx → application/fints/abrufPort.ts",
      "adapters/ui/konten/KontoAnlegenModal.tsx → application/fints/bankzugangPort.ts",
      "application/konten/abgleichsicht.ts → application/fints/bankzugangPort.ts",
      "application/konten/kontensichten.ts → application/fints/bankzugangPort.ts",
    ],
  },
  {
    von: "buchung",
    auf: "ruecklagen",
    abbau:
      "Wie bei den Verträgen: der Buchungsdialog samt `RuecklagenwahlBlock` nach " +
      "`bausteine/`, `buchungsdetail` und `einordnungssicht` in die Wurzel.",
    eintraege: [
      "adapters/ui/buchung/BuchungDetail.tsx → application/ruecklagen/ruecklageZuordnen.ts",
      "adapters/ui/buchung/RuecklagenwahlBlock.tsx → application/ruecklagen/ruecklageZuordnen.ts",
      "application/buchung/buchungsdetail.ts → application/ruecklagen/ruecklageZuordnen.ts",
      "application/buchung/buchungsdetail.ts → application/ruecklagen/ruecklagenbestand.ts",
      "application/buchung/einordnungssicht.ts → core/ruecklagen/ruecklage.ts",
      "application/buchung/einordnungssicht.ts → core/ruecklagen/zuordnung.ts",
    ],
  },
  {
    von: "kategorien",
    auf: "buchung",
    abbau:
      "Das Training liest Zahlungsspuren; als `klassifikator` steht es über der Buchung, " +
      "und der Bezug ist erlaubt.",
    eintraege: [
      "adapters/ui/training/MerkmaleBlock.tsx → core/buchung/istbuchung.ts",
      "application/kategorien/kategorieAbgleich.ts → application/buchung/zahlungsspuren.ts",
      "application/kategorien/kategorieAbgleich.ts → core/buchung/zahlungsspur.ts",
      "application/kategorien/merkmalskonfiguration.ts → application/buchung/zahlungsspuren.ts",
      "application/kategorien/trainingsmaterial.ts → application/buchung/zahlungsspuren.ts",
      "application/kategorien/trainingsmaterial.ts → core/buchung/zahlungsspur.ts",
    ],
  },
  {
    von: "konten",
    auf: "import",
    abbau:
      "Die Herkunft im Kontoauszug ist eine Sicht und zieht mit ihm in die Wurzel; " +
      "`typAusName` (aus `kontoMatch`) leitet einen Kontotyp ab und gehört zu `konten`.",
    eintraege: [
      "adapters/ui/konten/HerkunftBereich.tsx → application/import/umsatz.ts",
      "adapters/ui/konten/KontoAnlegenModal.tsx → application/import/kontoMatch.ts",
      "application/konten/herkunftsicht.ts → application/import/importLauf.ts",
      "application/konten/herkunftsicht.ts → application/import/umsatz.ts",
      "application/konten/kontensichten.ts → application/import/importLauf.ts",
      "application/konten/kontensichten.ts → application/import/umsatz.ts",
    ],
  },
  {
    von: "import",
    auf: "buchung",
    abbau:
      "Verbuchen macht aus einem Beleg eine Buchung: `umsatzVerbuchen` nach `buchung`, " +
      "`vorschlag` (die Kategorisierungskette) nach `klassifikator`, `ReviewScreen` in die " +
      "Wurzel der Oberfläche.",
    eintraege: [
      "adapters/ui/import/ReviewScreen.tsx → adapters/ui/buchung/BuchungDetail.tsx",
      "adapters/ui/import/ReviewScreen.tsx → application/buchung/umbuchungenErkennen.ts",
      "application/import/umsatzVerbuchen.ts → core/buchung/istbuchung.ts",
      "application/import/vorschlag.ts → core/buchung/zahlungsspur.ts",
    ],
  },
  {
    von: "kategorien",
    auf: "import",
    abbau:
      "Mit dem Umzug des Trainings nach `klassifikator` (über dem Beleg) erlaubt.",
    eintraege: [
      "adapters/ui/training/MerkmaleBlock.tsx → application/import/umsatz.ts",
      "application/kategorien/kategorieAbgleich.ts → application/import/umsatz.ts",
      "application/kategorien/kategorieAbgleich.ts → application/import/vorschlag.ts",
      "application/kategorien/kategorisierungsquellen.ts → application/import/vorschlag.ts",
    ],
  },
  {
    von: "import",
    auf: "klassifikator",
    abbau:
      "`vorschlag` ist die Kategorisierungskette (Umbuchung → Vertrag → Quelle → Modell) " +
      "und zieht nach `klassifikator`.",
    eintraege: [
      "application/import/vorschlag.ts → core/klassifikator/erklaerung.ts",
      "application/import/vorschlag.ts → core/klassifikator/merkmale.ts",
      "application/import/vorschlag.ts → core/klassifikator/modell.ts",
    ],
  },
  {
    von: "konten",
    auf: "ruecklagen",
    abbau:
      "`kontobelegung` der Anwendung holt Rücklagen UND Budgets und wägt ab: in die Wurzel, " +
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
      "Der Kontoauszug zieht in die Wurzel (siehe konten → buchung).",
    eintraege: [
      "adapters/ui/konten/KontenScreen.tsx → core/vertraege/vertrag.ts",
      "application/konten/kontensichten.ts → application/vertraege/vertragszuordnung.ts",
      "application/konten/kontobelegung.ts → application/vertraege/vertragszuordnung.ts",
    ],
  },
  {
    von: "import",
    auf: "vertraege",
    abbau:
      "`vorschlag` nach `klassifikator`, `ReviewScreen` in die Wurzel der Oberfläche.",
    eintraege: [
      "adapters/ui/import/ReviewScreen.tsx → application/vertraege/vertragszuordnung.ts",
      "application/import/vorschlag.ts → core/vertraege/vertragZuordnung.ts",
    ],
  },
  {
    von: "konten",
    auf: "budgets",
    abbau:
      "`liquiditaet` (Kern) und `kontobelegung` (Anwendung) wägen Konto gegen Budget ab und " +
      "gehören in die Wurzel.",
    eintraege: [
      "application/konten/kontobelegung.ts → core/budgets/budget.ts",
      "core/konten/liquiditaet.ts → core/budgets/budget.ts",
    ],
  },
  {
    von: "konten",
    auf: "depot",
    abbau:
      "Der Depotauszug ist Teil des Kontoauszugs und zieht mit ihm in die Wurzel.",
    eintraege: [
      "adapters/ui/konten/DepotAuszug.tsx → application/depot/depotsichten.ts",
      "application/konten/kontensichten.ts → application/depot/depotsichten.ts",
    ],
  },
  {
    von: "konten",
    auf: "dubletten",
    abbau:
      "Der Kontoauszug zieht in die Wurzel (siehe konten → buchung).",
    eintraege: [
      "adapters/ui/konten/KontenScreen.tsx → application/dubletten/dublettensicht.ts",
      "application/konten/kontensichten.ts → application/dubletten/dublettensicht.ts",
    ],
  },
  {
    von: "stammdaten",
    auf: "kategorien",
    abbau:
      "`stammdatenAnlegen` nach Entität teilen (`kategorieAnlegen` nach `kategorien`), " +
      "`stammdatensichten` in die Wurzel.",
    eintraege: [
      "application/stammdaten/stammdatenAnlegen.ts → core/kategorien/kategorie.ts",
      "application/stammdaten/stammdatensichten.ts → core/kategorien/kategorie.ts",
    ],
  },
  {
    von: "stammdaten",
    auf: "konten",
    abbau:
      "`stammdatenAnlegen` nach Entität teilen (`kontoAnlegen` nach `konten`), " +
      "`stammdatensichten` in die Wurzel.",
    eintraege: [
      "application/stammdaten/stammdatenAnlegen.ts → core/konten/konto.ts",
      "application/stammdaten/stammdatensichten.ts → core/konten/konto.ts",
    ],
  },
  {
    von: "buchung",
    auf: "budgets",
    abbau:
      "`einordnungssicht` in die Wurzel der Anwendung.",
    eintraege: [
      "application/buchung/einordnungssicht.ts → core/budgets/budget.ts",
    ],
  },
  {
    von: "import",
    auf: "dubletten",
    abbau:
      "`ReviewScreen` in die Wurzel der Oberfläche.",
    eintraege: [
      "adapters/ui/import/ReviewScreen.tsx → application/dubletten/dublettensicht.ts",
    ],
  },
  {
    von: "kategorien",
    auf: "stammdaten",
    abbau:
      "Erledigt sich, wenn `stammdatensichten` in die Wurzel zieht.",
    eintraege: [
      "adapters/ui/training/TrainingBereich.tsx → application/stammdaten/stammdatensichten.ts",
    ],
  },
  {
    von: "stammdaten",
    auf: "buchung",
    abbau:
      "`stammdatensichten` rechnet Kontostände und gehört in die Wurzel.",
    eintraege: [
      "application/stammdaten/stammdatensichten.ts → core/buchung/istbuchung.ts",
    ],
  },
];
