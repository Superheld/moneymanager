// Topf — Zweckbindung auf der Passiva-Seite (KONZEPT §3.2). Drei Spielarten EINES
// Konzepts: laufender Saldo mit optionalem, getyptem Zielwert.
//   • Ersatz   (Rücklage):    Wiederbeschaffung + Nutzungsdauer → Ansparrate (Abschreibung)
//   • Puffer   (Rückstellung): Schätzbetrag + Zeitfenster
//   • Spartopf (Freitopf):    Zuführung/Monat, OPTIONALES Sparziel (sonst kein Sollstand)
// Töpfe sind NICHT kontogebunden; sie werden durch Kontostände gedeckt (Deckung = Linse).

import { monateZwischen } from "./datum";
import type { Cent } from "./geld";

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
