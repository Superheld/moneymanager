// Rücklagenvorschläge — die Rücklagen-Hälfte der Ausgabenvorschläge und ihr Merkzettel.
//
// Eine Kategorie, in der nur selten etwas anfällt, dann aber viel (die Jahresversicherung,
// die Reparatur), bekommt keinen Monatsrahmen vorgeschlagen, sondern eine Rücklage, die
// weiterläuft. Bis 2026-11-16 stand dieser Vorschlag im Bereich Budgets, mit der Art
// „Rücklage" in derselben Tabelle wie die Budgets; wer ihn dort übernahm, fand das
// Ergebnis anschliessend in einem anderen Bereich. Er steht jetzt hier, wo er landet.
//
// Eingestuft wird an EINER Stelle für beide Bereiche (`../ausgabenvorschlaege.ts`), damit
// keine Kategorie in beiden Listen oder in keiner steht. Hier bleibt nur, was den Bereich
// angeht: welche Anteile schon eine Rücklage trägt, und was verworfen ist.
//
// Der MERKZETTEL hat zwei Schlüssel, und das ist Absicht. Geschrieben wird nur der eigene
// (`ruecklagenvorschlag.ignoriert`); gelesen wird dazu der der Budgets: bis zur Trennung
// verwarf man auch eine Rücklage über „kein Budget", und was dort steht, soll hier nicht
// wieder auftauchen. Eine Migration braucht es dafür nicht — es ist dieselbe Tabelle,
// nur ein Schlüssel mehr beim Lesen.

import { ignorierenVermerken, ignorierteLesen } from "../einstellungen";
import { ruecklagenAnteile, type Ruecklagenvorschlag } from "../../core";
import { ausgabenvorschlaegeLaden, ohneVerworfene } from "../ausgabenvorschlaege";
import { ignorierteBudgetvorschlaege } from "../budgets/budgetvorschlaege";
import { anspruchsbestandLaden, type BudgetanspruchDeps } from "../konten/kontobelegung";
import type { EinstellungenRepository, UmsatzRepository } from "../ports";

const SCHLUESSEL_IGNORIERT = "ruecklagenvorschlag.ignoriert";

export interface RuecklagenvorschlagDeps extends BudgetanspruchDeps {
  readonly umsatzRepo: UmsatzRepository;
  readonly einstellungenRepo: EinstellungenRepository;
}

/** Was im Bereich Rücklagen verworfen ist — der eigene Merkzettel und der alte der Budgets. */
export async function ignorierteRuecklagenvorschlaege(
  repo: EinstellungenRepository,
): Promise<Set<string>> {
  const [eigene, alte] = await Promise.all([
    ignorierteLesen(repo, SCHLUESSEL_IGNORIERT),
    ignorierteBudgetvorschlaege(repo),
  ]);
  return new Set([...eigene, ...alte]);
}

/** Merkt sich, dass hier keine Rücklage gewünscht ist. Den Bereich Budgets berührt das nicht. */
export async function ruecklagenvorschlagIgnorieren(
  repo: EinstellungenRepository,
  kategorieId: string,
): Promise<void> {
  await ignorierenVermerken(repo, SCHLUESSEL_IGNORIERT, kategorieId);
}

/**
 * Rücklagenvorschläge für Hauptkategorien, an denen weder ein Budget noch eine Rücklage
 * hängt, ohne die verworfenen.
 *
 * Die Anteile, die eine Rücklage schon trägt, kommen aus derselben Sicht wie im Bereich
 * Budgets (`budgetsichtMit`), damit dieselbe Kategorie hier wie dort denselben Betrag
 * bekommt.
 */
export async function ruecklagenvorschlaegeLaden(
  deps: RuecklagenvorschlagDeps,
  heute: string,
): Promise<Ruecklagenvorschlag[]> {
  const [{ sicht }, ruecklagen, ignoriert] = await Promise.all([
    anspruchsbestandLaden(deps),
    deps.ruecklagenRepo.alle(),
    ignorierteRuecklagenvorschlaege(deps.einstellungenRepo),
  ]);
  const { ruecklagen: vorschlaege } = await ausgabenvorschlaegeLaden(
    deps, heute.slice(0, 7), heute, ruecklagenAnteile(sicht), ruecklagen,
  );
  return ohneVerworfene(vorschlaege, ignoriert);
}
