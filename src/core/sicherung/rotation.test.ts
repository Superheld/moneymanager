import { describe, expect, it } from "vitest";
import { AUFBEWAHRUNG, zuBehalten, zuEntfernen } from "./rotation";

/** Eine lückenlose tägliche Reihe, rückwärts ab `bis`. */
function taeglicheReihe(bis: string, tage: number): string[] {
  const reihe: string[] = [];
  const d = new Date(`${bis}T00:00:00Z`);
  for (let i = 0; i < tage; i++) {
    reihe.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return reihe;
}

describe("Sicherungs-Rotation", () => {
  it("behält alles, solange es wenig ist", () => {
    const reihe = taeglicheReihe("2026-08-26", 5);
    expect(zuBehalten(reihe).sort()).toEqual([...reihe].sort());
    expect(zuEntfernen(reihe)).toEqual([]);
  });

  it("behält die letzten sieben Tage lückenlos", () => {
    const reihe = taeglicheReihe("2026-08-26", 40);
    const behalten = zuBehalten(reihe);
    for (const tag of taeglicheReihe("2026-08-26", 7)) {
      expect(behalten).toContain(tag);
    }
  });

  it("dünnt aus, was älter als die tägliche Stufe ist", () => {
    const reihe = taeglicheReihe("2026-08-26", 40);
    const behalten = zuBehalten(reihe);
    // 40 tägliche Sicherungen, aber nur eine Handvoll bleibt: sieben Tage, dazu je eine
    // pro Sieben-Tage-Block und eine für den Monat.
    expect(behalten.length).toBeLessThan(reihe.length);
    expect(behalten.length).toBeGreaterThanOrEqual(7);
    expect(zuEntfernen(reihe).length).toBe(reihe.length - behalten.length);
  });

  it("hält je Monat einen Stand über ein Jahr", () => {
    // Der Erste jedes Monats über zwei Jahre.
    const reihe: string[] = [];
    for (let jahr = 2025; jahr <= 2026; jahr++) {
      for (let m = 1; m <= 12; m++) reihe.push(`${jahr}-${String(m).padStart(2, "0")}-01`);
    }
    const behalten = zuBehalten(reihe);
    // Die zwölf jüngsten Monate sind dabei.
    expect(behalten).toContain("2026-12-01");
    expect(behalten).toContain("2026-01-01");
    // Und aus dem Jahr davor bleibt wenigstens einer — die Jahresstufe.
    expect(behalten.some((iso) => iso.startsWith("2025-"))).toBe(true);
  });

  // Die Jahresstufe allein, damit die gröberen Stufen nicht mitreden. Mit der vollen
  // Regel bliebe hier ALLES: fünf Einträge liegen sämtlich in den „sieben jüngsten
  // vorhandenen Tagen". Das ist gewollt (siehe rotation.ts) und würde die Stufe
  // verdecken, um die es hier geht.
  it("hält je Jahr genau einen Stand", () => {
    const reihe = ["2026-03-01", "2025-06-15", "2024-11-30", "2023-01-02", "2022-05-05"];
    const nurJahre = { taeglich: 0, woechentlich: 0, monatlich: 0, jaehrlich: 3 };
    expect(zuBehalten(reihe, nurJahre)).toEqual(["2026-03-01", "2025-06-15", "2024-11-30"]);
  });

  it("nimmt je Gruppe den JÜNGSTEN, nicht den ältesten", () => {
    const reihe = ["2026-02-03", "2026-02-27", "2026-01-09"];
    const nurMonate = { taeglich: 0, woechentlich: 0, monatlich: 2, jaehrlich: 0 };
    expect(zuBehalten(reihe, nurMonate)).toEqual(["2026-02-27", "2026-01-09"]);
  });

  // Der Fall, der die Semantik der Stufen festnagelt: die App lief ein halbes Jahr nicht.
  // Kalendarisch gelesen wäre jede Stufe leer und alles fiele weg — genau das darf nicht
  // passieren.
  it("wirft nichts weg, nur weil lange nichts gesichert wurde", () => {
    const reihe = ["2026-01-05", "2025-12-30", "2025-12-29"];
    expect(zuEntfernen(reihe)).toEqual([]);
  });

  it("verträgt Dubletten und unsortierte Eingaben", () => {
    const reihe = ["2026-08-20", "2026-08-26", "2026-08-20", "2026-08-24"];
    const behalten = zuBehalten(reihe);
    expect(behalten).toEqual(["2026-08-26", "2026-08-24", "2026-08-20"]);
  });

  it("gibt bei leerer Eingabe leere Listen", () => {
    expect(zuBehalten([])).toEqual([]);
    expect(zuEntfernen([])).toEqual([]);
  });

  it("behält nichts, wenn die Regel nichts vorsieht", () => {
    const reihe = taeglicheReihe("2026-08-26", 5);
    const nichts = { taeglich: 0, woechentlich: 0, monatlich: 0, jaehrlich: 0 };
    expect(zuBehalten(reihe, nichts)).toEqual([]);
    expect(zuEntfernen(reihe, nichts).length).toBe(5);
  });

  it("behalten und entfernen ergänzen sich lückenlos", () => {
    const reihe = taeglicheReihe("2026-08-26", 400);
    const behalten = zuBehalten(reihe);
    const entfernen = zuEntfernen(reihe);
    expect(behalten.length + entfernen.length).toBe(reihe.length);
    expect(behalten.filter((x) => entfernen.includes(x))).toEqual([]);
  });

  it("bleibt unter der Summe der Stufen, weil sie sich überlappen", () => {
    const summe = AUFBEWAHRUNG.taeglich + AUFBEWAHRUNG.woechentlich
      + AUFBEWAHRUNG.monatlich + AUFBEWAHRUNG.jaehrlich;
    const behalten = zuBehalten(taeglicheReihe("2026-08-26", 1500));
    expect(behalten.length).toBeLessThanOrEqual(summe);
  });
});
