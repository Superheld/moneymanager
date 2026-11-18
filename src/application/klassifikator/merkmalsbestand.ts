// Der Wortbestand — EINE Liste über alles, was die Erkennung an Wörtern kennt.
//
// Vorher waren es drei getrennte Listen an zwei Orten: die häufigsten Merkmale, die
// häufigsten verworfenen Wörter, die Ausschlussliste. Wer ein Wort abwählte, sah es aus
// der ersten verschwinden und musste es in der dritten wiederfinden — auf einer anderen
// Karte, in anderer Sortierung, ohne die Zahlen, an denen er es eben noch beurteilt hat.
// Und wer nach einem bestimmten Wort suchte, fand es nur, wenn es zufällig unter den
// ersten fünfundzwanzig stand.
//
// Hier steht jedes Wort GENAU EINMAL, mit seinem Zustand und denselben Maßzahlen — ob es
// mitrechnet, ob es gesperrt ist, oder ob die Struktur es aussortiert hat. Ein Wechsel des
// Zustands ändert dann die Zeile, statt sie an einen anderen Ort zu verschieben.
//
// Warum das ein Use-Case ist und keine Aufbereitung in der Oberfläche: es führt drei
// Quellen zusammen und entscheidet dabei, was dasselbe Wort ist — das ist eine Auswahl
// über den Bestand. Läge sie im Screen, gäbe es sie beim nächsten Screen ein zweites Mal
// und leicht anders.

import {
  merkmalName,
  wortVon,
  type Merkmalsherkunft,
  type Verwurfsgrund,
} from "../../core";
import type { GespeicherterAusschluss } from "../ports";
import type { Materialbefund, Merkmalswert } from "./trainingsmaterial";

/**
 * Was mit einem Wort geschieht.
 *
 * `strukturell` ist der einzige Zustand, den der Nutzer nicht wechseln kann: eine
 * Referenznummer steht auf keiner Liste, sie fällt an einer Regel. Ihn trotzdem
 * anzuzeigen ist der Punkt — „was sieht das Modell von meinen Daten NICHT" ist die
 * Hälfte der Antwort auf „warum erkennt es das nicht".
 */
export type Wortzustand = "genutzt" | "gesperrt" | "strukturell";

export interface Wortzeile {
  /** Eindeutig über Herkunft und Wort — dieselbe Zeichenkette wie das Token. */
  readonly schluessel: string;
  /**
   * Die Form, unter der das Wort auf der Ausschlussliste steht. Sperren und Freigeben
   * hängen ausschliesslich an ihr.
   */
  readonly wort: string;
  /**
   * Wie das Wort in den Daten aussieht. Weicht ab, wo eine angeklebte Nummer
   * abgeschnitten wurde — dann steht hier `bankkarte2026` und in `wort` `bankkarte`.
   */
  readonly anzeige: string;
  readonly herkunft: Merkmalsherkunft | null;
  readonly zustand: Wortzustand;
  /** Zeilen, in denen es vorkommt. Bei einem Ausschluss ohne Vorkommen: 0. */
  readonly belege: number;
  readonly deckung: number;
  readonly kategorien: number;
  readonly konzentration: number;
  readonly trennkraft: number;
  readonly haeufigsteKategorieId?: string;
  readonly verteilung: readonly { readonly kategorieId: string; readonly anzahl: number }[];
  /** Bei `strukturell`: an welcher Regel es fiel. */
  readonly grund?: Verwurfsgrund;
  /** Bei `gesperrt`: mitgeliefert oder selbst eingetragen. */
  readonly quelle?: "standard" | "manuell";
  /** Bei `gesperrt`: wo der Ausschluss gilt. Leer heisst überall. */
  readonly geltung?: readonly Merkmalsherkunft[];
}

/** Die leeren Maße — für eine Zeile, zu der es keine Belege gibt. */
const OHNE_BELEGE = {
  belege: 0,
  deckung: 0,
  kategorien: 0,
  konzentration: 0,
  trennkraft: 0,
  verteilung: [] as readonly { readonly kategorieId: string; readonly anzahl: number }[],
};

function ausMerkmalswert(m: Merkmalswert, zustand: Wortzustand): Wortzeile {
  const wort = wortVon(m.merkmal);
  return {
    schluessel: m.merkmal,
    wort,
    anzeige: wort,
    herkunft: m.herkunft,
    zustand,
    belege: m.belege,
    deckung: m.deckung,
    kategorien: m.kategorien,
    konzentration: m.konzentration,
    trennkraft: m.trennkraft,
    haeufigsteKategorieId: m.haeufigsteKategorieId,
    verteilung: m.verteilung,
  };
}

/**
 * Führt Vokabular, Sperren und strukturellen Verwurf zu einer Liste zusammen.
 *
 * Reine Funktion über bereits geladene Auswertungen — die Ladung steckt im Aufrufer, weil
 * beide Teile dort ohnehin schon liegen und ein zweiter Ladeweg dieselbe schwere Rechnung
 * ein zweites Mal anstiesse.
 */
export function merkmalsbestand(
  material: Materialbefund,
  ausschluesse: readonly GespeicherterAusschluss[],
): Wortzeile[] {
  const zeilen: Wortzeile[] = [];
  const gesehen = new Set<string>();

  /** Was die Liste über einen Ausschluss weiss — nachgeschlagen am nackten Wort. */
  const eintrag = new Map(ausschluesse.map((a) => [a.wort, a]));

  for (const m of material.vokabular.merkmale) {
    zeilen.push(ausMerkmalswert(m, "genutzt"));
    gesehen.add(m.merkmal);
  }

  for (const m of material.vokabular.gesperrte) {
    const zeile = ausMerkmalswert(m, "gesperrt");
    const a = eintrag.get(zeile.wort);
    zeilen.push({ ...zeile, quelle: a?.quelle, geltung: a?.herkuenfte });
    gesehen.add(m.merkmal);
  }

  for (const v of material.vokabular.verworfeneWoerter) {
    // Ausgeschlossene stehen schon oben, mitsamt ihren Zahlen — hier bliebe nur die
    // rohe Häufigkeit übrig, und zwei Zeilen zu einem Wort wären genau die Doppelung,
    // gegen die diese Liste gebaut ist.
    if (v.grund === "ausgeschlossen") continue;
    const schluessel = merkmalName(v.herkunft, v.wort);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    zeilen.push({
      schluessel,
      // Ein strukturell verworfenes Wort hat keine bereinigte Form — es entstand ja
      // keine. Gesperrt werden kann es trotzdem, dann unter seiner Rohform.
      wort: v.wort,
      anzeige: v.wort,
      herkunft: v.herkunft,
      zustand: "strukturell",
      grund: v.grund,
      ...OHNE_BELEGE,
      belege: v.anzahl,
    });
  }

  // Ausschlüsse, die im Bestand NIE vorkommen — die meisten mitgelieferten Stoppwörter
  // sind das. Sie gehören sichtbar in die Liste, gerade weil sie nichts tun: eine
  // Ausschlussliste, die nur ihre wirksamen Einträge zeigt, wächst unbemerkt zu und
  // niemand räumt je etwas weg.
  for (const a of ausschluesse) {
    const belegt = material.vokabular.gesperrte.some((m) => wortVon(m.merkmal) === a.wort);
    if (belegt) continue;
    zeilen.push({
      schluessel: `aus:${a.wort}`,
      wort: a.wort,
      anzeige: a.wort,
      herkunft: a.herkuenfte?.length === 1 ? a.herkuenfte[0] : null,
      zustand: "gesperrt",
      quelle: a.quelle,
      geltung: a.herkuenfte,
      ...OHNE_BELEGE,
    });
  }

  // Häufigste zuerst, quer über alle Zustände: was oft vorkommt, ist die Entscheidung
  // wert — ob es mitrechnet oder gerade nicht. Bei Gleichstand alphabetisch, damit die
  // Liste zwischen zwei Läufen nicht springt.
  return zeilen.sort((a, b) => b.belege - a.belege || a.schluessel.localeCompare(b.schluessel));
}

/** Wie viele Zeilen je Zustand — die Kopfzahlen über der Liste. */
export function bestandszahlen(zeilen: readonly Wortzeile[]): Record<Wortzustand, number> {
  const n: Record<Wortzustand, number> = { genutzt: 0, gesperrt: 0, strukturell: 0 };
  for (const z of zeilen) n[z.zustand]++;
  return n;
}
