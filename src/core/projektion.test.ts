import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { Zahlungsregel } from "./zahlungsregel";
import { naechsteFaelligkeit, projiziereRegel } from "./projektion";

function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
  return {
    id: "r1",
    bezeichnung: "Test",
    betrag: euroZuCent(-100),
    rhythmus: "monatlich",
    startdatum: "2026-01-15",
    charakter: "Aufwand",
    ...over,
  };
}

describe("projiziereRegel", () => {
  it("monatlich → 12 Fälligkeiten im 12-Monats-Fenster", () => {
    const b = projiziereRegel(regel(), "2026-01-01", 12);
    expect(b).toHaveLength(12);
    expect(b[0].datum).toBe("2026-01-15");
    expect(b[11].datum).toBe("2026-12-15");
  });

  it("jährlich → genau eine Fälligkeit pro Jahr im Fenster", () => {
    const b = projiziereRegel(
      regel({ rhythmus: "jaehrlich", startdatum: "2026-03-01" }),
      "2026-01-01",
      12,
    );
    expect(b).toHaveLength(1);
    expect(b[0].datum).toBe("2026-03-01");
  });

  it("überspringt Fälligkeiten vor dem Fensterstart", () => {
    // Regel startet 2025, Fenster beginnt 2026 → nur Fälligkeiten ab 2026.
    const b = projiziereRegel(
      regel({ rhythmus: "quartalsweise", startdatum: "2025-02-10" }),
      "2026-01-01",
      12,
    );
    // 2025-02,05,08,11 fallen raus; ab 2026: 02,05,08,11 → 4 Stück.
    expect(b.map((x) => x.datum)).toEqual([
      "2026-02-10",
      "2026-05-10",
      "2026-08-10",
      "2026-11-10",
    ]);
  });

  it("lässt bereits bezahlte Fälligkeiten aus der Vorschau weg", () => {
    const bezahlt = new Set(["r1@2026-02-15"]);
    const b = projiziereRegel(regel(), "2026-01-01", 12, bezahlt);
    expect(b).toHaveLength(11);
    expect(b.some((x) => x.datum === "2026-02-15")).toBe(false);
    expect(b[0].datum).toBe("2026-01-15");
  });

  it("klemmt den Tag auf den letzten Monatstag (31. → Feb)", () => {
    const b = projiziereRegel(
      regel({ rhythmus: "monatlich", startdatum: "2026-01-31" }),
      "2026-01-01",
      3,
    );
    expect(b.map((x) => x.datum)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("naechsteFaelligkeit", () => {
  it("liefert den heutigen Termin, wenn heute Zahltag ist", () => {
    expect(naechsteFaelligkeit(regel(), "2026-01-15")).toBe("2026-01-15");
  });

  it("springt beim monatlichen Rhythmus in den Folgemonat, sobald der Tag vorbei ist", () => {
    expect(naechsteFaelligkeit(regel(), "2026-01-16")).toBe("2026-02-15");
  });

  /** Der Normalfall im Bestand: die Regel läuft seit Jahren, gefragt ist der nächste Termin. */
  it("findet den Termin auch bei sehr altem Startdatum", () => {
    const miete = regel({ startdatum: "2009-03-01" });
    expect(naechsteFaelligkeit(miete, "2026-08-16")).toBe("2026-09-01");
  });

  it("rechnet den Jahres-Rhythmus auf den nächsten Jahrestag", () => {
    const hausrat = regel({ rhythmus: "jaehrlich", startdatum: "2019-03-10" });
    expect(naechsteFaelligkeit(hausrat, "2026-08-16")).toBe("2027-03-10");
    expect(naechsteFaelligkeit(hausrat, "2026-02-01")).toBe("2026-03-10");
  });

  it("liefert bei künftigem Start den Start selbst", () => {
    expect(naechsteFaelligkeit(regel({ startdatum: "2027-05-01" }), "2026-08-16")).toBe("2027-05-01");
  });

  /**
   * Regression aus der Projektion: iteratives Weiterzählen klemmte einen Termin vom 31.
   * im Februar auf den 28. und ließ ihn dort kleben. Aus dem Original gerechnet kehrt er
   * im März zurück.
   */
  it("hält den Monatstag, statt nach dem Februar zu driften", () => {
    const r = regel({ startdatum: "2026-01-31" });
    expect(naechsteFaelligkeit(r, "2026-02-01")).toBe("2026-02-28");
    expect(naechsteFaelligkeit(r, "2026-03-01")).toBe("2026-03-31");
  });
});
