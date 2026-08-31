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
  // etwas über eine SAMMLUNG geht: `monatsRuecklage(ruecklage)` ist Ziel durch Frist und
  // kann gar nichts auswählen. `ruecklagenDeckung(alle, …)` dagegen verteilt
  // Kontostände über alle Rücklagen — das ist eine Sicht.
  monatsRuecklage,
  // Welche der beiden Formen eine Rücklage hat. Eine Auskunft über EIN Objekt, und die
  // Oberfläche braucht sie: an ihr hängt, welche Felder die Maske zeigt.
  hatZiel,
  // Baum-Auskünfte über die Kategorien: sie ordnen ein, sie wählen nicht aus.
  hauptkategorie,
  // Aus EINER Bewertung abgeleitet, keine Auswahl über den Bestand.
  verwechslungsmatrix,
  // Liest EIN Modell zeilenweise — reine Umformung seiner eigenen Gewichte, keine
  // Auswahl über den Bestand.
  kategorieprofile,
  herkunftVon,
  // Zerlegen und Zusammensetzen eines Tokens — reine Umformung, keine Auswahl. Die
  // Oberfläche braucht beides, weil die Ausschlussliste am nackten Wort hängt.
  wortVon,
  merkmalName,
  // Eigenschaften EINER Buchung bzw. EINES Empfängernamens.
  istGeteilt,
  // Trifft ein Muster diesen Text? Ein Vergleich, keine Auswahl — und die Oberfläche
  // braucht ihn, um zu erkennen, ob ein vorhandenes Muster einen Namen schon abdeckt.
  musterTrifft,
  anbieterSchluessel,
  // Aufzählungen, die die UI als Auswahl anbietet
  KONTOTYPEN,
  KONTOKLASSEN,
  // Ein Vorschlag ist keine Entscheidung: `klasseVorschlag` leitet aus dem Typ ab, was
  // beim Anlegen sinnvoll voreingestellt ist. Ändern kann der Nutzer es immer.
  klasseVorschlag,
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
  budgetPostenImMonat,
  budgetVerlauf,
  vertragsBuchungenLaden,
  type Budgetstand,
  type Budgetuebersicht,
  type BudgetsichtDeps,
  budgetbereichLaden,
  budgetLoeschen,
  type Budgetbereich,
  type BudgetbereichDeps,
} from "./budgets/budgetsichten";
export {
  budgetAnlegen,
  budgetBetragLoeschen,
  type BudgetEingabe,
} from "./budgets/budgetAnlegen";
export {
  budgetvorschlaegeLaden,
  budgetvorschlagIgnorieren,
  ignorierteBudgetvorschlaege,
} from "./budgets/budgetvorschlaege";
export {
  vertraegeLaden,
  type Vertragssicht,
  type Vertragszeile,
  type Vertragskennzahlen,
  type VertragsichtDeps,
  erkennungProbieren,
  type Erkennungsprobe,
} from "./vertraege/vertragssichten";
export {
  vertragAnlegen,
  vertragAktualisieren,
  vertragLoeschen,
  type VertragEingabe,
  type VertragErgebnis,
} from "./vertraege/vertragAnlegen";
export { zahlungsspuren } from "./buchung/zahlungsspuren";
export {
  historieLaden,
  buchungZuruecksetzen,
  type Buchungshistorie,
  type Rueckwegstand,
} from "./buchung/buchungshistorie";
export { pruefmarkerSetzen } from "./buchung/pruefmarker";
export { zuordnungenAbgleichen, zuordnungVonHand, vertragsnamenLaden } from "./vertraege/vertragszuordnung";
export { vorschlagIgnorieren as vertragsvorschlagIgnorieren } from "./vertraege/vertragsvorschlaege";
export {
  herkunftLaden,
  type Herkunftszeile,
  type Kontoherkunft,
  type Laufbefund,
} from "./konten/herkunftsicht";
export {
  abgleichLaden,
  type Abgleichzeile,
  type Ankerpunkt,
  type AbgleichDeps,
} from "./konten/abgleichsicht";
export {
  kontenLaden,
  registerSicht,
  ABRUF_QUELLEN,
  type Kontensicht,
  type Kontozeile,
  type Registersicht,
  type Registerzeile,
  type KontenDeps,
} from "./konten/kontensichten";
export {
  entwurfVerdacht,
  stapelVerdacht,
  freigabeSchluessel,
  freigegebenePaare,
  type Dublettenfreigabe,
  type Dublettenverdacht,
} from "./dubletten/dublettensicht";
export { dublettenFreigeben, dublettenFreigabeAufheben } from "./dubletten/dublettenFreigabe";
export {
  anfangsbestandAbgleichen,
  kontostandFesthalten,
  type Abgleichergebnis,
} from "./konten/kontostandAnker";
export { buchungErfassen, type BuchungEingabe } from "./buchung/buchungErfassen";
export { umbuchungErfassen } from "./buchung/umbuchungErfassen";
export {
  buchungenSammelbearbeiten,
  buchungenLoeschen,
  type SammelAenderung,
} from "./buchung/buchungenSammelbearbeiten";
export {
  analyseLaden,
  analyseFenster,
  analyseFensterTaggenau,
  analyseVerlauf,
  analyseAufschluesselung,
  analyseGruppen,
  analyseBuchungen,
  type Analysebasis,
  type Analysezeile,
  type AnalyseDeps,
  type Zeitraum,
  analyseBefunde,
  analyseAusblick,
  type Befunde,
  type Verlaufspunkt,
} from "./analysesichten";
export {
  depotsLaden,
  depotEntwicklung,
  type Depotdaten,
  type Depotsicht,
  type Positionszeile,
  type DepotDeps,
} from "./depot/depotsichten";
export {
  ruecklagenLaden,
  type Buchungswahl,
  type Ruecklagensicht,
  type RuecklagenDeps,
} from "./ruecklagen/ruecklagensichten";
export {
  ruecklageAnlegen,
  ruecklageAktualisieren,
  ruecklageAusbuchen,
  ruecklageLoeschen,
  type RuecklagenEingabe,
} from "./ruecklagen/ruecklagenPflege";
export {
  kontogruppeSpeichern,
  kontogruppeLoeschen,
  gruppensichten,
  type KontogruppeEingabe,
  type Gruppensicht,
  type GruppenDeps,
} from "./konten/gruppen";
export {
  stammdatenLaden,
  type Stammdaten,
  type StammdatenDeps,
  type Kontostand,
} from "./stammdaten/stammdatensichten";
export {
  personAnlegen,
  kontoAnlegen,
  kategorieAnlegen,
  type PersonEingabe,
  type KontoEingabe,
  type KategorieEingabe,
} from "./stammdaten/stammdatenAnlegen";
export { standardkategorienAnlegen } from "./kategorien/standardkategorien";
export type {
  Bankkonto,
  Bankprofil,
  Bankzugang,
  TanFrager,
  TanHerausforderung,
  TanVerfahren,
  Vorfallprofil,
  Zugangsart,
} from "./fints/abrufPort";
export type { Formatwahl, Kontozuordnung } from "./fints/bankzugangPort";
export type { AbrufBefund, Abrufergebnis, DepotBefund } from "./fints/abrufAusfuehren";
// Was das Bankprofil hergibt, wird GERECHNET — also nicht in der Oberfläche: welcher
// Speicherzeitraum gilt, wenn zwei Formate verschiedene nennen, und ob ein Konto einen
// Vorfall überhaupt darf, sind Entscheidungen mit genau einer richtigen Antwort.
export {
  alleKontenAmStueck,
  kannVorfall,
  kontoKannVorfall,
  speicherzeitraumJeFormat,
  speicherzeitraumTage,
  vorfall,
} from "./fints/bankprofil";
export {
  STANDARD_EINSTELLUNGEN,
  einstellungenLaden,
  regionWaehlen,
  type Haushaltseinstellungen,
} from "./einstellungen";
export {
  EXPERIMENTE,
  EXPERIMENTE_AUS,
  experimenteLaden,
  experimentSchalten,
  type ExperimentId,
  type Experimente,
} from "./experimente";

export { exportDateiname, type ExportZiel, type Exportart } from "./export";
export {
  konfigurationExportieren,
  inExportform,
  EXPORT_FASSUNG,
  type ExportKategorie,
  type Konfigurationsexport,
} from "./konfiguration";
export {
  bestandExportieren,
  BESTANDSEXPORT_FASSUNG,
  type Bestandsexport,
  type Bestandsquellen,
  type ExportBuchung,
  type ExportBeleg,
  type ExportKonto,
  type ExportPerson,
  type ExportVertrag,
} from "./bestandsexport";
export {
  uebersichtLaden,
  waehlbareMonate,
  VORSCHAU_TAGE,
  type Uebersichtsdaten,
  type UebersichtDeps,
} from "./uebersicht";
export {
  aktualisierungEinspielen,
  aktualisierungPruefen,
  pruefungErlaubt,
  pruefungSchalten,
  SCHLUESSEL_AKTUALISIERUNG,
  type Aktualisierung,
  type AktualisierungPort,
} from "./aktualisierung";
