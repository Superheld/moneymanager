// Budgetvorschläge — leitet aus dem tatsächlichen Ausgabeverhalten einen Rahmen je
// Hauptkategorie ab. Reine Funktion, kein IO.
//
// Der Punkt ist nicht, eine Zahl auszurechnen — das kann jede Tabellenkalkulation.
// Der Punkt ist zu wissen, WOFÜR ein Budget überhaupt taugt. Ein Budget steuert
// Verhalten: „diesen Monat noch 120 € für Auswärts essen". Eine Kategorie, die
// vollständig aus Verträgen besteht (Miete, Versicherungen, Kredite), lässt sich
// nicht steuern — dort wäre ein Budget nur eine Zahl, die man jeden Monat exakt
// trifft und aus der man nichts lernt. Am echten Bestand betraf das einen erheblichen
// Teil der Hauptkategorien, und nicht die Ausnahme.
//
// Deshalb: Vorschlag = die übliche Monatssumme MINUS der vertraglich gebundene Teil,
// und nur, wenn davon genug übrig bleibt.
//
// „Üblich" heißt dabei zweierlei, und daran entscheidet sich auch die vorgeschlagene
// BUDGETART:
//
//   • Eine Kategorie, in der jeden Monat etwas passiert, bekommt einen MONATLICHEN
//     Vorschlag über den Median. Der Median und nicht der Durchschnitt, weil ein
//     einzelner teurer Monat den Rahmen sonst dauerhaft hochzöge.
//   • Eine Kategorie, in der nur selten etwas passiert — die Jahresversicherung, die
//     Autoreparatur —, bekommt einen AUFBAUENDEN Vorschlag über den Durchschnitt,
//     leere Monate eingerechnet. Ein monatlicher Rahmen wäre hier sinnlos: elf Monate
//     bliebe er unberührt und im zwölften risse er um ein Vielfaches.
//
// Vorher fiel die zweite Sorte still ganz heraus. Nicht, weil ihr Median 0 gewesen
// wäre — leere Monate stehen gar nicht erst in der Reihe —, sondern weil zu wenige
// Monate mit Ausgaben zusammenkamen und `minMonate` sie verwarf. Genau diese Schwelle
// trennt jetzt die beiden Arten, statt die eine zu verschlucken.

import type { Cent } from "../basis/geld";
import type { Budgetart } from "./budget";
import type { Kategorie } from "../kategorien/kategorie";
import { kategorieAnteile, type IstBuchung } from "../buchung/istbuchung";

export interface Budgetvorschlag {
  /** Die Hauptkategorie, für die der Rahmen gilt. */
  readonly kategorieId: string;
  readonly name: string;
  /**
   * Welche Budgetart vorgeschlagen wird. Sie entscheidet mit, wie `proMonat`
   * zustande kommt — siehe Kopf der Datei.
   */
  readonly art: Budgetart;
  /**
   * Was die Kategorie im Monat gekostet hat, positiv.
   *
   * Bei `monatlich` der MEDIAN der Monate mit Ausgaben. Bei `aufbauend` der
   * DURCHSCHNITT über den ganzen beobachteten Zeitraum, leere Monate eingerechnet:
   * genau die sind der Grund, warum sich hier etwas ansammeln soll.
   */
  readonly proMonat: Cent;
  /** Davon vertraglich gebunden (Buchungen, die zu einem Vertrag gehören). */
  readonly vertragsanteil: Cent;
  /** Empfohlener Rahmen: der steuerbare Teil, auf 10 Einheiten gerundet. */
  readonly vorschlag: Cent;
  /** In wie vielen Monaten überhaupt etwas ausgegeben wurde. */
  readonly monate: number;
  /**
   * Wie stark die Monate auseinanderliegen: höchster Monat ÷ `proMonat`. 1 = konstant,
   * 4 = ein Monat war viermal so teuer wie üblich.
   *
   * Aussagekräftig ist das nur bei `monatlich` — dort sagt es, wie oft der Rahmen
   * reißen wird. Bei `aufbauend` ist ein hoher Wert der Normalfall und keine Warnung:
   * der Rahmen sammelt sich ja gerade an, um den einen teuren Monat zu tragen.
   */
  readonly schwankung: number;
}

export interface BudgetvorschlagOptionen {
  /** Nur die letzten n Monate auswerten (Standard: 12). */
  readonly fensterMonate?: number;
  /**
   * Weniger Monate mit Ausgaben ergeben keinen belastbaren Median. Darunter ist der
   * Vorschlag nicht etwa weg — dort beginnt der aufbauende Fall.
   */
  readonly minMonate?: number;
  /**
   * So viele Monate müssen überhaupt beobachtet sein, bevor sich „selten" von „neu"
   * unterscheiden lässt. Darunter gibt es keinen aufbauenden Vorschlag: mit einem
   * halben Jahr Historie ist eine jährliche Zahlung von einer einmaligen nicht zu
   * trennen, und ein geratener Rahmen ist schlechter als keiner.
   */
  readonly minHistorieAufbauend?: number;
  /** Unterhalb dieses Rahmens lohnt kein Budget. */
  readonly minRahmen?: Cent;
  /**
   * Mindestanteil des steuerbaren Teils an der Gesamtsumme. Darunter ist die Kategorie
   * vertraglich gebunden und ein Budget ohne Wirkung.
   */
  readonly minSteuerbar?: number;
}

const STANDARD: Required<BudgetvorschlagOptionen> = {
  fensterMonate: 12,
  minMonate: 6,
  minHistorieAufbauend: 12,
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
 * Schlägt je Hauptkategorie einen monatlichen Rahmen vor.
 *
 * `vertragsBuchungIds` sind die Buchungen, die zu einem Vertrag gehören (erkannt oder
 * erfasst). Sie zählen in den Median hinein — sie sind ja echte Ausgaben —, werden aber
 * vom Vorschlag abgezogen: was ein Vertrag abbucht, steuert kein Budget.
 *
 * `bestehende` sind Kategorien, für die schon ein Budget existiert; sie werden
 * übersprungen, damit die Vorschlagskarte nicht anbietet, was es längst gibt.
 *
 * Je Kategorie kommt höchstens EIN Vorschlag heraus, monatlich oder aufbauend — nie
 * beide. Welcher, entscheidet die Zahl der Monate mit Ausgaben (siehe Kopf).
 */
export function budgetvorschlaege(
  buchungen: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  bisMonat: string,
  vertragsBuchungIds: ReadonlySet<string> = new Set(),
  bestehende: ReadonlySet<string> = new Set(),
  optionen: BudgetvorschlagOptionen = {},
): Budgetvorschlag[] {
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
   * Das ist der Bezugsrahmen für den aufbauenden Fall und nicht die Fenstergröße:
   * wer die App seit drei Monaten benutzt, hätte sonst lauter Kategorien, die in
   * „höchstens einem Viertel der Monate" vorkommen, und bekäme für jede einen
   * aufbauenden Vorschlag über ein Zwölftel ihrer tatsächlichen Ausgaben.
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
    for (const anteil of kategorieAnteile(b)) {
      if (!anteil.kategorieId) continue;
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

  const vorschlaege: Budgetvorschlag[] = [];
  for (const [kategorieId, e] of proGruppe) {
    if (bestehende.has(kategorieId)) continue;
    const werte = [...e.monate.values()];
    const belegte = werte.length;
    if (belegte === 0) continue;

    let art: Budgetart;
    let proMonat: Cent;
    /** Über wie viele Monate gemittelt wird — auch für den Vertragsanteil. */
    let teiler: number;

    if (belegte >= opt.minMonate) {
      art = "monatlich";
      teiler = belegte;
      proMonat = median(werte);
    } else {
      if (beobachteteMonate.length < opt.minHistorieAufbauend) continue;
      // Eine NEUE Kategorie sieht aus wie eine seltene: beide haben wenige belegte
      // Monate. Unterscheiden lassen sie sich an der Lage — bei der neuen liegen sie
      // alle am jüngsten Ende, bei der seltenen verteilt. Ohne diese Probe bekäme
      // ein gerade erst angefangener Posten eine aufbauende Rate über einen
      // Bruchteil dessen, was er in Wirklichkeit jeden Monat kostet.
      const erstes = beobachteteMonate.findIndex((m) => e.monate.has(m));
      if (erstes >= beobachteteMonate.length - belegte) continue;
      art = "aufbauend";
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

    vorschlaege.push({
      kategorieId,
      name: e.name,
      art,
      proMonat,
      vertragsanteil: vertragProMonat,
      vorschlag: gerundet(steuerbar),
      monate: belegte,
      schwankung: Math.round((Math.max(...werte) / proMonat) * 10) / 10,
    });
  }

  return vorschlaege.sort((a, b) => b.vorschlag - a.vorschlag);
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
