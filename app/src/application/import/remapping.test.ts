import { describe, expect, it } from "vitest";
import { STANDARDKATEGORIEN } from "../standardkategorien";
import { FG_REMAPPING, unsereKategorieFuer } from "./remapping";

// Alle gültigen Kategorie-Namen (Gruppen + Kinder) aus dem Standard-Baum.
const GUELTIGE_NAMEN = new Set<string>(
  STANDARDKATEGORIEN.flatMap((g) => [g.name, ...g.kinder.map((k) => (typeof k === "string" ? k : k.name))]),
);

describe("unsereKategorieFuer", () => {
  it("mappt bekannte Finanzguru-Unterkategorien", () => {
    expect(unsereKategorieFuer("Restaurants")).toBe("Auswärts essen");
    expect(unsereKategorieFuer("Tanken")).toBe("Sprit & Laden");
  });

  it("liefert null für Unbekanntes und Leeres", () => {
    expect(unsereKategorieFuer("Gibt es nicht")).toBeNull();
    expect(unsereKategorieFuer(undefined)).toBeNull();
    expect(unsereKategorieFuer("")).toBeNull();
  });

  it("trimmt den Eingabewert", () => {
    expect(unsereKategorieFuer("  Apotheke  ")).toBe("Arzt & Apotheke");
  });
});

describe("Remapping-Konsistenz", () => {
  it("jeder Zielname existiert im aktuellen Standard-Kategorie-Baum", () => {
    const fehlend = [...new Set(Object.values(FG_REMAPPING))].filter((name) => !GUELTIGE_NAMEN.has(name));
    expect(fehlend).toEqual([]);
  });
});
