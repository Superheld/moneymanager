import { describe, it, expect } from "vitest";
import { ibanGueltig, normalisiereIban } from "./konto";
import { wuerdeZyklusErzeugen, type Kategorie } from "./kategorie";

describe("ibanGueltig", () => {
  it("akzeptiert gültige IBANs (auch mit Leerzeichen)", () => {
    expect(ibanGueltig("DE93 9999 9999 0000 0000 01")).toBe(true);
    expect(ibanGueltig("GB82WEST12345698765432")).toBe(true);
  });

  it("lehnt falsche Prüfsumme / Struktur ab", () => {
    expect(ibanGueltig("DE00 9999 9999 0000 0000 01")).toBe(false);
    expect(ibanGueltig("XX")).toBe(false);
    expect(ibanGueltig("1234567890")).toBe(false);
  });

  it("normalisiert Leerzeichen und Kleinbuchstaben", () => {
    expect(normalisiereIban("de93 9999 9999 0000 0000 01")).toBe("DE93999999990000000001");
  });
});

describe("wuerdeZyklusErzeugen", () => {
  const kategorien: Kategorie[] = [
    { id: "a", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
    { id: "b", name: "Lebensmittel", elternId: "a", defaultCharakter: "Aufwand" },
    { id: "c", name: "Bio", elternId: "b", defaultCharakter: "Aufwand" },
  ];

  it("kein Zyklus bei normalem Eltern-Wechsel", () => {
    expect(wuerdeZyklusErzeugen(kategorien, "c", "a")).toBe(false);
  });

  it("Selbstreferenz ist ein Zyklus", () => {
    expect(wuerdeZyklusErzeugen(kategorien, "a", "a")).toBe(true);
  });

  it("Eltern auf eigenen Nachfahren setzen ist ein Zyklus", () => {
    // a unter c hängen → c ist Nachfahre von a → Zyklus.
    expect(wuerdeZyklusErzeugen(kategorien, "a", "c")).toBe(true);
  });

  it("kein Eltern (Wurzel) ist nie ein Zyklus", () => {
    expect(wuerdeZyklusErzeugen(kategorien, "c", undefined)).toBe(false);
  });
});
