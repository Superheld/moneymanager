// Budgetvorschläge — die Budget-Hälfte der Ausgabenvorschläge und der Merkzettel der
// weggeklickten.
//
// Geladen und eingestuft wird in `../ausgabenvorschlaege.ts`, zusammen mit den
// Rücklagen: eine Kategorie, in der nur selten etwas anfällt, steht hier nicht, sondern
// im Bereich Rücklagen (`../ruecklagen/ruecklagenvorschlaege.ts`). Bis 2026-11-16 kam
// sie hier mit der Art „Rücklage" heraus und öffnete im Bereich Budgets den Dialog einer
// Rücklage — wer ein Budget erwartete, fand danach keins.
//
// Der Merkzettel `budgetvorschlag.ignoriert` ist älter als die Trennung. Was darin
// steht, wurde womöglich als Rücklage verworfen; der Bereich Rücklagen liest ihn deshalb
// mit, schreibt aber nur seinen eigenen. Der Schlüssel steht darum direkt in
// `src/application/` (`../ausgabenvorschlaege.ts`), nicht hier.

import { ignorierenVermerken, ignorierteLesen } from "../einstellungen";
import type { Budgetvorschlag, Ruecklage } from "../../core";
import { ausgabenvorschlaegeLaden, ohneVerworfene, SCHLUESSEL_BUDGETVORSCHLAG_IGNORIERT } from "../ausgabenvorschlaege";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragszuordnungRepository,
} from "../ports";

export async function ignorierteBudgetvorschlaege(
  repo: EinstellungenRepository,
): Promise<Set<string>> {
  return ignorierteLesen(repo, SCHLUESSEL_BUDGETVORSCHLAG_IGNORIERT);
}

export async function budgetvorschlagIgnorieren(
  repo: EinstellungenRepository,
  kategorieId: string,
): Promise<void> {
  await ignorierenVermerken(repo, SCHLUESSEL_BUDGETVORSCHLAG_IGNORIERT, kategorieId);
}

/**
 * Budgetvorschläge für Hauptkategorien ohne Budget und ohne Rücklage.
 *
 * `bisMonat` ist „YYYY-MM" — der letzte Monat des Auswertungsfensters. `heute` braucht
 * nur die Vertragserkennung, um laufende von beendeten Verträgen zu trennen.
 */
export async function budgetvorschlaegeLaden(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
  kategorieRepo: KategorieRepository,
  budgetRepo: BudgetRepository,
  bisMonat: string,
  heute: string,
  ignoriert: ReadonlySet<string> = new Set(),
  /** Die erfassten Buchung↔Vertrag-Verknüpfungen; ohne sie zählen nur die Kandidaten. */
  zuordnungRepo?: VertragszuordnungRepository,
  /** Die Anteile, die eine Rücklage trägt oder die warten (`ruecklagenAnteile`). */
  vonRuecklagen: ReadonlySet<string> = new Set(),
  /** Die laufenden Rücklagen: an ihrer Kategorie wird kein Budget vorgeschlagen. */
  ruecklagen: readonly Pick<Ruecklage, "kategorieId">[] = [],
): Promise<Budgetvorschlag[]> {
  const { budgets } = await ausgabenvorschlaegeLaden(
    { ledger, umsatzRepo, kategorieRepo, budgetRepo, zuordnungRepo },
    bisMonat, heute, vonRuecklagen, ruecklagen,
  );
  return ohneVerworfene(budgets, ignoriert);
}
