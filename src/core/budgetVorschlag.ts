// Budgetvorschläge — leitet aus dem tatsächlichen Ausgabeverhalten einen Rahmen je
// Hauptkategorie ab. Reine Funktion, kein IO.
//
// Der Punkt ist nicht, eine Zahl auszurechnen — das kann jede Tabellenkalkulation.
// Der Punkt ist zu wissen, WOFÜR ein Budget überhaupt taugt. Ein Budget steuert
// Verhalten: „diesen Monat noch 120 € für Auswärts essen". Eine Kategorie, die
// vollständig aus Verträgen besteht (Miete, Versicherungen, Kredite), lässt sich
// nicht steuern — dort wäre ein Budget nur eine Zahl, die man jeden Monat exakt
// trifft und aus der man nichts lernt. Auf echten Daten traf das drei von sieben
// Hauptkategorien: Wohnen, Finanzen und Sonstiges sind zu 100 % vertraglich gebunden.
//
// Deshalb: Vorschlag = Median der Monatssummen MINUS der vertraglich gebundene Teil,
// und nur, wenn davon genug übrig bleibt.

import type { Cent } from "./geld";
import type { Kategorie } from "./kategorie";
import { kategorieAnteile, type IstBuchung } from "./istbuchung";

export interface Budgetvorschlag {
  /** Die Hauptkategorie, für die der Rahmen gilt. */
  readonly kategorieId: string;
  readonly name: string;
  /** Median der Monatssummen dieser Hauptkategorie, positiv. */
  readonly medianProMonat: Cent;
  /** Davon vertraglich gebunden (Buchungen, die zu einem Vertrag gehören). */
  readonly vertragsanteil: Cent;
  /** Empfohlener Rahmen: der steuerbare Teil, auf 10 Einheiten gerundet. */
  readonly vorschlag: Cent;
  /** Wie viele Monate Daten dahinterstehen. */
  readonly monate: number;
  /**
   * Wie stark die Monate auseinanderliegen: höchster Monat ÷ Median. 1 = konstant,
   * 4 = ein Monat war viermal so teuer wie üblich. Sagt, wie oft der Rahmen reißen wird.
   */
  readonly schwankung: number;
}

export interface BudgetvorschlagOptionen {
  /** Nur die letzten n Monate auswerten (Standard: 12). */
  readonly fensterMonate?: number;
  /** Weniger Monate mit Daten ergeben keinen belastbaren Median. */
  readonly minMonate?: number;
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
  const fenster = monatsFenster(bisMonat, opt.fensterMonate);

  /** Hauptkategorie einer Kategorie: die Elternkategorie, sonst sie selbst. */
  const hauptVon = (kategorieId: string): Kategorie | undefined => {
    const k = byId.get(kategorieId);
    if (!k) return undefined;
    return (k.elternId ? byId.get(k.elternId) : undefined) ?? k;
  };

  // Hauptkategorie → Monat → Summe (positiv), und der vertraglich gebundene Teil.
  const proGruppe = new Map<string, { name: string; monate: Map<string, Cent>; vertrag: Cent }>();

  for (const b of buchungen) {
    // Nur Aufwand: Umschichtungen sind kein Verbrauch, Erträge erst recht nicht.
    if (b.charakter !== "Aufwand") continue;
    if (!fenster.has(monatVon(b.datum))) continue;

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

  const vorschlaege: Budgetvorschlag[] = [];
  for (const [kategorieId, e] of proGruppe) {
    if (bestehende.has(kategorieId)) continue;
    const werte = [...e.monate.values()];
    if (werte.length < opt.minMonate) continue;

    const med = median(werte);
    if (med <= 0) continue;
    // Der Vertragsanteil wird über dieselben Monate gemittelt wie der Median, sonst
    // verglichen man eine Monatszahl mit einer Jahressumme.
    const vertragProMonat = Math.round(e.vertrag / werte.length);
    const steuerbar = med - vertragProMonat;
    if (steuerbar < opt.minRahmen) continue;
    if (steuerbar / med < opt.minSteuerbar) continue;

    vorschlaege.push({
      kategorieId,
      name: e.name,
      medianProMonat: med,
      vertragsanteil: vertragProMonat,
      vorschlag: gerundet(steuerbar),
      monate: werte.length,
      schwankung: Math.round((Math.max(...werte) / med) * 10) / 10,
    });
  }

  return vorschlaege.sort((a, b) => b.vorschlag - a.vorschlag);
}

/** Die letzten `n` Monatsschlüssel bis einschließlich `bisMonat` („2026-08"). */
function monatsFenster(bisMonat: string, n: number): Set<string> {
  const [j, m] = bisMonat.split("-").map(Number);
  const menge = new Set<string>();
  for (let i = 0; i < n; i++) {
    const gesamt = j * 12 + (m - 1) - i;
    const jahr = Math.floor(gesamt / 12);
    const monat = (gesamt % 12) + 1;
    menge.add(`${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`);
  }
  return menge;
}
