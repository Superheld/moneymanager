import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { Zahlungsregel } from "./zahlungsregel";
import { projiziereRegel, projiziereVerlauf } from "./projektion";

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

describe("projiziereVerlauf", () => {
  it("kumuliert den Saldo aus Startsaldo + Netto je Monat", () => {
    const einnahme = regel({
      id: "e",
      bezeichnung: "Gehalt",
      betrag: euroZuCent(3000),
      charakter: "Ertrag",
      startdatum: "2026-01-01",
    });
    const miete = regel({
      id: "m",
      bezeichnung: "Miete",
      betrag: euroZuCent(-1200),
      charakter: "Aufwand",
      startdatum: "2026-01-01",
    });
    const v = projiziereVerlauf([einnahme, miete], "2026-01-01", 12, euroZuCent(2000));

    expect(v).toHaveLength(12);
    expect(v[0].zufluss).toBe(euroZuCent(3000));
    expect(v[0].abfluss).toBe(euroZuCent(-1200));
    expect(v[0].netto).toBe(euroZuCent(1800));
    // Startsaldo 2000 + 1800 nach Monat 1.
    expect(v[0].saldo).toBe(euroZuCent(3800));
    // Nach 12 Monaten: 2000 + 12*1800.
    expect(v[11].saldo).toBe(euroZuCent(2000 + 12 * 1800));
  });

  it("ordnet eine jährliche Zahlung dem richtigen Monat zu", () => {
    const hausrat = regel({
      id: "h",
      bezeichnung: "Hausrat",
      betrag: euroZuCent(-120),
      rhythmus: "jaehrlich",
      startdatum: "2026-03-01",
    });
    const v = projiziereVerlauf([hausrat], "2026-01-01", 12, 0);
    expect(v[0].netto).toBe(0); // Jan
    expect(v[2].netto).toBe(euroZuCent(-120)); // Mär
    expect(v[2].buchungen).toHaveLength(1);
  });
});
