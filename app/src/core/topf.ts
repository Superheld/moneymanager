// Topf — Zweckbindung auf der Passiva-Seite (KONZEPT §3.2). Drei Spielarten EINES
// Konzepts: laufender Saldo mit optionalem, getyptem Zielwert.
//   • Ersatz   (Rücklage):    Wiederbeschaffung + Nutzungsdauer → Ansparrate (Abschreibung)
//   • Puffer   (Rückstellung): Schätzbetrag + Zeitfenster
//   • Spartopf (Freitopf):    Zuführung/Monat, OPTIONALES Sparziel (sonst kein Sollstand)
// Töpfe sind NICHT kontogebunden; sie werden durch Kontostände gedeckt (Deckung = Linse).

import { monateZwischen } from "./datum";
import type { Cent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import type { Charakter } from "./zahlungsregel";

export type TopfTyp = "ersatz" | "puffer" | "spartopf";

interface TopfBasis {
  readonly id: string;
  readonly bezeichnung: string;
  readonly start: string; // ISO „YYYY-MM-DD"
  readonly kategorieId?: string;
}

export interface Ersatztopf extends TopfBasis {
  readonly typ: "ersatz";
  readonly wiederbeschaffung: Cent; // Zielwert
  readonly nutzungsdauerMonate: number; // > 0
  /** Herkunft: aus diesem Inventargegenstand abgeleitet (P2.5). Optional. */
  readonly inventarId?: string;
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

export type Topf = Ersatztopf | Puffertopf | Spartopf;

/** Zielwert des Topfes, oder null (Spartopf ohne Sparziel). */
export function zielwert(topf: Topf): Cent | null {
  switch (topf.typ) {
    case "ersatz":
      return topf.wiederbeschaffung;
    case "puffer":
      return topf.schaetzbetrag;
    case "spartopf":
      return topf.sparziel ?? null;
  }
}

/** Monatliche Ansparrate (kalkulatorischer Zufluss). */
export function ansparrate(topf: Topf): Cent {
  switch (topf.typ) {
    case "ersatz":
      return Math.round(topf.wiederbeschaffung / topf.nutzungsdauerMonate);
    case "puffer":
      return Math.round(topf.schaetzbetrag / topf.fristMonate);
    case "spartopf":
      return topf.zufuehrungProMonat;
  }
}

/**
 * Plan-Sollstand am Datum `am`: linear angespart ab `start`, gedeckelt auf den
 * Zielwert. null, wenn kein Zielwert existiert (Spartopf ohne Sparziel) — dann gibt
 * es nur einen laufenden Stand (real, ab P3), keinen Soll.
 */
export function sollstand(topf: Topf, am: string): Cent | null {
  const ziel = zielwert(topf);
  if (ziel == null) return null;
  const monate = Math.max(0, monateZwischen(topf.start, am));
  return Math.min(ansparrate(topf) * monate, ziel);
}

/**
 * Charakter einer Topf-Entnahme nach Topf-Typ (ADR-0003 §5). Aus dem Gegenkonto-Typ
 * abgeleitet, nicht frei gewählt:
 *  • Ersatz/Puffer (Rücklage/Rückstellung): Entnahme = **Umschichtung** — die
 *    Vorsorge wird aufgelöst, der Aufwand wurde über die Nutzungsdauer schon getragen.
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
 * Bei **Ersatz** zählen nur Entnahmen NACH dem aktuellen Zyklus-Start: die „ersetzt"-
 * Aktion setzt `start` auf den Anschaffungstag und schließt damit den alten Zyklus ab;
 * die auslösende Entnahme liegt auf dem Start und gehört nicht mehr in den neuen Aufbau.
 *
 * Ein negativer Stand = Überziehung (mehr entnommen als angespart) — der einzige echte
 * GuV-Effekt einer Unterdeckung; die UI weist ihn aus.
 */
export function topfStand(topf: Topf, am: string, entnahmen: IstBuchung[]): Cent {
  const monate = Math.max(0, monateZwischen(topf.start, am));
  const ziel = zielwert(topf);
  const roh = ansparrate(topf) * monate;
  const aufbau = ziel == null ? roh : Math.min(roh, ziel);
  const relevant =
    topf.typ === "ersatz" ? entnahmen.filter((b) => b.datum > topf.start) : entnahmen;
  const summeEntnahmen = relevant.reduce((s, b) => s + b.betrag, 0);
  return aufbau + summeEntnahmen;
}
