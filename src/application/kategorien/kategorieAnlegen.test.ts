import { describe, it, expect } from "vitest";
import type { Kategorie } from "../../core";
import type { KategorieRepository } from "../ports";
import { kategorieAnlegen } from "./kategorieAnlegen";

function memKategorie(): KategorieRepository & { daten: Kategorie[] } {
  const daten: Kategorie[] = [];
  return { daten, async alle() { return [...daten]; }, async speichern(k) { const i = daten.findIndex((x) => x.id === k.id); if (i >= 0) daten[i] = k; else daten.push(k); }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}

describe("kategorieAnlegen", () => {
  it("verlangt einen Namen", async () => {
    await expect(kategorieAnlegen(memKategorie(), { name: "", defaultCharakter: "Aufwand" })).rejects.toThrow("name.fehlt");
  });
  it("legt eine Unterkategorie unter eine Elternkategorie", async () => {
    const repo = memKategorie();
    const eltern = await kategorieAnlegen(repo, { name: "Wohnen", defaultCharakter: "Aufwand" });
    const kind = await kategorieAnlegen(repo, { name: "Miete", elternId: eltern.id, defaultCharakter: "Aufwand" });
    expect(kind.elternId).toBe(eltern.id);
  });
  it("verhindert einen Zyklus (Kategorie wird ihr eigener Vorfahr)", async () => {
    const repo = memKategorie();
    const a = await kategorieAnlegen(repo, { name: "A", defaultCharakter: "Aufwand" });
    const b = await kategorieAnlegen(repo, { name: "B", elternId: a.id, defaultCharakter: "Aufwand" });
    // A unter B hängen → Zyklus
    await expect(kategorieAnlegen(repo, { name: "A", elternId: b.id, defaultCharakter: "Aufwand" }, a.id)).rejects.toThrow("kategorie.zyklus");
  });
});
