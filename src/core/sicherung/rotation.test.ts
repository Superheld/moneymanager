import { describe, expect, it } from "vitest";
import { AUFBEWAHRUNG, zuBehalten, zuEntfernen, type Aufbewahrung } from "./rotation";

/** Alle Stufen aus. Damit lässt sich eine einzelne isolieren, ohne dass eine feinere
 *  Stufe den Fall verdeckt — und der Compiler erinnert an neue Stufen. */
const NICHTS: Aufbewahrung = {
  taeglich: 0, woechentlich: 0, monatlich: 0,
  quartalsweise: 0, halbjaehrlich: 0, jaehrlich: 0,
};

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

  it("hält je Monat einen Stand, so weit die Monatsstufe reicht", () => {
    const reihe: string[] = [];
    for (let m = 1; m <= 12; m++) reihe.push(`2026-${String(m).padStart(2, "0")}-01`);

    expect(zuBehalten(reihe, { ...NICHTS, monatlich: 3 }))
      .toEqual(["2026-12-01", "2026-11-01", "2026-10-01"]);
  });

  // Die Kette als Ganzes: jede Stufe reicht bis zur Schrittweite der nächsten, also darf
  // über zwei Jahre nirgends ein Loch entstehen, das gröber ist als ein Jahr.
  it("lässt über Jahre hinweg keine Lücke grösser als ein Jahr", () => {
    const reihe = taeglicheReihe("2026-12-31", 730);
    const behalten = zuBehalten(reihe).sort();

    for (let i = 1; i < behalten.length; i++) {
      const vorher = new Date(`${behalten[i - 1]}T00:00:00Z`).getTime();
      const danach = new Date(`${behalten[i]}T00:00:00Z`).getTime();
      const tage = (danach - vorher) / 86_400_000;
      expect(tage).toBeLessThanOrEqual(366);
    }
  });

  // Die Jahresstufe allein, damit die gröberen Stufen nicht mitreden. Mit der vollen
  // Regel bliebe hier ALLES: fünf Einträge liegen sämtlich in den „sieben jüngsten
  // vorhandenen Tagen". Das ist gewollt (siehe rotation.ts) und würde die Stufe
  // verdecken, um die es hier geht.
  it("hält je Jahr genau einen Stand", () => {
    const reihe = ["2026-03-01", "2025-06-15", "2024-11-30", "2023-01-02", "2022-05-05"];
    const nurJahre = { ...NICHTS, jaehrlich: 3 };
    expect(zuBehalten(reihe, nurJahre)).toEqual(["2026-03-01", "2025-06-15", "2024-11-30"]);
  });

  it("nimmt je Gruppe den JÜNGSTEN, nicht den ältesten", () => {
    const reihe = ["2026-02-03", "2026-02-27", "2026-01-09"];
    const nurMonate = { ...NICHTS, monatlich: 2 };
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
    expect(zuBehalten(reihe, NICHTS)).toEqual([]);
    expect(zuEntfernen(reihe, NICHTS).length).toBe(5);
  });

  it("behalten und entfernen ergänzen sich lückenlos", () => {
    const reihe = taeglicheReihe("2026-08-26", 400);
    const behalten = zuBehalten(reihe);
    const entfernen = zuEntfernen(reihe);
    expect(behalten.length + entfernen.length).toBe(reihe.length);
    expect(behalten.filter((x) => entfernen.includes(x))).toEqual([]);
  });

  it("bleibt unter der Summe der endlichen Stufen plus einem Stand je Jahr", () => {
    const endlich = AUFBEWAHRUNG.taeglich + AUFBEWAHRUNG.woechentlich
      + AUFBEWAHRUNG.monatlich + AUFBEWAHRUNG.quartalsweise + AUFBEWAHRUNG.halbjaehrlich;
    // Gut vier Jahre täglich.
    const reihe = taeglicheReihe("2026-08-26", 1500);
    const jahre = new Set(reihe.map((iso) => iso.slice(0, 4))).size;
    expect(zuBehalten(reihe).length).toBeLessThanOrEqual(endlich + jahre);
  });

  it("hält je Quartal einen Stand", () => {
    const reihe = ["2026-08-15", "2026-07-02", "2026-05-20", "2026-02-10"];
    const nurQuartale = { ...NICHTS, quartalsweise: 3 };
    // Q3 (Juli–Sept): der jüngste ist der 15. August. Dann Q2, dann Q1.
    expect(zuBehalten(reihe, nurQuartale)).toEqual(["2026-08-15", "2026-05-20", "2026-02-10"]);
  });

  it("hält je Halbjahr einen Stand", () => {
    const reihe = ["2026-11-30", "2026-08-15", "2026-06-30", "2026-01-05"];
    const nurHalbjahre = { ...NICHTS, halbjaehrlich: 2 };
    // H2 (Juli–Dez) und H1 (Jan–Juni), je der jüngste.
    expect(zuBehalten(reihe, nurHalbjahre)).toEqual(["2026-11-30", "2026-06-30"]);
  });

  it("legt die Quartals- und Halbjahresgrenzen auf den Kalender", () => {
    // Der 30. Juni ist H1/Q2, der 1. Juli ist H2/Q3 — beide bleiben, obwohl einen Tag
    // auseinander. Ohne Kalendergrenzen fiele einer von beiden heraus.
    const reihe = ["2026-07-01", "2026-06-30"];
    expect(zuBehalten(reihe, { ...NICHTS, halbjaehrlich: 2 })).toEqual(["2026-07-01", "2026-06-30"]);
    expect(zuBehalten(reihe, { ...NICHTS, quartalsweise: 2 })).toEqual(["2026-07-01", "2026-06-30"]);
  });

  // Der Grund, warum die Jahresstufe nie ausläuft: irgendwann führt die Bank die Umsätze
  // nicht mehr, und dann ist der alte Stand die einzige Stelle, an der das Jahr steht.
  it("wirft eine Jahressicherung niemals weg, egal wie alt", () => {
    const reihe = ["2026-03-01", "2020-07-04", "2014-09-09", "2008-01-30"];
    expect(zuEntfernen(reihe)).toEqual([]);

    // Auch dann nicht, wenn pro Jahr viel da ist: je Jahr bleibt einer.
    const viele = [...reihe, "2008-06-30", "2008-11-15", "2014-02-02"];
    const behalten = zuBehalten(viele);
    for (const jahr of ["2026", "2020", "2014", "2008"]) {
      expect(behalten.filter((iso) => iso.startsWith(jahr)).length).toBeGreaterThanOrEqual(1);
    }
  });
});
