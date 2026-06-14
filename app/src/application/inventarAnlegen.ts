// Use-Cases rund ums Inventar: Gegenstand anlegen und daraus einen Ersatz-Topf
// ableiten (SPEC US-C1). Der Topf bekommt die Werte des Gegenstands + Rückverweis.

import {
  ersatztopfFelder,
  euroZuCent,
  type Ersatztopf,
  type Inventargegenstand,
} from "../core";
import type { InventarRepository, TopfRepository } from "./ports";

export interface InventarEingabe {
  bezeichnung: string;
  wiederbeschaffungEuro: number;
  nutzungsdauerMonate: number;
  anschaffung: string; // ISO
  kategorieId?: string;
}

export async function inventarAnlegen(
  repo: InventarRepository,
  e: InventarEingabe,
): Promise<Inventargegenstand> {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new Error("Bitte eine Bezeichnung angeben.");
  if (!(e.wiederbeschaffungEuro > 0)) throw new Error("Wiederbeschaffungswert muss größer als 0 sein.");
  if (!(e.nutzungsdauerMonate > 0)) throw new Error("Nutzungsdauer (Monate) muss größer als 0 sein.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.anschaffung)) throw new Error("Bitte ein gültiges Anschaffungsdatum angeben.");

  const gegenstand: Inventargegenstand = {
    id: crypto.randomUUID(),
    bezeichnung,
    wiederbeschaffung: euroZuCent(e.wiederbeschaffungEuro),
    nutzungsdauerMonate: Math.round(e.nutzungsdauerMonate),
    anschaffung: e.anschaffung,
    kategorieId: e.kategorieId || undefined,
  };
  await repo.speichern(gegenstand);
  return gegenstand;
}

/** Legt aus einem Inventargegenstand einen Ersatz-Topf an (Ansparrate ergibt sich). */
export async function ersatztopfAusInventar(
  topfRepo: TopfRepository,
  gegenstand: Inventargegenstand,
): Promise<Ersatztopf> {
  const topf: Ersatztopf = { id: crypto.randomUUID(), ...ersatztopfFelder(gegenstand) };
  await topfRepo.speichern(topf);
  return topf;
}
