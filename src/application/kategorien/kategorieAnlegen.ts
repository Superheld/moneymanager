// Eine Kategorie anlegen oder umhängen — mit Validierung, auch gegen einen Zyklus im Baum.
// ID-Erzeugung lebt hier (nicht im Core, der pure bleibt). Bis 2026-11-17 in
// `stammdaten/stammdatenAnlegen.ts`; der Baum ist ein eigener Bereich, sein Anlegen gehört
// zu ihm.

import {
  FachlicherFehler,
  wuerdeZyklusErzeugen,
  type Charakter,
  type Kategorie,
} from "../../core";
import type { KategorieRepository } from "../ports";

export interface KategorieEingabe {
  name: string;
  elternId?: string;
  defaultCharakter: Charakter;
}

export async function kategorieAnlegen(
  repo: KategorieRepository,
  eingabe: KategorieEingabe,
  id?: string,
): Promise<Kategorie> {
  const name = eingabe.name.trim();
  if (!name) throw new FachlicherFehler("name.fehlt");

  const kid = id ?? crypto.randomUUID();
  if (eingabe.elternId) {
    const bestehende = await repo.alle();
    // Beim Bearbeiten existiert der Knoten schon; sonst für die Prüfung ergänzen.
    const mitNeu = bestehende.some((k) => k.id === kid)
      ? bestehende
      : [...bestehende, { id: kid, name, defaultCharakter: eingabe.defaultCharakter }];
    if (wuerdeZyklusErzeugen(mitNeu, kid, eingabe.elternId)) {
      throw new FachlicherFehler("kategorie.zyklus");
    }
  }

  const kategorie: Kategorie = {
    id: kid,
    name,
    elternId: eingabe.elternId || undefined,
    defaultCharakter: eingabe.defaultCharakter,
  };
  await repo.speichern(kategorie);
  return kategorie;
}
