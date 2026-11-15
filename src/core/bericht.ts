// Der Bericht — ein abgeschlossener Monat oder ein Kalenderjahr auf einem Blatt:
// Ergebnis, Weg zum Konto, Vermögen.
//
// Hier wird NICHTS neu gerechnet, was es nicht schon gibt. Die Monate kommen fertig aus
// der Ergebnisrechnung (`ergebnis.ts`), die Bestände aus `nettovermoegen`
// (`vermoegen/vermoegen.ts`). Was diese Datei hinzufügt, ist allein das ZUSAMMENZÄHLEN
// über mehrere Monate und der Vergleich mit dem Zeitraum davor. Sie steht deshalb neben
// `ergebnis.ts` und nicht darin — dieselbe Überlegung wie bei `reichweite.ts`: sie liest
// die Zeilen nur.
//
// Drei Regeln, die hier entschieden werden:
//
//   • EIN JAHR IST DIE SUMME SEINER ZWÖLF MONATE, auch in der Überleitung. Jeder Monat
//     geht für sich exakt auf die Änderung der Kontostände auf; eine Summe von Monaten,
//     die jeweils aufgehen, geht ebenfalls auf. Ein Jahr eigens zu rechnen (etwa die
//     Periodisierung über das ganze Jahr) wäre eine zweite Rechnung, die von den
//     Monatskarten weglaufen könnte — derselbe Monat soll überall dieselbe Zahl tragen.
//   • NUR VOLL ERFASSTE ZEITRÄUME. Ein Monat vor dem ersten Import kostete in der
//     Rechnung nichts; ein Bericht darüber sähe glänzend aus und wäre falsch. Wählbar ist
//     deshalb, was `reichweitenMonate` als voll erfasst kennt, und ein Jahr nur, wenn alle
//     zwölf Monate es sind. Ein angefangenes Jahr gegen ein volles verglichen wäre kein
//     Vergleich.
//   • DER VERGLEICH FEHLT, statt zu lügen. Ist der Zeitraum davor nicht voll erfasst,
//     gibt es keine zweite Spalte (`vorher: null`) — eine Null dort hiesse „damals hat
//     nichts gekostet".

import type { Cent } from "./basis/geld";
import { addMonate, addTage, monateZwischen, parseIso, toIso } from "./basis/datum";
import type { IstBuchung } from "./buchung/istbuchung";
import type { ErgebnisZeileId, MonatsErgebnis, Ueberleitung, UeberleitungId } from "./ergebnis";
import { reichweitenMonate } from "./reichweite";
import { nettovermoegen, type Nettovermoegen, type VermoegensEingabe } from "./vermoegen/vermoegen";

export type Berichtsart = "monat" | "jahr";

/** Was gewählt werden kann — jüngster Zeitraum zuerst. */
export interface Berichtszeitraeume {
  /** „YYYY-MM". */
  readonly monate: readonly string[];
  /** „YYYY". */
  readonly jahre: readonly string[];
}

/**
 * Die abgeschlossenen, voll erfassten Monate und die Jahre, deren zwölf Monate es alle
 * sind.
 *
 * „Voll erfasst" ist in `reichweitenMonate` schon entschieden (ab dem ersten Monat, der
 * mit seinem Ersten beginnt; der laufende zählt nicht) und wird hier nicht nachgebaut:
 * die Funktion bekommt nur ein Fenster, das bis zur ersten Buchung zurückreicht.
 */
export function berichtszeitraeume(heute: string, buchungen: readonly Pick<IstBuchung, "datum">[]): Berichtszeitraeume {
  let erste: string | undefined;
  for (const b of buchungen) if (erste === undefined || b.datum < erste) erste = b.datum;
  if (!erste || erste > heute) return { monate: [], jahre: [] };
  const anzahl = monateZwischen(erste, heute);
  const monate = reichweitenMonate(heute, buchungen, anzahl).map((m) => m.slice(0, 7)).reverse();
  const da = new Set(monate);
  const jahre = [...new Set(monate.map((m) => m.slice(0, 4)))].filter((j) => da.has(`${j}-01`) && da.has(`${j}-12`));
  return { monate, jahre };
}

/** Ein Berichtszeitraum als Fenster. */
export interface Berichtszeitraum {
  readonly art: Berichtsart;
  /** „YYYY-MM" bzw. „YYYY". */
  readonly schluessel: string;
  /** Erster Tag. */
  readonly von: string;
  /** Erster Tag NACH dem Zeitraum (exklusiv), wie `MonatsErgebnis.bis`. */
  readonly bis: string;
  /** Die Ersten seiner Monate, älteste zuerst. */
  readonly monate: readonly string[];
}

export function berichtszeitraum(art: Berichtsart, schluessel: string): Berichtszeitraum {
  const von = art === "jahr" ? `${schluessel}-01-01` : `${schluessel}-01`;
  const start = parseIso(von);
  const anzahl = art === "jahr" ? 12 : 1;
  return {
    art,
    schluessel,
    von,
    bis: toIso(addMonate(start, anzahl)),
    monate: Array.from({ length: anzahl }, (_, i) => toIso(addMonate(start, i))),
  };
}

/** Der Zeitraum davor: der Vormonat bzw. das Vorjahr. */
export function vorherigerSchluessel(art: Berichtsart, schluessel: string): string {
  if (art === "jahr") return String(Number(schluessel) - 1);
  return toIso(addMonate(parseIso(`${schluessel}-01`), -1)).slice(0, 7);
}

/** Der letzte Tag VOR dem Zeitraum und der letzte Tag in ihm — die Stichtage des Vermögens. */
export function berichtsstichtage(z: Berichtszeitraum): { anfang: string; ende: string } {
  return {
    anfang: toIso(addTage(parseIso(z.von), -1)),
    ende: toIso(addTage(parseIso(z.bis), -1)),
  };
}

// ------------------------------------------------------------------ Ergebnis

/** Ein Wert mit seinem Gegenstück aus dem Zeitraum davor. */
export interface Vergleichswert {
  readonly jetzt: Cent;
  /** `null`, wenn der Zeitraum davor nicht voll erfasst ist. */
  readonly vorher: Cent | null;
  /** jetzt − vorher; `null` ohne Vergleich. */
  readonly veraenderung: Cent | null;
}

export interface Berichtsergebnis {
  /** In der Reihenfolge der Ergebnisrechnung; nur Zeilen, die in einem der Zeiträume vorkommen. */
  readonly zeilen: readonly { readonly id: ErgebnisZeileId; readonly wert: Vergleichswert }[];
  readonly nachPflichten: Vergleichswert;
  readonly nachAlltag: Vergleichswert;
  readonly ergebnis: Vergleichswert;
}

/** Dieselbe Reihenfolge wie in `monatsErgebnis`, die ersten drei stehen immer da. */
const ZEILEN: readonly ErgebnisZeileId[] = [
  "einnahmen", "fixkosten", "laufend", "ungeplant", "abschreibungen", "vorsorge", "tilgung",
];

const summe = (werte: readonly Cent[]): Cent => werte.reduce((s, w) => s + w, 0) || 0;

function vergleich(jetzt: Cent, vorher: Cent | null): Vergleichswert {
  return { jetzt, vorher, veraenderung: vorher == null ? null : jetzt - vorher || 0 };
}

/**
 * Die Zeilen der Ergebnisrechnung über die Monate eines Zeitraums, mit dem Zeitraum
 * davor daneben.
 *
 * Summiert wird das IST. Ein künftiger Monat hat keines und gehört in keinen Bericht;
 * wer einen hereinreicht, bekommt ihn als 0 — ausgewählt wird im Aufrufer, und dort nur
 * Abgeschlossenes (`berichtszeitraeume`).
 *
 * Eine Zeile steht da, wenn sie in EINEM der beiden Zeiträume vorkommt: fiel eine
 * Rücklage weg, soll ihr Rückgang auf null sichtbar sein und nicht mit der Zeile
 * verschwinden.
 */
export function ergebnisVergleich(
  jetzt: readonly MonatsErgebnis[],
  vorher: readonly MonatsErgebnis[] | null,
): Berichtsergebnis {
  const zeilenSumme = (monate: readonly MonatsErgebnis[], id: ErgebnisZeileId) =>
    summe(monate.map((m) => m.zeilen.find((z) => z.id === id)?.ist ?? 0));
  const vorkommend = new Set([...jetzt, ...(vorher ?? [])].flatMap((m) => m.zeilen.map((z) => z.id)));
  const stufe = (wahl: (m: MonatsErgebnis) => Cent | null) =>
    vergleich(summe(jetzt.map((m) => wahl(m) ?? 0)), vorher ? summe(vorher.map((m) => wahl(m) ?? 0)) : null);

  return {
    zeilen: ZEILEN.filter((id, i) => i < 3 || vorkommend.has(id)).map((id) => ({
      id,
      wert: vergleich(zeilenSumme(jetzt, id), vorher ? zeilenSumme(vorher, id) : null),
    })),
    nachPflichten: stufe((m) => m.nachPflichten.ist),
    nachAlltag: stufe((m) => m.nachAlltag.ist),
    ergebnis: stufe((m) => m.ergebnis.ist),
  };
}

/** Die Reihenfolge der Überleitung, wie `monatsErgebnis` sie aufbaut. */
const UEBERLEITUNG: readonly UeberleitungId[] = ["raten", "entnahmen", "periodisierung", "zufuehrung", "vorsorgeEigen"];

/**
 * Die Überleitung eines Zeitraums: je Posten die Summe über die Monate.
 *
 * Sie geht EXAKT auf, und zwar ohne eigene Probe: jeder Monat endet bei der Summe seiner
 * Buchungen ohne Gegenbein (`kontoaenderung` = Ergebnis + Posten), und die Summe gleicher
 * Gleichungen ist wieder eine. `kontoaenderung` ist deshalb die Summe der monatlichen —
 * und `ergebnis + Σ posten` dieselbe Zahl, was `bericht.test.ts` gegen die Buchungen prüft.
 *
 * Ein Posten, der sich über die Monate zu null hebt (die Periodisierung eines
 * Jahresbeitrags über genau sein Jahr), fällt heraus wie im einzelnen Monat.
 */
export function ueberleitungSumme(monate: readonly MonatsErgebnis[]): Ueberleitung {
  const mit = monate.flatMap((m) => (m.ueberleitung ? [m.ueberleitung] : []));
  return {
    ergebnis: summe(mit.map((u) => u.ergebnis)),
    posten: UEBERLEITUNG.map((id) => ({
      id,
      betrag: summe(mit.map((u) => u.posten.find((p) => p.id === id)?.betrag ?? 0)),
    })).filter((p) => p.betrag !== 0),
    kontoaenderung: summe(mit.map((u) => u.kontoaenderung)),
  };
}

// ------------------------------------------------------------------ Vermögen

export type Vermoegensteil = "konten" | "depots" | "vermoegenswerte" | "schulden";

/** Ein Teil des Nettovermögens am Anfang und am Ende, als BEITRAG zum Nettovermögen. */
export interface Vermoegenszeile {
  readonly teil: Vermoegensteil | "netto";
  readonly anfang: Cent;
  readonly ende: Cent;
  readonly veraenderung: Cent;
}

export interface Vermoegensvergleich {
  readonly anfang: string;
  readonly ende: string;
  /** Konten, Depots, Vermögenswerte, Schulden, zuletzt das Nettovermögen. */
  readonly zeilen: readonly Vermoegenszeile[];
}

/**
 * Das Nettovermögen an zwei Stichtagen, Teil für Teil.
 *
 * Die Schulden stehen hier als BEITRAG, also negativ: so addiert sich die Spalte zum
 * Nettovermögen darunter, und eine sinkende Schuld steht als positive Veränderung da —
 * das Vermögen ist gewachsen. Gespeichert und in `Nettovermoegen` bleibt die Restschuld
 * positiv; gedreht wird nur hier, für diese eine Darstellung, an genau einer Stelle.
 */
export function vermoegensvergleich(e: VermoegensEingabe, anfang: string, ende: string): Vermoegensvergleich {
  const a = nettovermoegen(e, anfang);
  const b = nettovermoegen(e, ende);
  const beitrag = (n: Nettovermoegen, teil: Vermoegenszeile["teil"]): Cent =>
    teil === "schulden" ? -n.schulden || 0 : n[teil];
  return {
    anfang,
    ende,
    zeilen: (["konten", "depots", "vermoegenswerte", "schulden", "netto"] as const).map((teil) => ({
      teil,
      anfang: beitrag(a, teil),
      ende: beitrag(b, teil),
      veraenderung: beitrag(b, teil) - beitrag(a, teil) || 0,
    })),
  };
}
