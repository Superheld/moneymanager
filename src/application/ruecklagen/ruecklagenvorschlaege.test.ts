import { describe, expect, it } from "vitest";
import type { EinstellungenRepository } from "../ports";
import { budgetvorschlagIgnorieren, ignorierteBudgetvorschlaege } from "../budgets/budgetvorschlaege";
import { ignorierteRuecklagenvorschlaege, ruecklagenvorschlagIgnorieren } from "./ruecklagenvorschlaege";

function speicher() {
  const kv: Record<string, string> = {};
  const repo: EinstellungenRepository = {
    async lesen() { return { ...kv }; },
    async schreiben(k, v) { kv[k] = v; },
  };
  return { kv, repo };
}

/**
 * Der Merkzettel ist je Bereich getrennt — mit einer Ausnahme, die Absicht ist: was vor
 * der Trennung im Bereich Budgets verworfen wurde, kann eine Rücklage gewesen sein, und
 * es soll hier nicht wieder auftauchen.
 */
describe("Merkzettel der Rücklagenvorschläge", () => {
  it("schreibt nur in seinen eigenen Schlüssel", async () => {
    const { kv, repo } = speicher();
    await ruecklagenvorschlagIgnorieren(repo, "trevik");
    expect(Object.keys(kv)).toEqual(["ruecklagenvorschlag.ignoriert"]);
    expect(await ignorierteRuecklagenvorschlaege(repo)).toEqual(new Set(["trevik"]));
    // Der Bereich Budgets sieht davon nichts: dort war es keine Entscheidung.
    expect(await ignorierteBudgetvorschlaege(repo)).toEqual(new Set());
  });

  it("liest den alten Schlüssel der Budgets mit", async () => {
    const { repo } = speicher();
    // So steht es im Bestand: eine Rücklage, verworfen über „kein Budget".
    await budgetvorschlagIgnorieren(repo, "olvar");
    await ruecklagenvorschlagIgnorieren(repo, "trevik");
    expect(await ignorierteRuecklagenvorschlaege(repo)).toEqual(new Set(["olvar", "trevik"]));
  });

  it("kommt ohne jeden Eintrag zurecht", async () => {
    const { repo } = speicher();
    expect(await ignorierteRuecklagenvorschlaege(repo)).toEqual(new Set());
  });
});
