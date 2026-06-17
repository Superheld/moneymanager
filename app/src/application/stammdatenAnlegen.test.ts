import { describe, it, expect } from "vitest";
import { euroZuCent, type Kategorie, type Person, type Zahlungskonto } from "../core";
import type { KategorieRepository, PersonRepository, ZahlungskontoRepository } from "./ports";
import { kategorieAnlegen, kontoAnlegen, personAnlegen } from "./stammdatenAnlegen";

function memPerson(): PersonRepository & { daten: Person[] } {
  const daten: Person[] = [];
  return { daten, async alle() { return [...daten]; }, async speichern(p) { const i = daten.findIndex((x) => x.id === p.id); if (i >= 0) daten[i] = p; else daten.push(p); }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}
function memKonto(): ZahlungskontoRepository & { daten: Zahlungskonto[] } {
  const daten: Zahlungskonto[] = [];
  return { daten, async alle() { return [...daten]; }, async speichern(k) { const i = daten.findIndex((x) => x.id === k.id); if (i >= 0) daten[i] = k; else daten.push(k); }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}
function memKategorie(): KategorieRepository & { daten: Kategorie[] } {
  const daten: Kategorie[] = [];
  return { daten, async alle() { return [...daten]; }, async speichern(k) { const i = daten.findIndex((x) => x.id === k.id); if (i >= 0) daten[i] = k; else daten.push(k); }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}

describe("personAnlegen", () => {
  it("verlangt einen Namen", async () => {
    await expect(personAnlegen(memPerson(), { name: "  " })).rejects.toThrow(/Namen/);
  });
  it("legt eine Person an", async () => {
    const repo = memPerson();
    const p = await personAnlegen(repo, { name: "Anna", rolle: "Inhaberin" });
    expect(p.name).toBe("Anna");
    expect(repo.daten).toHaveLength(1);
  });
});

describe("kontoAnlegen", () => {
  it("rechnet den Anfangsbestand in Cent", async () => {
    const repo = memKonto();
    const k = await kontoAnlegen(repo, { bezeichnung: "Giro", typ: "Giro", saldoEuro: 1000 });
    expect(k.saldo).toBe(euroZuCent(1000));
  });
  it("ohne Saldo → 0", async () => {
    const k = await kontoAnlegen(memKonto(), { bezeichnung: "Bar", typ: "Bargeld" });
    expect(k.saldo).toBe(0);
  });
  it("weist eine ungültige IBAN ab", async () => {
    await expect(kontoAnlegen(memKonto(), { bezeichnung: "Giro", typ: "Giro", iban: "DE00 0000" })).rejects.toThrow(/IBAN/);
  });
});

describe("kategorieAnlegen", () => {
  it("verlangt einen Namen", async () => {
    await expect(kategorieAnlegen(memKategorie(), { name: "", defaultCharakter: "Aufwand" })).rejects.toThrow(/Namen/);
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
    await expect(kategorieAnlegen(repo, { name: "A", elternId: b.id, defaultCharakter: "Aufwand" }, a.id)).rejects.toThrow(/Zyklus/);
  });
});
