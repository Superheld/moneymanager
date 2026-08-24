import { describe, it, expect } from "vitest";
import {
  kuendigungsterminNaht,
  naechsterKuendigungstermin,
  ruecklagenbedarf,
  ruecklageProMonat,
  type Vertrag,
} from "./vertrag";
import type { Zahlungsregel } from "../basis/zahlungsregel";

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

describe("ruecklageProMonat", () => {
  function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
    return {
      id: "r1", bezeichnung: "Test", betrag: -12000, rhythmus: "jaehrlich",
      startdatum: "2026-03-01", charakter: "Aufwand", ...over,
    };
  }

  it("verteilt eine Jahreszahlung auf zwölf Monate", () => {
    expect(ruecklageProMonat(regel())).toBe(1000);
  });

  it("verteilt Quartal und Halbjahr auf ihre Monate", () => {
    expect(ruecklageProMonat(regel({ betrag: -5508, rhythmus: "quartalsweise" }))).toBe(1836);
    expect(ruecklageProMonat(regel({ betrag: -2199, rhythmus: "halbjaehrlich" }))).toBe(367);
  });

  /** Eine monatliche Zahlung kommt aus dem laufenden Monat — dafür legt niemand zurück. */
  it("verlangt für monatliche Zahlungen nichts", () => {
    expect(ruecklageProMonat(regel({ betrag: -4500, rhythmus: "monatlich" }))).toBe(0);
  });

  /** Eine jährliche Einnahme (Steuererstattung) braucht keine Rücklage. */
  it("verlangt für Zuflüsse nichts", () => {
    expect(ruecklageProMonat(regel({ betrag: 88431 }))).toBe(0);
  });

  it("summiert über mehrere Regeln", () => {
    expect(
      ruecklagenbedarf([
        regel(),
        regel({ id: "r2", betrag: -5508, rhythmus: "quartalsweise" }),
        regel({ id: "r3", betrag: -4500, rhythmus: "monatlich" }),
      ]),
    ).toBe(1000 + 1836);
  });
});

describe("Vertragsart", () => {
  const basis = {
    id: "v1", anbieter: "Arbeitgeber", beginn: "2020-01-01",
    verlaengerung: "keine" as const, status: "aktiv" as const,
    kuendigungsfristMonate: 3,
  };

  it("warnt bei einem Dauervertrag nicht vor dem nächsten Kündigungstermin", () => {
    // Ohne Mindestlaufzeit gilt ein Vertrag als jederzeit kündbar — bei einem
    // Arbeitsvertrag heisst das „heute kündbar, bald!", und er stand damit in der
    // Warnung, die den Abos gehört.
    const abo = { ...basis, art: "abo" as const };
    const dauer = { ...basis, art: "dauervertrag" as const };
    expect(kuendigungsterminNaht(abo, "2026-08-19")).toBe(true);
    expect(kuendigungsterminNaht(dauer, "2026-08-19")).toBe(false);
  });

  it("liefert den Termin selbst weiterhin — er ist eine Auskunft, keine Aufforderung", () => {
    const dauer = { ...basis, art: "dauervertrag" as const };
    expect(naechsterKuendigungstermin(dauer, "2026-08-19")).not.toBeNull();
  });

  it("behandelt einen Vertrag ohne Art wie ein Abo", () => {
    // Bestandsdaten tragen das Feld nicht — sie sollen sich verhalten wie bisher.
    expect(kuendigungsterminNaht(basis, "2026-08-19")).toBe(true);
  });
});
