// Kategorie — Querschnittsdimension über allen Strömen, Basis der Analysen
// (KONZEPT §3.5). Als Baum (optionale Elternkategorie), ohne Zyklen. Trägt einen
// Default-Charakter, den Ströme erben können.

import type { Charakter } from "./zahlungsregel";

export interface Kategorie {
  readonly id: string;
  readonly name: string;
  readonly elternId?: string;
  readonly defaultCharakter: Charakter;
}

/**
 * Würde das Setzen von `elternId` für `id` einen Zyklus erzeugen? Reine Funktion
 * über die bestehende Kategorienliste. Zyklus, wenn der neue Elternknoten der
 * Knoten selbst oder ein Nachfahre von ihm ist (d. h. `id` ein Vorfahr von `elternId`).
 */
export function wuerdeZyklusErzeugen(
  kategorien: Kategorie[],
  id: string,
  elternId: string | undefined,
): boolean {
  if (!elternId) return false;
  if (elternId === id) return true;
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  let aktuell = byId.get(elternId);
  let schutz = 0;
  while (aktuell && schutz++ < 10000) {
    if (aktuell.id === id) return true;
    aktuell = aktuell.elternId ? byId.get(aktuell.elternId) : undefined;
  }
  return false;
}
