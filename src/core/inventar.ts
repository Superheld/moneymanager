// Inventargegenstand — Dinge, die man besitzt und ersetzen muss. Quelle für einen
// Ersatz-Topf (SPEC US-C1): Wiederbeschaffungswert + Nutzungsdauer → Ansparrate
// (kalkulatorische Abschreibung). Der Gegenstand ist die fachliche Wahrheit, der
// Ersatz-Topf das daraus abgeleitete Sparvehikel.

import type { Cent } from "./geld";
import type { Ersatztopf } from "./topf";

export interface Inventargegenstand {
  readonly id: string;
  readonly bezeichnung: string;
  readonly wiederbeschaffung: Cent;
  readonly nutzungsdauerMonate: number; // > 0
  /** Anschaffungs-/Startdatum für die Ansparung, ISO. */
  readonly anschaffung: string;
  readonly kategorieId?: string;
}

/** Leitet die Felder eines Ersatz-Topfes aus einem Inventargegenstand ab. */
export function ersatztopfFelder(g: Inventargegenstand): Omit<Ersatztopf, "id"> {
  return {
    typ: "ersatz",
    bezeichnung: g.bezeichnung,
    start: g.anschaffung,
    kategorieId: g.kategorieId,
    wiederbeschaffung: g.wiederbeschaffung,
    nutzungsdauerMonate: g.nutzungsdauerMonate,
    inventarId: g.id,
  };
}
