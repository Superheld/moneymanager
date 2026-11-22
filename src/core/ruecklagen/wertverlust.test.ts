// Der Wertverlust neben einer Rücklage — linear auf null, in vollen Monaten, nur Anzeige.
//
// Alle Werte erfunden.

import { describe, expect, it } from "vitest";
import type { Kaufangabe } from "./ruecklage";
import { wertverlustAm, wertverlustNeben, wertverlustVerlauf } from "./wertverlust";

const kauf: Kaufangabe = { datum: "2024-03-15", preis: 120000, nutzungsdauerMonate: 60 };

describe("wertverlustAm", () => {
  it("rechnet das Beispiel: nach zwei von fünf Jahren zwei Fünftel des Kaufpreises", () => {
    expect(wertverlustAm(kauf, "2026-03-15")).toBe(48000);
  });

  it("zählt nur volle Monate — einen Tag vor dem Monatstag noch den Monat davor", () => {
    expect(wertverlustAm(kauf, "2026-03-14")).toBe(46000);
    expect(wertverlustAm(kauf, "2024-04-15")).toBe(2000);
    expect(wertverlustAm(kauf, "2024-04-14")).toBe(0);
  });

  it("ist vor und am Kauftag null und nach der Nutzungsdauer der Kaufpreis — nie mehr", () => {
    expect(wertverlustAm(kauf, "2023-12-31")).toBe(0);
    expect(wertverlustAm(kauf, "2024-03-15")).toBe(0);
    expect(wertverlustAm(kauf, "2029-03-15")).toBe(120000);
    expect(wertverlustAm(kauf, "2035-01-01")).toBe(120000);
  });

  it("nimmt bei einem Kauf am Monatsende den letzten Tag eines kürzeren Monats", () => {
    const ende: Kaufangabe = { datum: "2026-01-31", preis: 12000, nutzungsdauerMonate: 12 };
    expect(wertverlustAm(ende, "2026-02-28")).toBe(1000);
    expect(wertverlustAm(ende, "2026-02-27")).toBe(0);
  });

  it("rundet auf ganze Cent", () => {
    expect(wertverlustAm({ datum: "2026-01-01", preis: 10000, nutzungsdauerMonate: 3 }, "2026-02-01")).toBe(3333);
  });
});

describe("wertverlustVerlauf", () => {
  it("beginnt im Monat des Kaufs, auch wenn das Fenster früher anfängt, und nimmt im laufenden Monat heute", () => {
    const v = wertverlustVerlauf(kauf, "2024-01", "2024-06", "2024-06-10");
    expect(v.map((p) => p.monat)).toEqual(["2024-03", "2024-04", "2024-05", "2024-06"]);
    // März: am 31.03. kein voller Monat; April am 30.04. einer; Juni am 10.06. zwei (nicht drei).
    expect(v.map((p) => p.betrag)).toEqual([0, 2000, 4000, 4000]);
  });

  it("schneidet vorn am Fenster ab, wenn der Kauf davor liegt — über den Jahreswechsel", () => {
    const v = wertverlustVerlauf(kauf, "2025-11", "2026-02", "2026-03-01");
    expect(v.map((p) => p.monat)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(v[0].betrag).toBe(wertverlustAm(kauf, "2025-11-30"));
  });
});

describe("wertverlustNeben", () => {
  it("sagt, wie viel der Stand nicht deckt — und null, wenn er reicht", () => {
    expect(wertverlustNeben(kauf, 30000, "2026-03-15")).toEqual({ bisHeute: 48000, fehlt: 18000 });
    expect(wertverlustNeben(kauf, 50000, "2026-03-15")).toEqual({ bisHeute: 48000, fehlt: 0 });
    expect(wertverlustNeben(kauf, -5000, "2026-03-15")).toEqual({ bisHeute: 48000, fehlt: 53000 });
  });
});
