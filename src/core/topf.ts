// Topf — Zweckbindung auf der Passiva-Seite (KONZEPT §3.2). Zwei Spielarten EINES
// Konzepts: laufender Saldo mit optionalem, getyptem Zielwert.
//   • Puffer   (Rückstellung): Schätzbetrag + Zeitfenster
//   • Spartopf (Freitopf):    Zuführung/Monat, OPTIONALES Sparziel (sonst kein Sollstand)
// Töpfe sind NICHT kontogebunden.
//
// Den Ersatz-Topf gab es hier einmal als dritte Spielart (Rücklage für Inventar). Er ist
// 2026-08-16 entfallen: das Inventar rechnet seine Rücklage selbst (rein kalkulatorisch,
// siehe inventar.ts) und gleicht sie gegen einen echten Kontostand ab, statt ein eigenes
// Sparvehikel zu führen.

import { monateZwischen } from "./datum";
import type { Cent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import type { Charakter } from "./zahlungsregel";

export type TopfTyp = "puffer" | "spartopf";

interface TopfBasis {
  readonly id: string;
  readonly bezeichnung: string;
  readonly start: string; // ISO „YYYY-MM-DD"
  readonly kategorieId?: string;
}

export interface Puffertopf extends TopfBasis {
  readonly typ: "puffer";
  readonly schaetzbetrag: Cent; // Zielwert
  readonly fristMonate: number; // Zeitfenster ab start, > 0
}

export interface Spartopf extends TopfBasis {
  readonly typ: "spartopf";
  readonly zufuehrungProMonat: Cent;
  readonly sparziel?: Cent; // optionaler Zielwert
}

export type Topf = Puffertopf | Spartopf;

/** Zielwert des Topfes, oder null (Spartopf ohne Sparziel). */
export function zielwert(topf: Topf): Cent | null {
  switch (topf.typ) {
    case "puffer":
      return topf.schaetzbetrag;
    case "spartopf":
      return topf.sparziel ?? null;
  }
}

/**
 * Monatliche Ansparrate (kalkulatorischer Zufluss).
 *
 * Rückfalllinie gegen einen Zeitraum von 0: die Division ergäbe Infinity, und über
 * `Infinity * 0` wird daraus in sollstand/topfStand NaN — ein Wert, der weder `>` noch
 * `<` erfüllt, jede Warnlogik still auf false fallen lässt und in der UI als „NaN"
 * erscheint. Der eigentliche Schutz sitzt an der Grenze (topfAnlegen prüft > 0); dies
 * hier fängt Aggregate ab, die vor diesem Schutz in die DB gelangt sind.
 */
export function ansparrate(topf: Topf): Cent {
  switch (topf.typ) {
    case "puffer":
      return topf.fristMonate > 0 ? Math.round(topf.schaetzbetrag / topf.fristMonate) : 0;
    case "spartopf":
      return topf.zufuehrungProMonat;
  }
}

/**
 * Plan-Sollstand am Datum `am`: linear angespart ab `start`, gedeckelt auf den
 * Zielwert. null, wenn kein Zielwert existiert (Spartopf ohne Sparziel) — dann gibt
 * es nur einen laufenden Stand, keinen Soll.
 */
export function sollstand(topf: Topf, am: string): Cent | null {
  const ziel = zielwert(topf);
  if (ziel == null) return null;
  const monate = Math.max(0, monateZwischen(topf.start, am));
  return anteiligerAufbau(topf, monate, ziel);
}

/**
 * Aufbau nach `monate` Monaten, gedeckelt am Ziel.
 *
 * Anteilig AUS DEM ZIEL gerechnet, nicht als (gerundete Rate × Monate): sonst fehlte am
 * Ende der Frist ein Rest, weil die Rate einmal gerundet und dann vervielfacht wurde
 * (1000 Cent auf 3 Monate → Rate 333 → nach 3 Monaten 999). Die fachliche Zusage lautet,
 * dass am Ende des Zeitfensters der Schätzbetrag beisammen ist — die hält nur diese
 * Rechnung ein. Der Rundungsrest verteilt sich so über die Laufzeit, statt hinten
 * liegen zu bleiben.
 */
function anteiligerAufbau(topf: Topf, monate: number, ziel: Cent): Cent {
  const dauer = topf.typ === "puffer" ? topf.fristMonate : 0;
  if (dauer > 0) return Math.min(Math.round((ziel * monate) / dauer), ziel);
  // Spartopf: kein Enddatum, der Aufbau folgt der gesetzten Zuführung.
  return Math.min(ansparrate(topf) * monate, ziel);
}

/**
 * Charakter einer Topf-Entnahme nach Topf-Typ (ADR-0003 §5). Aus dem Gegenkonto-Typ
 * abgeleitet, nicht frei gewählt:
 *  • Puffer (Rückstellung): Entnahme = **Umschichtung** — die Vorsorge wird aufgelöst,
 *    der Aufwand wurde über das Zeitfenster schon getragen.
 *  • Spartopf (Konsumsparen): Entnahme = **Aufwand** — jetzt erst entsteht der Konsum.
 */
export function entnahmeCharakter(typ: TopfTyp): Charakter {
  return typ === "spartopf" ? "Aufwand" : "Umschichtung";
}

/**
 * Realer Topf-Stand am Datum `am`: kalkulatorischer Aufbau (lineare Zuführung ab
 * `start`, bei vorhandenem Ziel gedeckelt) **minus** die realen Entnahmen (Ist-Buchungen
 * mit Verwendung = dieser Topf, ADR-0003 §6). `entnahmen` sind die Buchungen DIESES
 * Topfes; ihre Beträge sind negativ (Abfluss) und senken den Stand.
 *
 * Ein negativer Stand = Überziehung (mehr entnommen als angespart) — der einzige echte
 * GuV-Effekt einer Unterdeckung; die UI weist ihn aus.
 */
export function topfStand(topf: Topf, am: string, entnahmen: IstBuchung[]): Cent {
  const monate = Math.max(0, monateZwischen(topf.start, am));
  const ziel = zielwert(topf);
  const aufbau =
    ziel == null ? ansparrate(topf) * monate : anteiligerAufbau(topf, monate, ziel);
  const summeEntnahmen = entnahmen.reduce((s, b) => s + b.betrag, 0);
  return aufbau + summeEntnahmen;
}
