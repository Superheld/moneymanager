// Was jede Rechnung über Rücklagen gemeinsam lesen muss — EIN Ladeweg.
//
// Seit Paket 3 des Umbaus findet eine Rücklage ihre Ausgaben über die Kategorie, und wer
// eine Buchung trägt, entscheidet die Zuständigkeit (`core/ruecklagen/zustaendigkeit.ts`).
// Die braucht vier Dinge: die laufenden Rücklagen, die beendeten (eine beendete trägt ihre
// Kategorie bis zu ihrem Ende), die Ausbuchungen (alte Verknüpfungen) und die
// ausdrücklichen Zuordnungen. Fehlte einer Sicht davon eines, zeigte sie für dieselbe
// Buchung eine andere Einordnung als die Ergebnisrechnung — deshalb lädt jede es hier.

import type { Ruecklage, Ruecklagenzuordnung, Ruecklagenzyklus } from "../../core";
import type { RuecklagenRepository, RuecklagenzuordnungRepository } from "../ports";

export interface Ruecklagenbestand {
  /** Die laufenden (`alle()`). */
  readonly ruecklagen: readonly Ruecklage[];
  /** Die beendeten (`beendete()`), über ihren eigenen Weg. */
  readonly beendete: readonly Ruecklage[];
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  readonly ruecklagenzuordnungen: readonly Ruecklagenzuordnung[];
}

export async function ruecklagenbestandLaden(
  ruecklagenRepo: RuecklagenRepository,
  zuordnungRepo: RuecklagenzuordnungRepository,
): Promise<Ruecklagenbestand> {
  const [ruecklagen, beendete, ausbuchungen, ruecklagenzuordnungen] = await Promise.all([
    ruecklagenRepo.alle(),
    ruecklagenRepo.beendete(),
    ruecklagenRepo.ausbuchungen(),
    zuordnungRepo.alle(),
  ]);
  return { ruecklagen, beendete, ausbuchungen, ruecklagenzuordnungen };
}

/** Alle Rücklagen, beendete eingeschlossen — so, wie die Zuständigkeit sie erwartet. */
export function alleRuecklagen(b: Pick<Ruecklagenbestand, "ruecklagen" | "beendete">): Ruecklage[] {
  return [...b.ruecklagen, ...b.beendete];
}
