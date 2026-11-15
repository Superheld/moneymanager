import { describe, it, expect } from "vitest";
import {
  kostenJeMonat,
  pflichtenJeMonat,
  vertragLaeuft,
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

describe("kostenJeMonat", () => {
  const regel = (over: Partial<Zahlungsregel>): Zahlungsregel => ({
    id: "r",
    bezeichnung: "Regel",
    betrag: -60000,
    rhythmus: "jaehrlich",
    startdatum: "2026-01-15",
    charakter: "Aufwand",
    ...over,
  });

  it("verteilt den Betrag auf die Monate des Rhythmus", () => {
    expect(kostenJeMonat(regel({ betrag: -60000, rhythmus: "jaehrlich" }))).toBe(-5000);
    expect(kostenJeMonat(regel({ betrag: -5544, rhythmus: "quartalsweise" }))).toBe(-1848);
    expect(kostenJeMonat(regel({ betrag: -9000, rhythmus: "halbjaehrlich" }))).toBe(-1500);
  });

  it("lässt eine monatliche Zahlung, wie sie ist", () => {
    expect(kostenJeMonat(regel({ betrag: -4700, rhythmus: "monatlich" }))).toBe(-4700);
  });

  it("behält das Vorzeichen — eine Einnahme bleibt eine Einnahme", () => {
    expect(kostenJeMonat(regel({ betrag: 120000, rhythmus: "jaehrlich", charakter: "Ertrag" }))).toBe(10000);
  });

  it("rundet Abfluss und Zufluss gleich", () => {
    // 10,01 im Quartal sind 3,3366… — und 10,05 im Halbjahr genau 1,675: die Hälfte.
    expect(kostenJeMonat(regel({ betrag: -1005, rhythmus: "halbjaehrlich" }))).toBe(-168);
    expect(kostenJeMonat(regel({ betrag: 1005, rhythmus: "halbjaehrlich", charakter: "Ertrag" }))).toBe(168);
  });

  it("liefert bei Betrag null eine saubere Null", () => {
    expect(Object.is(kostenJeMonat(regel({ betrag: 0 })), 0)).toBe(true);
  });
});

describe("pflichtenJeMonat", () => {
  const posten = (
    id: string,
    betrag: number,
    rhythmus: Zahlungsregel["rhythmus"],
    charakter: Zahlungsregel["charakter"],
    over: Partial<Vertrag> = {},
  ) => ({
    vertrag: vertrag({ id, ...over }),
    regel: { id: `r-${id}`, bezeichnung: id, betrag, rhythmus, startdatum: "2026-01-01", charakter, vertragId: id },
  });

  it("trennt Fixkosten von Einnahmen und nennt, was bleibt", () => {
    const p = pflichtenJeMonat([
      posten("a", -60000, "jaehrlich", "Aufwand"),
      posten("b", -4700, "monatlich", "Aufwand"),
      posten("c", 250000, "monatlich", "Ertrag"),
    ]);
    expect(p).toEqual({ fixkosten: -9700, einnahmen: 250000, nachPflichten: 240300 });
  });

  it("zählt einen Umbuchungsvertrag nicht mit — er bewegt eigenes Geld", () => {
    const p = pflichtenJeMonat([
      posten("a", -4700, "monatlich", "Aufwand"),
      posten("u", -30000, "monatlich", "Umschichtung", { art: "umbuchung" }),
    ]);
    expect(p).toEqual({ fixkosten: -4700, einnahmen: 0, nachPflichten: -4700 });
  });

  it("lässt einen beendeten Vertrag aus, einen gekündigten nicht", () => {
    const p = pflichtenJeMonat([
      posten("a", -1000, "monatlich", "Aufwand", { status: "beendet" }),
      posten("b", -2000, "monatlich", "Aufwand", { status: "gekuendigt" }),
    ]);
    expect(p.fixkosten).toBe(-2000);
    expect(vertragLaeuft(vertrag({ status: "gekuendigt" }))).toBe(true);
    expect(vertragLaeuft(vertrag({ status: "beendet" }))).toBe(false);
  });

  it("übergeht einen Vertrag ohne Zahlungsregel", () => {
    expect(pflichtenJeMonat([{ vertrag: vertrag() }])).toEqual({ fixkosten: 0, einnahmen: 0, nachPflichten: 0 });
  });
});
