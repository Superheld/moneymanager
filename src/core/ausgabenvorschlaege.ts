// Ausgabenvorschläge — leitet aus dem tatsächlichen Ausgabeverhalten je Hauptkategorie
// ab, was sich lohnt: ein Budget oder eine Rücklage. Reine Funktion, kein IO.
//
// Der Punkt ist nicht, eine Zahl auszurechnen — das kann jede Tabellenkalkulation.
// Der Punkt ist zu wissen, WOFÜR ein Rahmen überhaupt taugt. Ein Budget steuert
// Verhalten: „diesen Monat noch 120 € für Auswärts essen". Eine Kategorie, die
// vollständig aus Verträgen besteht (Miete, Versicherungen, Kredite), lässt sich
// nicht steuern — dort wäre ein Budget nur eine Zahl, die man jeden Monat exakt
// trifft und aus der man nichts lernt. Am echten Bestand betraf das einen erheblichen
// Teil der Hauptkategorien, und nicht die Ausnahme.
//
// Deshalb: Vorschlag = die übliche Monatssumme MINUS der vertraglich gebundene Teil,
// und nur, wenn davon genug übrig bleibt.
//
// „Üblich" heißt dabei zweierlei, und daran entscheidet sich, WAS vorgeschlagen wird:
//
//   • Eine Kategorie, in der jeden Monat etwas passiert, bekommt einen BUDGET-Vorschlag
//     über den Median. Der Median und nicht der Durchschnitt, weil ein einzelner teurer
//     Monat den Rahmen sonst dauerhaft hochzöge.
//   • Eine Kategorie, in der nur selten etwas passiert — die Jahresversicherung, die
//     Autoreparatur —, bekommt den Vorschlag einer RÜCKLAGE über den Durchschnitt,
//     leere Monate eingerechnet. Ein monatlicher Rahmen wäre hier sinnlos: elf Monate
//     bliebe er unberührt und im zwölften risse er um ein Vielfaches.
//
// Vorher fiel die zweite Sorte still ganz heraus. Nicht, weil ihr Median 0 gewesen
// wäre — leere Monate stehen gar nicht erst in der Reihe —, sondern weil zu wenige
// Monate mit Ausgaben zusammenkamen und `minMonate` sie verwarf. Genau diese Schwelle
// trennt jetzt die beiden, statt die eine zu verschlucken.
//
// WARUM IN DER WURZEL des Kerns und nicht in `budgets/` (seit 2026-11-16): die Einstufung
// beantwortet für ZWEI Bereiche dieselbe Frage — Budget oder Rücklage? —, und das ist nach
// der Gliederungsregel der Wurzel-`CLAUDE.md` die Aufgabe einer querliegenden Datei.
// Bis dahin lag sie als `budgets/budgetVorschlag.ts` dort und lieferte EINE Liste mit
// einem Feld `art`; der Bereich Budgets zeigte deshalb auch die Rücklagen-Vorschläge
// und öffnete für sie den Dialog einer Rücklage — ein Rest des aufbauenden Budgets, das
// es seit Migration 81 nicht mehr gibt. Jetzt kommen zwei benannte Listen heraus, jede
// mit ihrem eigenen Typ, und jeder Bereich zeigt nur seine.
//
// Die Einstufung bleibt dabei EINE Rechnung und wird nicht in zwei Funktionen geteilt:
// zwei Funktionen mit je einer Hälfte der Schwelle könnten auseinanderlaufen, und eine
// Kategorie stünde dann in beiden Listen oder in keiner. Die beiden Typen stehen hier und
// nicht in ihren Bereichen, weil sie die zwei Hälften desselben Ergebnisses sind; ein
// Bereichsordner bekäme nur eine Datei mit einem Typ, den allein diese Rechnung füllt.

import type { Cent } from "./basis/geld";
import type { Kategorie } from "./kategorien/kategorie";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";

/** Was beide Vorschläge gemeinsam haben — dieselbe Herkunft, dieselben Grundzahlen. */
interface Ausgabenvorschlag {
  /** Die Hauptkategorie, für die der Vorschlag gilt. */
  readonly kategorieId: string;
  readonly name: string;
  /** Davon vertraglich gebunden (Buchungen, die zu einem Vertrag gehören), im Monat. */
  readonly vertragsanteil: Cent;
  /** Der steuerbare Teil, auf 10 Einheiten gerundet: Rahmen bzw. Rate. */
  readonly vorschlag: Cent;
  /** In wie vielen Monaten überhaupt etwas ausgegeben wurde. */
  readonly monate: number;
}

/** Ein monatliches Budget: die Kategorie hat fast jeden Monat Ausgaben. */
export interface Budgetvorschlag extends Ausgabenvorschlag {
  /** Was die Kategorie im Monat gekostet hat, positiv: der MEDIAN der Monate mit Ausgaben. */
  readonly proMonat: Cent;
  /**
   * Wie stark die Monate auseinanderliegen: höchster Monat ÷ `proMonat`. 1 = konstant,
   * 4 = ein Monat war viermal so teuer wie üblich. Sagt, wie oft der Rahmen reißen wird.
   */
  readonly schwankung: number;
}

/**
 * Eine Rücklage, die weiterläuft: die Kategorie hat nur selten Ausgaben, dann grosse.
 *
 * Eine Schwankung trägt er nicht: hier ist der eine teure Monat der Zweck und nicht der
 * Ausreisser, und eine Zahl dafür läse sich als Warnung vor dem Erwarteten.
 */
export interface Ruecklagenvorschlag extends Ausgabenvorschlag {
  /**
   * Was die Kategorie im Monat gekostet hat, positiv: der DURCHSCHNITT über den ganzen
   * beobachteten Zeitraum, leere Monate eingerechnet — genau die sind der Grund, warum
   * sich hier etwas ansammeln soll.
   */
  readonly proMonat: Cent;
}

/** Das Ergebnis der einen Einstufung — jede Kategorie steht in höchstens einer Liste. */
export interface Ausgabenvorschlaege {
  readonly budgets: readonly Budgetvorschlag[];
  readonly ruecklagen: readonly Ruecklagenvorschlag[];
}

export interface AusgabenvorschlagOptionen {
  /** Nur die letzten n Monate auswerten (Standard: 12). */
  readonly fensterMonate?: number;
  /**
   * Weniger Monate mit Ausgaben ergeben keinen belastbaren Median. Darunter ist der
   * Vorschlag nicht etwa weg — dort beginnt die Rücklage.
   */
  readonly minMonate?: number;
  /**
   * So viele Monate müssen überhaupt beobachtet sein, bevor sich „selten" von „neu"
   * unterscheiden lässt. Darunter gibt es keinen Rücklagenvorschlag: mit einem halben
   * Jahr Historie ist eine jährliche Zahlung von einer einmaligen nicht zu trennen, und
   * eine geratene Rate ist schlechter als keine.
   */
  readonly minHistorieRuecklage?: number;
  /** Unterhalb dieses Betrags lohnt weder Budget noch Rücklage. */
  readonly minRahmen?: Cent;
  /**
   * Mindestanteil des steuerbaren Teils an der Gesamtsumme. Darunter ist die Kategorie
   * vertraglich gebunden und ein Vorschlag ohne Wirkung.
   */
  readonly minSteuerbar?: number;
}

const STANDARD: Required<AusgabenvorschlagOptionen> = {
  fensterMonate: 12,
  minMonate: 6,
  minHistorieRuecklage: 12,
  minRahmen: 2000, // 20 €
  minSteuerbar: 0.25,
};

/** „2026-08-16" → „2026-08". */
function monatVon(iso: string): string {
  return iso.slice(0, 7);
}

/** Median einer nicht-leeren Zahlenreihe. */
function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** Auf 10 Einheiten der Hauptwährung runden (10 €), mindestens auf 1. */
function gerundet(cent: Cent): Cent {
  return Math.max(100, Math.round(cent / 1000) * 1000);
}

/**
 * Stuft jede Hauptkategorie ein und schlägt ein Budget ODER eine Rücklage vor.
 *
 * `vertragsBuchungIds` sind die Buchungen, die zu einem Vertrag gehören (erkannt oder
 * erfasst). Sie zählen in den Median hinein — sie sind ja echte Ausgaben —, werden aber
 * vom Vorschlag abgezogen: was ein Vertrag abbucht, steuert weder Budget noch Rücklage.
 *
 * `bestehende` sind Kategorien, an denen schon ein Budget oder eine Rücklage hängt; sie
 * werden übersprungen, damit keine Karte anbietet, was es längst gibt. Was ein Bereich
 * verworfen hat, gehört NICHT hierher, sondern wird danach aus SEINER Liste gefiltert:
 * die Einstufung einer Kategorie hängt an keiner anderen, und so bleibt das Verwerfen
 * je Bereich getrennt.
 *
 * Je Kategorie kommt höchstens EIN Vorschlag heraus, in genau einer der beiden Listen.
 * Welcher, entscheidet die Zahl der Monate mit Ausgaben (siehe Kopf).
 *
 * `vonRuecklagen` sind die Anteile (`buchungId#index`), die eine Rücklage über ihre
 * Kategorie trägt oder die auf eine Zuordnung warten — dieselbe Zuständigkeit wie im
 * Verbrauch (`budgetBuchungen`). Sie zählen nicht: ein Rahmen, gegen den sie danach
 * nicht zählten, wäre zu hoch.
 */
export function ausgabenvorschlaege(
  buchungen: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  bisMonat: string,
  vertragsBuchungIds: ReadonlySet<string> = new Set(),
  bestehende: ReadonlySet<string> = new Set(),
  optionen: AusgabenvorschlagOptionen = {},
  vonRuecklagen: ReadonlySet<string> = new Set(),
): Ausgabenvorschlaege {
  const opt = { ...STANDARD, ...optionen };
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  // Geordnet (ältester zuerst), weil unten die LAGE der belegten Monate zählt und
  // nicht nur ihre Anzahl.
  const fensterliste = monatsFenster(bisMonat, opt.fensterMonate);
  const fenster = new Set(fensterliste);

  /** Hauptkategorie einer Kategorie: die Elternkategorie, sonst sie selbst. */
  const hauptVon = (kategorieId: string): Kategorie | undefined => {
    const k = byId.get(kategorieId);
    if (!k) return undefined;
    return (k.elternId ? byId.get(k.elternId) : undefined) ?? k;
  };

  // Hauptkategorie → Monat → Summe (positiv), und der vertraglich gebundene Teil.
  const proGruppe = new Map<string, { name: string; monate: Map<string, Cent>; vertrag: Cent }>();
  /**
   * Monate, in denen überhaupt etwas los war — über ALLE Kategorien.
   *
   * Das ist der Bezugsrahmen für die Rücklage und nicht die Fenstergröße:
   * wer die App seit drei Monaten benutzt, hätte sonst lauter Kategorien, die in
   * „höchstens einem Viertel der Monate" vorkommen, und bekäme für jede eine
   * Rücklage über ein Zwölftel ihrer tatsächlichen Ausgaben.
   */
  const beobachtet = new Set<string>();

  for (const b of buchungen) {
    // Nur Aufwand: Umschichtungen sind kein Verbrauch, Erträge erst recht nicht.
    if (b.charakter !== "Aufwand") continue;
    // Von Hand aus der Budgetbewertung genommen — dann auch aus dem Vorschlag: sonst
    // schlüge er einen Rahmen vor, gegen den die Buchung anschliessend nicht zählt.
    if (b.budgetrelevant === false) continue;
    if (!fenster.has(monatVon(b.datum))) continue;
    beobachtet.add(monatVon(b.datum));

    // Über die Anteile, nicht über b.kategorieId: eine geteilte Buchung gehört
    // anteilig in mehrere Kategorien.
    for (const [i, anteil] of kategorieAnteile(b).entries()) {
      if (!anteil.kategorieId) continue;
      if (vonRuecklagen.has(`${b.id}#${i}`)) continue;
      const haupt = hauptVon(anteil.kategorieId);
      if (!haupt) continue;
      // Vorzeichenrichtig: Abflüsse sind negativ und erhöhen den Verbrauch, eine
      // Erstattung (positiver Aufwand) senkt ihn.
      const wert = -anteil.betrag;

      const e = proGruppe.get(haupt.id) ?? { name: haupt.name, monate: new Map(), vertrag: 0 };
      e.monate.set(monatVon(b.datum), (e.monate.get(monatVon(b.datum)) ?? 0) + wert);
      if (vertragsBuchungIds.has(b.id)) e.vertrag += wert;
      proGruppe.set(haupt.id, e);
    }
  }

  const beobachteteMonate = fensterliste.filter((m) => beobachtet.has(m));

  const budgets: Budgetvorschlag[] = [];
  const ruecklagen: Ruecklagenvorschlag[] = [];
  for (const [kategorieId, e] of proGruppe) {
    if (bestehende.has(kategorieId)) continue;
    const werte = [...e.monate.values()];
    const belegte = werte.length;
    if (belegte === 0) continue;

    /** Wohin die Kategorie gehört — die eine Stelle, an der das entschieden wird. */
    let ziel: "budget" | "ruecklage";
    let proMonat: Cent;
    /** Über wie viele Monate gemittelt wird — auch für den Vertragsanteil. */
    let teiler: number;

    if (belegte >= opt.minMonate) {
      ziel = "budget";
      teiler = belegte;
      proMonat = median(werte);
    } else {
      if (beobachteteMonate.length < opt.minHistorieRuecklage) continue;
      // Eine NEUE Kategorie sieht aus wie eine seltene: beide haben wenige belegte
      // Monate. Unterscheiden lassen sie sich an der Lage — bei der neuen liegen sie
      // alle am jüngsten Ende, bei der seltenen verteilt. Ohne diese Probe bekäme
      // ein gerade erst angefangener Posten eine Rücklagenrate über einen
      // Bruchteil dessen, was er in Wirklichkeit jeden Monat kostet.
      const erstes = beobachteteMonate.findIndex((m) => e.monate.has(m));
      if (erstes >= beobachteteMonate.length - belegte) continue;
      ziel = "ruecklage";
      teiler = beobachteteMonate.length;
      proMonat = Math.round(werte.reduce((s, w) => s + w, 0) / teiler);
    }

    if (proMonat <= 0) continue;
    // Der Vertragsanteil wird über dieselben Monate gemittelt wie der Rest, sonst
    // verglichen man eine Monatszahl mit einer Jahressumme.
    const vertragProMonat = Math.round(e.vertrag / teiler);
    const steuerbar = proMonat - vertragProMonat;
    if (steuerbar < opt.minRahmen) continue;
    if (steuerbar / proMonat < opt.minSteuerbar) continue;

    const gemeinsam = {
      kategorieId,
      name: e.name,
      proMonat,
      vertragsanteil: vertragProMonat,
      vorschlag: gerundet(steuerbar),
      monate: belegte,
    };
    if (ziel === "budget") {
      budgets.push({ ...gemeinsam, schwankung: Math.round((Math.max(...werte) / proMonat) * 10) / 10 });
    } else {
      ruecklagen.push(gemeinsam);
    }
  }

  const nachVorschlag = (a: { vorschlag: Cent }, b: { vorschlag: Cent }) => b.vorschlag - a.vorschlag;
  return { budgets: budgets.sort(nachVorschlag), ruecklagen: ruecklagen.sort(nachVorschlag) };
}

/**
 * Die letzten `n` Monatsschlüssel bis einschließlich `bisMonat` („2026-08"),
 * ÄLTESTER ZUERST — die Reihenfolge trägt die Aussage „liegt am jüngsten Ende".
 */
function monatsFenster(bisMonat: string, n: number): string[] {
  const [j, m] = bisMonat.split("-").map(Number);
  const liste: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const gesamt = j * 12 + (m - 1) - i;
    const jahr = Math.floor(gesamt / 12);
    const monat = (gesamt % 12) + 1;
    liste.push(`${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`);
  }
  return liste;
}
