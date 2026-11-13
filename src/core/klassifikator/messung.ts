// Wie gemessen wird — das Protokoll, nicht das Modell.
//
// Bis 2026-11-09 zog die Messung ein Fünftel ZUFÄLLIG aus dem Bestand und prüfte daran.
// Das ist die Lehrbuchform und für Kontoauszüge die falsche, aus zwei Gründen:
//
//   • **Leakage über die Zeit.** Eine Zahlung, die jeden Monat kommt, liegt mit dem März
//     im Training und mit dem April in der Prüfung — das Modell erkennt sie wieder, und
//     die Trefferquote sagt, wie gut es AUSWENDIG kann. Beim Import ist die Lage eine
//     andere: alles, was das Modell kennt, liegt in der Vergangenheit, und es muss die
//     Zukunft einsortieren. Gemessen wird deshalb so: trainieren auf dem Älteren, prüfen
//     an den jüngsten Buchungen („temporal holdout", im Zeitreihenjargon „backtest").
//   • **Prüfen gegen die eigenen Vorschläge.** Eine automatisch gesetzte Kategorie, die
//     niemand angefasst hat, kann vom Modell selbst stammen. Daran zu messen hiesse zu
//     messen, wie sehr das Modell mit sich selbst übereinstimmt. Geprüft wird deshalb an
//     den HANDVERLESENEN Labels („gold set"), sofern genug davon in der Prüfzeit liegen.
//     Trainiert wird weiter auf allem — dort schadet ein automatisches Label wenig und
//     fehlendes Material viel.
//
// Und die Vergleichslinie „immer die häufigste Kategorie" ist zu schwach, um ein Modell
// zu rechtfertigen: jedes schlägt sie. Die Frage, die zählt, ist, ob es besser ist als
// das, was man ohne Modell bauen würde — „dieselbe Kategorie wie beim letzten Mal bei
// diesem Empfänger". Die steht deshalb als zweite Linie daneben.

import type { Beispiel, Bewertung } from "./modell";

/** Ergebnis einer zeitlichen Aufteilung. */
export interface ZeitlicheAufteilung {
  readonly training: Beispiel[];
  readonly pruefung: Beispiel[];
  /** Das Datum der ersten geprüften Buchung — ab hier „Zukunft". */
  readonly stichtag?: string;
}

/**
 * Teilt nach der Zeit: die jüngsten `pruefanteil` der Beispiele werden geprüft, alles
 * davor trainiert.
 *
 * Beispiele ohne Datum gehen ins Training — über sie lässt sich nicht sagen, ob sie in
 * der Zukunft lägen. Bei gleichem Datum entscheidet die Eingangsreihenfolge, damit
 * dasselbe Material dieselbe Aufteilung ergibt.
 */
export function zeitlichAufteilen(
  beispiele: readonly Beispiel[],
  pruefanteil = 0.2,
  /** Wie viel vom ENDE abgeschnitten wird, bevor geteilt wird — für Rückblick-Falten. */
  abschnittEnde = 0,
): ZeitlicheAufteilung {
  const datiert = beispiele
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.datum !== undefined)
    .sort((x, y) => (x.b.datum! < y.b.datum! ? -1 : x.b.datum! > y.b.datum! ? 1 : x.i - y.i));
  const ohneDatum = beispiele.filter((b) => b.datum === undefined);

  const ende = datiert.length - Math.floor(datiert.length * abschnittEnde);
  const grenze = ende - Math.floor(datiert.length * pruefanteil);
  const training = [...ohneDatum, ...datiert.slice(0, Math.max(0, grenze)).map(({ b }) => b)];
  const pruefung = datiert.slice(Math.max(0, grenze), ende).map(({ b }) => b);
  return { training, pruefung, stichtag: pruefung[0]?.datum };
}

/** Woran geprüft wird. */
export type Pruefmenge = "handverlesen" | "alle";

/**
 * Ab so vielen handverlesenen Zeilen in der Prüfzeit wird NUR an ihnen gemessen.
 *
 * Darunter wäre die Zahl Zufall — eine Handvoll Korrekturen, und jede einzelne verschiebt
 * die Quote um Prozentpunkte. Dann lieber an allen messen und das dazusagen.
 */
export const HANDVERLESEN_AB = 30;

/** Wählt die Prüfmenge: die handverlesenen Zeilen, wenn es genug davon gibt. */
export function pruefmengeWaehlen(
  pruefung: readonly Beispiel[],
): { beispiele: Beispiel[]; art: Pruefmenge } {
  const gold = pruefung.filter((b) => b.handverlesen);
  return gold.length >= HANDVERLESEN_AB
    ? { beispiele: gold, art: "handverlesen" }
    : { beispiele: [...pruefung], art: "alle" };
}

/** Das Präfix des ganzen Empfängernamens — siehe `merkmale.ts`. */
const EMPFAENGER = "emp=";

/**
 * Die zweite Vergleichslinie: dieselbe Kategorie wie beim Empfänger zuletzt üblich.
 *
 * Genauer: die häufigste Kategorie dieses Empfängers im Training; kennt das Training ihn
 * nicht oder fehlt der Name, die häufigste überhaupt. Das ist die Nachschlagetabelle, die
 * man ohne jedes Modell bauen würde — und an ihr muss sich das Modell messen lassen.
 *
 * `abdeckung` sagt, für welchen Anteil der Prüfmenge der Empfänger bekannt war. Liegt sie
 * hoch und die Linie nah am Modell, lebt das Modell vom Wiedererkennen; der Abstand zeigt,
 * was es darüber hinaus kann — bei Unbekannten und bei Empfängern mit mehreren Kategorien.
 */
export function empfaengerLinie(
  training: readonly Beispiel[],
  pruefung: readonly Beispiel[],
): { genauigkeit: number; abdeckung: number } | null {
  if (training.length === 0 || pruefung.length === 0) return null;

  const zaehle = (karte: Map<string, number>, k: string) => karte.set(k, (karte.get(k) ?? 0) + 1);
  /** Bei Gleichstand alphabetisch — sonst hinge die Linie an der Reihenfolge. */
  const haeufigste = (karte: ReadonlyMap<string, number>) =>
    [...karte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  const gesamt = new Map<string, number>();
  const jeEmpfaenger = new Map<string, Map<string, number>>();
  for (const b of training) {
    zaehle(gesamt, b.kategorieId);
    const emp = b.merkmale.find((m) => m.startsWith(EMPFAENGER));
    if (!emp) continue;
    let karte = jeEmpfaenger.get(emp);
    if (!karte) jeEmpfaenger.set(emp, (karte = new Map()));
    zaehle(karte, b.kategorieId);
  }
  const rueckfall = haeufigste(gesamt);
  const tabelle = new Map([...jeEmpfaenger].map(([emp, karte]) => [emp, haeufigste(karte)]));

  let richtig = 0;
  let bekannt = 0;
  for (const b of pruefung) {
    const emp = b.merkmale.find((m) => m.startsWith(EMPFAENGER));
    const nachgeschlagen = emp ? tabelle.get(emp) : undefined;
    if (nachgeschlagen !== undefined) bekannt++;
    if ((nachgeschlagen ?? rueckfall) === b.kategorieId) richtig++;
  }
  return { genauigkeit: richtig / pruefung.length, abdeckung: bekannt / pruefung.length };
}

/** Precision, Recall und F1 einer Kategorie. */
export interface Klassenwert {
  readonly kategorieId: string;
  /** Wie oft die Kategorie in der Prüfmenge wirklich vorkam („support"). */
  readonly anzahl: number;
  /** Wie oft das Modell sie vorhergesagt hat. */
  readonly vorhergesagt: number;
  /**
   * Von dem, was das Modell so nannte, war wie viel richtig. `null`, wenn es die Kategorie
   * nie vorhergesagt hat — 0 wäre eine Behauptung über Vorhersagen, die es nicht gab.
   */
  readonly precision: number | null;
  /** Von dem, was wirklich diese Kategorie war, hat es wie viel erkannt. */
  readonly recall: number | null;
  readonly f1: number | null;
}

export interface Klassenkennzahlen {
  readonly jeKategorie: readonly Klassenwert[];
  /**
   * Mittel der F1-Werte über alle Kategorien, die in der Prüfmenge vorkommen — jede zählt
   * gleich, ob sie fünfmal vorkommt oder fünfhundertmal.
   *
   * Das ist das Gegengewicht zur Genauigkeit: die wird von den häufigen Kategorien
   * getragen, und ein Modell, das alle seltenen verfehlt, sieht dort trotzdem gut aus.
   * Im Macro-F1 kostet jede verfehlte Kategorie gleich viel.
   */
  readonly macroF1: number | null;
}

/** Leitet Precision, Recall und F1 aus einer Bewertung ab — aus Diagonale und Spalten. */
export function klassenwerte(b: Bewertung): Klassenkennzahlen {
  const vorhergesagt = new Map<string, number>();
  for (const k of b.jeKategorie) vorhergesagt.set(k.kategorieId, k.richtig);
  for (const v of b.verwechslungen) vorhergesagt.set(v.vorhergesagt, (vorhergesagt.get(v.vorhergesagt) ?? 0) + v.anzahl);

  const ids = new Set([...b.jeKategorie.map((k) => k.kategorieId), ...vorhergesagt.keys()]);
  const wert = new Map(b.jeKategorie.map((k) => [k.kategorieId, k]));
  const jeKategorie: Klassenwert[] = [...ids].map((kategorieId) => {
    const richtig = wert.get(kategorieId)?.richtig ?? 0;
    const anzahl = wert.get(kategorieId)?.gesamt ?? 0;
    const vor = vorhergesagt.get(kategorieId) ?? 0;
    const precision = vor > 0 ? richtig / vor : null;
    const recall = anzahl > 0 ? richtig / anzahl : null;
    const f1 =
      precision === null || recall === null
        ? null
        : precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall);
    return { kategorieId, anzahl, vorhergesagt: vor, precision, recall, f1 };
  });
  // Schwächste zuerst, wie `jeKategorie` der Bewertung — dort lohnt das Nachsehen.
  jeKategorie.sort((a, b) => (a.f1 ?? -1) - (b.f1 ?? -1) || b.anzahl - a.anzahl || a.kategorieId.localeCompare(b.kategorieId));

  // Über die Kategorien, die WIRKLICH vorkommen. Eine, die nur als falsche Vorhersage
  // auftaucht, hat keinen Recall; ihr Fehler steckt bereits in der Precision der anderen.
  const vorhanden = jeKategorie.filter((k) => k.anzahl > 0);
  const macroF1 = vorhanden.length
    ? vorhanden.reduce((s, k) => s + (k.f1 ?? 0), 0) / vorhanden.length
    : null;
  return { jeKategorie, macroF1 };
}

/** Ein Fach der Kalibrierung: alle Vorhersagen mit einer Sicherheit in [von, bis). */
export interface Kalibrierungsfach {
  readonly von: number;
  readonly bis: number;
  readonly anzahl: number;
  /** Mittlere angegebene Sicherheit in diesem Fach. */
  readonly sicherheit: number;
  /** Wie oft das Modell in diesem Fach tatsächlich richtig lag. */
  readonly genauigkeit: number;
}

/** Ab welcher Sicherheit wie viel abgedeckt ist und wie genau es dort ist. */
export interface Schwellenwert {
  readonly schwelle: number;
  /** Anteil der Prüfmenge mit mindestens dieser Sicherheit. */
  readonly abdeckung: number;
  /** Genauigkeit innerhalb dieses Anteils. `null`, wenn er leer ist. */
  readonly genauigkeit: number | null;
}

export interface Kalibrierung {
  readonly faecher: readonly Kalibrierungsfach[];
  /**
   * Expected Calibration Error: im Mittel, um wie viel die angegebene Sicherheit von der
   * tatsächlichen Trefferquote abweicht (gewichtet nach Fachgrösse). 0 heisst: wenn das
   * Modell „80 %" sagt, liegt es in 80 % der Fälle richtig.
   */
  readonly ece: number;
  /**
   * Die Abdeckungskurve. Das Modell legt sich immer fest (so entschieden); die Kurve sagt
   * trotzdem, welchem Teil seiner Vorschläge man trauen kann — und damit, welche Zeilen
   * eine Durchsicht zuerst verdienen.
   */
  readonly schwellen: readonly Schwellenwert[];
}

const SCHWELLEN = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];

/**
 * Wie gut die Sicherheit des Modells zu seiner Trefferquote passt.
 *
 * Eine Softmax-Wahrscheinlichkeit ist ab Werk KEINE kalibrierte Wahrscheinlichkeit — ein
 * lineares Modell mit vielen seltenen Wörtern neigt zur Übersicherheit. Ob die Zahl
 * „92 % sicher" in der Review etwas taugt, sagt erst dieser Vergleich.
 */
export function kalibrierung(b: Bewertung, faecher = 10): Kalibrierung | null {
  const v = b.vorhersagen;
  if (v.length === 0) return null;

  const fach = Array.from({ length: faecher }, (_, i) => ({ von: i / faecher, bis: (i + 1) / faecher, n: 0, s: 0, r: 0 }));
  for (const x of v) {
    const i = Math.min(faecher - 1, Math.floor(x.sicherheit * faecher));
    fach[i].n++;
    fach[i].s += x.sicherheit;
    if (x.treffer) fach[i].r++;
  }
  const belegt = fach.filter((f) => f.n > 0);
  const ece = belegt.reduce((s, f) => s + (f.n / v.length) * Math.abs(f.s / f.n - f.r / f.n), 0);

  const schwellen = SCHWELLEN.map((schwelle) => {
    const drin = v.filter((x) => x.sicherheit >= schwelle);
    return {
      schwelle,
      abdeckung: drin.length / v.length,
      genauigkeit: drin.length ? drin.filter((x) => x.treffer).length / drin.length : null,
    };
  });

  return {
    faecher: belegt.map((f) => ({ von: f.von, bis: f.bis, anzahl: f.n, sicherheit: f.s / f.n, genauigkeit: f.r / f.n })),
    ece,
    schwellen,
  };
}
