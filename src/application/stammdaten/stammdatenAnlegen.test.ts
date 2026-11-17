import { describe, it, expect } from "vitest";
import type { Person } from "../../core";
import type { PersonRepository } from "../ports";
import { personAnlegen } from "./stammdatenAnlegen";

function memPerson(): PersonRepository & { daten: Person[] } {
  const daten: Person[] = [];
  return { daten, async alle() { return [...daten]; }, async speichern(p) { const i = daten.findIndex((x) => x.id === p.id); if (i >= 0) daten[i] = p; else daten.push(p); }, async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); } };
}
describe("personAnlegen", () => {
  it("verlangt einen Namen", async () => {
    await expect(personAnlegen(memPerson(), { name: "  " })).rejects.toThrow("name.fehlt");
  });
  it("legt eine Person an", async () => {
    const repo = memPerson();
    const p = await personAnlegen(repo, { name: "Anna", rolle: "Inhaberin" });
    expect(p.name).toBe("Anna");
    expect(repo.daten).toHaveLength(1);
  });
});
