// Use-Case „Projektion laden" — lädt alle Zahlungsregeln über den Port und
// reicht sie an die pure Projektionsfunktion des Kerns. Die Berechnung selbst
// lebt im Core; hier wird nur orchestriert.

import { projiziereVerlauf, type Cent, type MonatsVerlauf } from "../core";
import type { ZahlungsregelRepository } from "./ports";

export interface ProjektionParameter {
  /** Erster Monat des Fensters, ISO „YYYY-MM-01". */
  ab: string;
  monate: number;
  startsaldo: Cent;
}

export async function projektionLaden(
  repo: ZahlungsregelRepository,
  p: ProjektionParameter,
): Promise<MonatsVerlauf[]> {
  const regeln = await repo.alle();
  return projiziereVerlauf(regeln, p.ab, p.monate, p.startsaldo);
}
