// Monatsausblick — die Aufrechnung EINES Monats, wie man sie auf Papier machen würde:
// Einnahmen minus Verträge minus Budgets ergibt, was übrig bleibt. Rein, ohne IO.
//
// Zwei Spalten, weil ein Monat zwei Wahrheiten hat: PLAN (was gepflegt ist — Verträge
// und Budgets) und IST (was tatsächlich gebucht wurde). Kommende Monate haben nur die
// Plan-Spalte; im laufenden Monat stehen beide nebeneinander, und die Ist-Spalte ist
// die Antwort auf „wie weit bin ich durch?".
//
// EINNAHMEN KOMMEN AUS VERTRÄGEN, nicht aus einer Hochrechnung der Vergangenheit
// (Entscheidung 2026-08-16). Ein Vertrag im Sinne dieser App umfasst auch Einnahmen —
// die Zahlungsregel trägt dann Charakter `Ertrag`. Gibt es keine solche Regel, steht in
// der Plan-Spalte ehrlich 0; geschätzt wird nichts.
//
// Jede Ist-Buchung zählt in GENAU EINE Zeile. Die Reihenfolge ist:
//   1. einem Plan-Posten zugeordnet → Verträge (bzw. Einnahmen)
//   2. sonst Kategorie im Unterbaum eines Budgets → Budgets
//   3. sonst → Sonstiges
// Ohne diese Ordnung zählte eine Vertragszahlung, deren Kategorie unter einer
// Budget-Kategorie hängt (auf echten Daten: Sport → Freizeit & Kultur), doppelt — und
// die Aufrechnung ginge nicht mehr gegen den Kontostand auf.
//
// DIE RÜCKLAGEN-ZEILE IST DIE EINE AUSNAHME von „Ist = was tatsächlich floss": die
// monatliche Rücklage für das Inventar wird nirgends gebucht, sie ist reine Rechnung.
// Sie steht deshalb in BEIDEN Spalten mit demselben Betrag. Das ist Absicht — die Frage
// unter dem Strich lautet „was kann ich noch ausgeben?", und eine Rücklage kann man
// nicht ausgeben, ob sie nun geflossen ist oder nicht. Wer die Ist-Spalte gegen den
// Kontoauszug prüft, muss diese Zeile herausrechnen.

import { addMonate, parseIso, toIso } from "./datum";
import type { Cent } from "./geld";
import { geglaetteterMonatsabfluss, budgetVerbrauch, type Budget } from "./budget";
import { istInterneUmbuchung } from "./historie";
import { monatsRuecklageGesamt, type Inventargegenstand } from "./inventar";
import { kategorieUnterbaum, type Kategorie } from "./kategorie";
import { findeIstZuPlan, kategorieAnteile, type IstBuchung } from "./istbuchung";
import { projiziereRegel, type Planbuchung } from "./projektion";
import type { Zahlungsregel } from "./zahlungsregel";

/** Die Zeilen der Aufrechnung, in Anzeigereihenfolge. */
export type AusblickZeileId =
  | "einnahmen"
  | "vertraege"
  | "budgets"
  | "ruecklagen"
  | "umschichtung"
  | "sonstiges";

/**
 * Wie belegt ein Posten ist:
 *  • `bezahlt`  — per Häkchen bestätigt (planRef, 1:1 und eindeutig)
 *  • `gebucht`  — über Kategorie + Betragsnähe einer Ist-Buchung zugeordnet
 *  • `offen`    — geplant, aber (noch) nichts gebucht
 *  • `ohnePlan` — gebucht, aber kein Plan-Posten dahinter (Sammelzeilen)
 */
export type PostenStatus = "bezahlt" | "gebucht" | "offen" | "ohnePlan";

export interface AusblickPosten {
  /** Stabil innerhalb eines Monats (Regel-ID + Fälligkeit, Budget-ID, oder Sammelschlüssel). */
  readonly schluessel: string;
  readonly bezeichnung: string;
  /** Fälligkeit (ISO); fehlt bei Budgets und Sammelposten — die haben keinen Termin. */
  readonly datum?: string;
  /** Geplanter Betrag, vorzeichenbehaftet (Aufwand negativ). 0 bei Sammelposten. */
  readonly plan: Cent;
  /** Tatsächlich gebucht/verbraucht, vorzeichenbehaftet. `null` = im Plan-Blick ohne Ist. */
  readonly ist: Cent | null;
  readonly status: PostenStatus;
}

export interface AusblickZeile {
  readonly id: AusblickZeileId;
  /** Summe der Plan-Beträge, vorzeichenbehaftet. */
  readonly plan: Cent;
  /** Summe der Ist-Beträge; `null` in Monaten, die komplett in der Zukunft liegen. */
  readonly ist: Cent | null;
  readonly posten: readonly AusblickPosten[];
}

export interface MonatsAusblick {
  readonly jahr: number;
  readonly monat: number; // 1–12
  /** „YYYY-MM" — dieselbe Form wie im Historien-Verlauf. */
  readonly label: string;
  /** Fenster [von, bis) des Monats, ISO. */
  readonly von: string;
  readonly bis: string;
  /** Der Monat, in dem `heute` liegt. */
  readonly laufend: boolean;
  /** Monat beginnt erst nach `heute` → es gibt nichts Gebuchtes, nur den Plan. */
  readonly zukunft: boolean;
  readonly zeilen: readonly AusblickZeile[];
  /** Was nach der Aufrechnung übrig bleibt (Σ Zeilen), Plan- und Ist-Spalte. */
  readonly restPlan: Cent;
  readonly restIst: Cent | null;
}

/**
 * Relative Toleranz, innerhalb derer eine Ist-Buchung als „das ist dieser Plan-Posten"
 * gilt. 15 %, weil geplante Beträge veralten: die Miete stand als 471,41 in der Regel
 * und wurde als 459,25 gebucht (2,6 % Abstand) — mit einer engen Grenze hätte die
 * Zeile „offen" gezeigt, obwohl sie längst abgebucht war. Nach oben begrenzt das die
 * Fehlzuordnung: zwei Posten derselben Kategorie mit stark verschiedenen Beträgen
 * werden nicht verwechselt.
 */
const BETRAGS_TOLERANZ = 0.15;

export interface MonatsAusblickEingabe {
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  /** Inventar — Quelle der monatlichen Rücklage (kalkulatorisch, nie gebucht). */
  readonly inventar?: readonly Inventargegenstand[];
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  /** Erster Tag des Monats, „YYYY-MM-01". */
  readonly monatAb: string;
  /** Heutiges Datum (ISO) — trennt Plan-only von Plan+Ist. */
  readonly heute: string;
}

/** Aufrechnung eines Monats. Reine Funktion über bereits geladene Daten. */
export function monatsAusblick(e: MonatsAusblickEingabe): MonatsAusblick {
  const start = parseIso(e.monatAb);
  const von = toIso({ ...start, d: 1 });
  const bis = toIso(addMonate(start, 1));
  const zukunft = von > e.heute;
  const laufend = !zukunft && e.heute < bis;

  const planPosten = e.regeln.flatMap((r) => projiziereRegel(r, von, 1).map((p) => ({ p, regel: r })));
  const regelById = new Map(e.regeln.map((r) => [r.id, r]));

  // Ist des Monats. Interne Umbuchungen raus — sie schieben eigenes Geld zwischen
  // eigenen Konten und gehören in keine Zeile dieser Aufrechnung.
  const istImMonat = zukunft
    ? []
    : e.ist.filter((b) => b.datum >= von && b.datum < bis && !istInterneUmbuchung(b));

  const zugeordnet = ordneZu(planPosten, istImMonat, regelById, e.ist);
  const verbraucht = new Set([...zugeordnet.values()].map((b) => b.id));

  const einnahmen = zeileAusRegeln("einnahmen", planPosten, zugeordnet, "Ertrag");
  const vertraege = zeileAusRegeln("vertraege", planPosten, zugeordnet, "Aufwand");
  const umschichtung = zeileAusRegeln("umschichtung", planPosten, zugeordnet, "Umschichtung");

  // Was noch keiner Zeile gehört — die Basis für Budgets und Sonstiges.
  const offenesIst = istImMonat.filter((b) => !verbraucht.has(b.id));

  const budgetZeile = budgetsZeile(e.budgets, offenesIst, e.kategorien, von, bis, zukunft);
  const budgetKategorien = new Set(
    e.budgets.flatMap((b) => [...kategorieUnterbaum(e.kategorien, b.kategorieId)]),
  );

  // Sammelposten: gebucht, aber von keiner Plan-Zeile erfasst. Ohne sie summierte die
  // Ist-Spalte nicht auf das, was tatsächlich vom Konto ging.
  const weitereEinnahmen = summe(
    offenesIst.filter((b) => b.charakter === "Ertrag").map((b) => b.betrag),
  );
  const sonstigeAusgaben = summe(
    offenesIst
      .filter((b) => b.charakter === "Aufwand")
      .flatMap((b) => kategorieAnteile(b))
      .filter((a) => !a.kategorieId || !budgetKategorien.has(a.kategorieId))
      .map((a) => a.betrag),
  );
  const weitereUmschichtung = summe(
    offenesIst.filter((b) => b.charakter === "Umschichtung").map((b) => b.betrag),
  );

  const zeilen: AusblickZeile[] = [
    mitSammelposten(einnahmen, weitereEinnahmen, "einnahmen.weitere", zukunft),
    vertraege,
    budgetZeile,
  ];
  const ruecklagen = ruecklagenZeile(e.inventar ?? [], zukunft);
  if (ruecklagen) zeilen.push(ruecklagen);
  if (umschichtung.plan !== 0 || weitereUmschichtung !== 0) {
    zeilen.push(mitSammelposten(umschichtung, weitereUmschichtung, "umschichtung.weitere", zukunft));
  }
  if (sonstigeAusgaben !== 0) {
    zeilen.push({
      id: "sonstiges",
      plan: 0,
      ist: sonstigeAusgaben,
      posten: [
        { schluessel: "sonstiges.summe", bezeichnung: "sonstiges", plan: 0, ist: sonstigeAusgaben, status: "ohnePlan" },
      ],
    });
  }

  return {
    jahr: start.y,
    monat: start.m,
    label: von.slice(0, 7),
    von,
    bis,
    laufend,
    zukunft,
    zeilen,
    restPlan: summe(zeilen.map((z) => z.plan)),
    restIst: zukunft ? null : summe(zeilen.map((z) => z.ist ?? 0)),
  };
}

/**
 * Ordnet jedem Plan-Posten höchstens eine Ist-Buchung zu. Zwei Wege, in dieser Reihenfolge:
 *  1. `planRef` — der Posten wurde per Häkchen bestätigt. Eindeutig, schlägt alles.
 *  2. Kategorie der Regel + Betrag innerhalb der Toleranz, bester Treffer zuerst.
 *
 * Warum überhaupt Weg 2: auf echten Daten trägt Weg 1 nichts — von 5207 Ist-Buchungen
 * hatte keine einzige eine `planRef`, weil alles über den Bankimport kommt und niemand
 * Häkchen setzt. Ohne die Betragszuordnung stünde die Ist-Spalte dauerhaft auf 0.
 *
 * Jede Ist-Buchung wird höchstens einmal vergeben; die beste (kleinste relative
 * Abweichung) gewinnt, damit zwei gleichartige Posten nicht die falsche Zahlung greifen.
 */
function ordneZu(
  planPosten: readonly { p: Planbuchung; regel: Zahlungsregel }[],
  istImMonat: readonly IstBuchung[],
  regelById: ReadonlyMap<string, Zahlungsregel>,
  allesIst: readonly IstBuchung[],
): Map<string, IstBuchung> {
  const treffer = new Map<string, IstBuchung>();
  const vergeben = new Set<string>();

  for (const { p } of planPosten) {
    const belegt = findeIstZuPlan([...allesIst], p.regelId, p.datum);
    if (belegt) {
      treffer.set(schluesselVon(p), belegt);
      vergeben.add(belegt.id);
    }
  }

  // Alle offenen Paarungen bewerten und die besten zuerst vergeben — sonst hinge das
  // Ergebnis an der Reihenfolge der Regeln statt an der Passgenauigkeit.
  const paare: { schluessel: string; buchung: IstBuchung; abstand: number }[] = [];
  for (const { p } of planPosten) {
    const s = schluesselVon(p);
    if (treffer.has(s)) continue;
    const regel = regelById.get(p.regelId);
    if (!regel?.kategorieId || p.betrag === 0) continue;
    for (const b of istImMonat) {
      if (b.charakter !== p.charakter) continue;
      if (Math.sign(b.betrag) !== Math.sign(p.betrag)) continue;
      if (!kategorieAnteile(b).some((a) => a.kategorieId === regel.kategorieId)) continue;
      const abstand = Math.abs(b.betrag - p.betrag) / Math.abs(p.betrag);
      if (abstand > BETRAGS_TOLERANZ) continue;
      paare.push({ schluessel: s, buchung: b, abstand });
    }
  }
  paare.sort((a, b) => a.abstand - b.abstand);
  for (const paar of paare) {
    if (treffer.has(paar.schluessel) || vergeben.has(paar.buchung.id)) continue;
    treffer.set(paar.schluessel, paar.buchung);
    vergeben.add(paar.buchung.id);
  }
  return treffer;
}

const schluesselVon = (p: Planbuchung) => `${p.regelId}@${p.datum}`;

/** Eine Zeile aus den Plan-Posten eines Charakters, mit ihrem zugeordneten Ist. */
function zeileAusRegeln(
  id: AusblickZeileId,
  planPosten: readonly { p: Planbuchung; regel: Zahlungsregel }[],
  zugeordnet: ReadonlyMap<string, IstBuchung>,
  charakter: Planbuchung["charakter"],
): AusblickZeile {
  const posten = planPosten
    .filter((x) => x.p.charakter === charakter)
    .map(({ p }): AusblickPosten => {
      const treffer = zugeordnet.get(schluesselVon(p));
      return {
        schluessel: schluesselVon(p),
        bezeichnung: p.bezeichnung,
        datum: p.datum,
        plan: p.betrag,
        ist: treffer ? treffer.betrag : null,
        status: !treffer ? "offen" : treffer.planRef ? "bezahlt" : "gebucht",
      };
    })
    .sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

  return {
    id,
    plan: summe(posten.map((p) => p.plan)),
    ist: summe(posten.map((p) => p.ist ?? 0)),
    posten,
  };
}

/**
 * Budgets: geplant der geglättete Monatsanteil, gebucht der Verbrauch DES MONATS —
 * auch bei jährlicher Periode. Sonst stünde ein Zwölftel Plan gegen einen Jahresverbrauch.
 */
function budgetsZeile(
  budgets: readonly Budget[],
  offenesIst: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  von: string,
  bis: string,
  zukunft: boolean,
): AusblickZeile {
  const posten = budgets
    .map((b): AusblickPosten => {
      // `|| 0` fängt die negative Null: `-0` formatiert sich als „−0,00" und liest sich
      // wie eine Ausgabe, die es nicht gab.
      const roh = budgetVerbrauch(offenesIst, kategorien, b, budgets, von, bis);
      const verbrauch = zukunft ? null : -roh || 0;
      return {
        schluessel: b.id,
        // Der Name der Kategorie steht nicht im Budget — die Oberfläche löst ihn auf.
        bezeichnung: b.kategorieId,
        plan: geglaetteterMonatsabfluss(b, budgets, kategorien),
        ist: verbrauch,
        status: verbrauch == null || verbrauch === 0 ? "offen" : "gebucht",
      };
    })
    .sort((a, b) => a.plan - b.plan);

  return {
    id: "budgets",
    plan: summe(posten.map((p) => p.plan)),
    ist: zukunft ? null : summe(posten.map((p) => p.ist ?? 0)),
    posten,
  };
}

/**
 * Die monatliche Inventar-Rücklage als EINE Zeile, ohne Posten: die Aufschlüsselung nach
 * Gegenstand steht im Inventar, und drei aufklappbare Karten nebeneinander vertragen
 * keine vierte Ebene. Ohne Inventar entfällt die Zeile ganz, statt eine Null zu zeigen.
 *
 * Plan und Ist tragen denselben Betrag — die Rücklage wird nicht gebucht (siehe Kopf).
 */
function ruecklagenZeile(
  inventar: readonly Inventargegenstand[],
  zukunft: boolean,
): AusblickZeile | null {
  const rate = monatsRuecklageGesamt(inventar);
  if (rate === 0) return null;
  const plan = -rate; // Abfluss aus Sicht des verfügbaren Geldes
  return { id: "ruecklagen", plan, ist: zukunft ? null : plan, posten: [] };
}

/** Hängt einen Sammelposten für nicht geplantes Ist an eine Zeile, falls es welches gibt. */
function mitSammelposten(
  zeile: AusblickZeile,
  betrag: Cent,
  schluessel: string,
  zukunft: boolean,
): AusblickZeile {
  if (zukunft || betrag === 0) return zeile;
  return {
    ...zeile,
    ist: (zeile.ist ?? 0) + betrag,
    posten: [
      ...zeile.posten,
      { schluessel, bezeichnung: schluessel, plan: 0, ist: betrag, status: "ohnePlan" },
    ],
  };
}

const summe = (werte: readonly Cent[]): Cent => werte.reduce((s, w) => s + w, 0);

/**
 * Die drei Monate der Übersicht: der laufende und die beiden folgenden.
 * `heute` bestimmt den ersten — die Funktion liest selbst keine Uhr.
 */
export function monatsAusblicke(
  basis: Omit<MonatsAusblickEingabe, "monatAb">,
  anzahl = 3,
): MonatsAusblick[] {
  const start = parseIso(basis.heute);
  return Array.from({ length: Math.max(0, Math.floor(anzahl)) }, (_, i) =>
    monatsAusblick({ ...basis, monatAb: toIso({ ...addMonate(start, i), d: 1 }) }),
  );
}
