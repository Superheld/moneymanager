import { describe, it, expect } from "vitest";
import {
  kuendigungsterminNaht,
  naechsterKuendigungstermin,
  type Vertrag,
} from "./vertrag";

function vertrag(over: Partial<Vertrag> = {}): Vertrag {
  return {
    id: "v1",
    anbieter: "Test",
    beginn: "2025-01-01",
    mindestlaufzeitMonate: 24,
    verlaengerung: "automatisch",
    verlaengerungMonate: 12,
    kuendigungsfristMonate: 3,
    status: "aktiv",
    ...over,
  };
}

describe("naechsterKuendigungstermin", () => {
  it("erster Termin: Ende nach Mindestlaufzeit, Frist abgezogen", () => {
    const t = naechsterKuendigungstermin(vertrag(), "2026-06-01");
    expect(t).toEqual({ endeDatum: "2027-01-01", kuendigenBis: "2026-10-01" });
  });

  it("springt zum nächsten Verlängerungstermin, wenn die erste Frist verpasst ist", () => {
    const t = naechsterKuendigungstermin(vertrag(), "2026-11-01");
    expect(t).toEqual({ endeDatum: "2028-01-01", kuendigenBis: "2027-10-01" });
  });

  it("ohne Verlängerung: nach verpasster Frist kein weiterer Termin", () => {
    const v = vertrag({ verlaengerung: "keine", mindestlaufzeitMonate: 12, kuendigungsfristMonate: 1 });
    // erstesEnde 2026-01-01, kuendigenBis 2025-12-01 < heute → null
    expect(naechsterKuendigungstermin(v, "2026-06-01")).toBeNull();
  });

  it("nicht-aktive Verträge liefern keinen Termin", () => {
    expect(naechsterKuendigungstermin(vertrag({ status: "gekuendigt" }), "2026-06-01")).toBeNull();
  });
});

describe("kuendigungsterminNaht", () => {
  it("true, wenn kuendigenBis innerhalb des Warnfensters liegt", () => {
    // kuendigenBis 2026-10-01; heute 2026-09-15 → 16 Tage ≤ 45
    expect(kuendigungsterminNaht(vertrag(), "2026-09-15", 45)).toBe(true);
  });

  it("false, wenn der Termin noch weit weg ist", () => {
    expect(kuendigungsterminNaht(vertrag(), "2026-06-01", 45)).toBe(false);
  });
});
