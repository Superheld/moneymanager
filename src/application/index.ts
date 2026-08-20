// Die Import-Fläche der Anwendungsschicht — alles, was ein Screen sehen darf.
//
// `adapters/ui/` importiert weder `core/` noch `adapters/persistence/` (CLAUDE.md,
// geprüft in `src/architektur.test.ts`). Was ein Screen braucht, kommt
// von hier. Die Datei zieht dabei eine Linie, und die ist der ganze Punkt:
//
//   VOKABULAR wird durchgereicht — Domänentypen und wertfreie Helfer. Ein Typ trifft
//   keine Entscheidung, `geldFormatieren` auch nicht; sie zu kapseln wäre Zeremonie
//   ohne Gegenwert.
//
//   ENTSCHEIDUNGEN nicht — alles, was AUSWÄHLT oder RECHNET (`budgetStand`,
//   `kontoRegister`, `kategorieAggregat`, `monatsAusblicke` …) liegt hinter einem
//   Use-Case, auch beim reinen Lesen. Wer eine solche Funktion hier vermisst, sucht in
//   Wahrheit eine Sicht, die es noch nicht gibt.
//
// Warum so streng: bis 2026-08-19 galt die Regel nur fürs Schreiben. Beim Lesen holte
// sich jeder Screen seine Rohteile selbst — und „welche Buchung zählt gegen ein Budget"
// war dadurch an drei Stellen erfunden und an der vierten vergessen. Dieselbe Übersicht
// zeigte für dasselbe Budget gleichzeitig null Verbrauch und einen überschrittenen Rahmen.

// ---------------------------------------------------------------------------
// Vokabular: sämtliche Domänentypen. `export type *` reicht ausschliesslich Typen
// durch — Funktionen kommen so nicht mit, die Linie hält sich also von selbst.
// ---------------------------------------------------------------------------
export type * from "../core";

// ---------------------------------------------------------------------------
// Vokabular: wertfreie Helfer und Konstanten. Formatieren, umrechnen, benennen —
// nichts davon wählt aus. Diese Liste ist bewusst explizit: was hinzukommt, ist eine
// Entscheidung, kein Automatismus.
// ---------------------------------------------------------------------------
export {
  // Geld: formatieren und parsen, immer über die Währungs-/Locale-Schicht
  geldFormatieren,
  geldFormatierenMitSymbol,
  parseBetrag,
  minorZuMajor,
  majorZuMinor,
  centZuEuro,
  euroZuCent,
  istCent,
  // Währung und Region
  waehrungssymbol,
  waehrungNachCode,
  REGIONEN,
  STANDARD_REGION,
  STANDARD_WAEHRUNG,
  // Datum: reine String-Arithmetik auf ISO-Daten
  toIso,
  parseIso,
  addTage,
  addMonate,
  monateZwischen,
  // Abgeleitete Eigenschaften EINES Objekts. Die Grenze läuft hier an der Frage, ob
  // etwas über eine SAMMLUNG geht: `monatsRuecklage(gegenstand)` ist Wiederbeschaffung
  // durch Nutzungsdauer und kann gar nichts auswählen. `ruecklagenDeckung(alle, …)`
  // dagegen verteilt Kontostände über alle Gegenstände — das ist eine Sicht.
  monatsRuecklage,
  // Baum-Auskünfte über die Kategorien: sie ordnen ein, sie wählen nicht aus.
  hauptkategorie,
  // Aus EINER Bewertung abgeleitet, keine Auswahl über den Bestand.
  verwechslungsmatrix,
  herkunftVon,
  // Eigenschaften EINER Buchung bzw. EINES Empfängernamens.
  istGeteilt,
  musterVorschlag,
  anbieterSchluessel,
  // Aufzählungen, die die UI als Auswahl anbietet
  KONTOTYPEN,
  MERKMALSHERKUENFTE,
  RHYTHMUS_MONATE,
  // Fehler mit fachlichem Schlüssel — die UI übersetzt ihn
  FachlicherFehler,
} from "../core";

// ---------------------------------------------------------------------------
// Use-Cases. Schreibend wie lesend.
// ---------------------------------------------------------------------------
export {
  budgetuebersichtLaden,
  budgetstaende,
  budgetPostenZu,
  vertragsBuchungenLaden,
  type Budgetstand,
  type Budgetuebersicht,
  type BudgetsichtDeps,
  budgetbereichLaden,
  budgetLoeschen,
  type Budgetbereich,
  type BudgetbereichDeps,
} from "./budgetsichten";
export { budgetAnlegen, type BudgetEingabe } from "./budgetAnlegen";
export {
  budgetvorschlaegeLaden,
  budgetvorschlagIgnorieren,
  ignorierteBudgetvorschlaege,
} from "./budgetvorschlaege";
export {
  vertraegeLaden,
  type Vertragssicht,
  type Vertragszeile,
  type Vertragskennzahlen,
  type VertragsichtDeps,
  erkennungProbieren,
  type Erkennungsprobe,
} from "./vertragssichten";
export {
  vertragAnlegen,
  vertragAktualisieren,
  vertragLoeschen,
  type VertragEingabe,
  type VertragErgebnis,
} from "./vertragAnlegen";
export { zahlungsspuren } from "./zahlungsspuren";
export { zuordnungenAbgleichen, zuordnungVonHand } from "./vertragszuordnung";
export { vorschlagIgnorieren as vertragsvorschlagIgnorieren } from "./vertragsvorschlaege";
export {
  kontenLaden,
  registerSicht,
  ABRUF_QUELLEN,
  type Kontensicht,
  type Kontozeile,
  type Registersicht,
  type Registerzeile,
  type KontenDeps,
} from "./kontensichten";
export {
  entwurfVerdacht,
  stapelVerdacht,
  freigabeSchluessel,
  freigegebenePaare,
  type Dublettenfreigabe,
  type Dublettenverdacht,
} from "./dublettensicht";
export { dublettenFreigeben, dublettenFreigabeAufheben } from "./dublettenFreigabe";
export {
  anfangsbestandAbgleichen,
  kontostandFesthalten,
  type Abgleichergebnis,
} from "./kontostandAnker";
export { buchungErfassen, type BuchungEingabe } from "./buchungErfassen";
export { umbuchungErfassen } from "./umbuchungErfassen";
export { postenBezahltMarkieren, bezahltZuruecknehmen } from "./bezahltMarkieren";
export {
  buchungenSammelbearbeiten,
  buchungenLoeschen,
  type SammelAenderung,
} from "./buchungenSammelbearbeiten";
export {
  analyseLaden,
  analyseFenster,
  analyseVerlauf,
  analyseAufschluesselung,
  analyseGruppen,
  analyseBuchungen,
  type Analysebasis,
  type Analysezeile,
  type AnalyseDeps,
  type Zeitraum,
} from "./analysesichten";
export {
  inventarLaden,
  type Inventarsicht,
  type InventarDeps,
} from "./inventarsichten";
export {
  inventarAnlegen,
  inventarAktualisieren,
  inventarErsetzt,
  inventarLoeschen,
  type InventarEingabe,
} from "./inventarAnlegen";
export {
  stammdatenLaden,
  type Stammdaten,
  type StammdatenDeps,
  type Kontostand,
} from "./stammdatensichten";
export {
  personAnlegen,
  kontoAnlegen,
  kategorieAnlegen,
  type PersonEingabe,
  type KontoEingabe,
  type KategorieEingabe,
} from "./stammdatenAnlegen";
export { standardkategorienAnlegen } from "./standardkategorien";
export type { Bankkonto, Bankzugang, TanHerausforderung, TanFrager } from "./fints/abrufPort";
export type { Kontozuordnung } from "./fints/bankzugangPort";
export type { AbrufBefund } from "./fints/abrufAusfuehren";
export {
  STANDARD_EINSTELLUNGEN,
  einstellungenLaden,
  regionWaehlen,
  type Haushaltseinstellungen,
} from "./einstellungen";
export {
  uebersichtLaden,
  waehlbareMonate,
  type Uebersichtsdaten,
  type UebersichtDeps,
} from "./uebersicht";
