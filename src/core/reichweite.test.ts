// Die Reichweite an ihren Sonderfällen. Alle Beträge sind erfunden.
//
// Die Monatsergebnisse werden hier von Hand gebaut, nicht über `monatsErgebnis`: geprüft
// wird, was diese Datei aus den Zeilen macht, nicht die Ergebnisrechnung darunter — die
// hat ihre eigenen Tests.

import { describe, expect, it } from "vitest";
import type { ErgebnisZeileId, MonatsErgebnis } from "./ergebnis";
import { GRUNDKOSTEN, REICHWEITE_MINDESTENS, reichweite, reichweiteInMonaten, reichweitenMonate } from "./reichweite";

/** Ein vergangener Monat mit den gegebenen Zeilen (Kosten negativ, wie in der Rechnung). */
function monat(label: string, zeilen: Partial<Record<ErgebnisZeileId, number>>, o: { laufend?: boolean; zukunft?: boolean } = {}): MonatsErgebnis {
  const liste = Object.entries(zeilen).map(([id, ist]) => ({ id: id as ErgebnisZeileId, plan: 0, ist: ist ?? 0, posten: [] }));
  const summe = liste.reduce((s, z) => s + (z.ist ?? 0), 0);
  return {
    jahr: Number(label.slice(0, 4)),
    monat: Number(label.slice(5, 7)),
    label,
    von: `${label}-01`,
    bis: `${label}-28`,
    laufend: o.laufend ?? false,
    zukunft: o.zukunft ?? false,
    zeilen: liste,
    nachPflichten: { plan: 0, ist: 0 },
    nachAlltag: { plan: 0, ist: 0 },
    ergebnis: { plan: 0, ist: summe },
  };
}

describe("reichweiteInMonaten", () => {
  it("teilt das freie Geld durch die Monatskosten", () => {
    expect(reichweiteInMonaten(600000, 200000)).toBe(3);
  });

  it("rundet auf ein Zehntel AB — eine Reichweite ist eine Zusage", () => {
    // 5 / 3 = 1,666… → 1,6, nicht 1,7.
    expect(reichweiteInMonaten(500000, 300000)).toBe(1.6);
  });

  it("verliert beim Abrunden kein Zehntel an die Gleitkommadarstellung", () => {
    // 2,3 × 10 ist in Gleitkomma 22,999…; in ganzen Zahlen gerechnet bleibt es 2,3.
    expect(reichweiteInMonaten(230, 100)).toBe(2.3);
  });

  it("macht ohne Kosten keine Aussage statt unendlich", () => {
    expect(reichweiteInMonaten(500000, 0)).toBeNull();
    // Überwiegen Erstattungen, sind die Kosten negativ — auch das ist keine Reichweite.
    expect(reichweiteInMonaten(500000, -1000)).toBeNull();
  });

  it("nimmt negatives freies Geld als null Monate", () => {
    expect(reichweiteInMonaten(-40000, 100000)).toBe(0);
    expect(reichweiteInMonaten(0, 100000)).toBe(0);
  });
});

describe("reichweitenMonate", () => {
  it("nimmt die letzten abgeschlossenen Monate, ohne den laufenden", () => {
    expect(reichweitenMonate("2026-05-14", [{ datum: "2020-01-01" }], 3)).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("geht über den Jahreswechsel zurück", () => {
    expect(reichweitenMonate("2026-02-03", [{ datum: "2020-01-01" }], 3)).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
  });

  it("beginnt nicht vor dem ersten VOLLEN Monat mit Buchungen", () => {
    // Erste Buchung mitten im Februar: der Februar ist nur zum Teil erfasst.
    expect(reichweitenMonate("2026-06-10", [{ datum: "2026-02-17" }], 12)).toEqual(["2026-03-01", "2026-04-01", "2026-05-01"]);
    // Die früheste zählt, nicht die erste in der Liste.
    expect(reichweitenMonate("2026-06-10", [{ datum: "2026-04-03" }, { datum: "2026-02-17" }], 12)).toEqual(["2026-03-01", "2026-04-01", "2026-05-01"]);
    // Am Ersten zählt der Monat mit.
    expect(reichweitenMonate("2026-06-10", [{ datum: "2026-02-01" }], 12)).toEqual(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]);
  });

  it("liefert ohne Buchungen nichts", () => {
    expect(reichweitenMonate("2026-06-10", [])).toEqual([]);
  });
});

describe("reichweite", () => {
  const drei = [
    monat("2026-01", { einnahmen: 400000, fixkosten: -100000, laufend: -50000, ungeplant: -30000, abschreibungen: -20000 }),
    monat("2026-02", { einnahmen: 400000, fixkosten: -100000, laufend: -40000, ungeplant: -10000, wagnisse: -20000, vorsorge: -20000 }),
    monat("2026-03", { einnahmen: 400000, fixkosten: -100000, laufend: -60000, ungeplant: -20000, abschreibungen: -20000 }),
  ];

  it("rechnet zwei Zahlen: Grundkosten und alle Kosten", () => {
    const r = reichweite(900000, drei)!;
    expect(r.monate).toBe(3);
    // Grund: (180000 + 150000 + 180000) / 3 = 170000.
    expect(r.grundkosten).toBe(170000);
    // Alle: dazu je Monat 20000 bzw. 40000 Zurückgelegtes → (200000 + 190000 + 200000) / 3.
    expect(r.alleKosten).toBe(196667);
    expect(r.ohneZuruecklegen).toBe(5.2);
    expect(r.mitZuruecklegen).toBe(4.5);
    // Wer weiter zurücklegt, kommt nie länger aus.
    expect(r.mitZuruecklegen!).toBeLessThanOrEqual(r.ohneZuruecklegen!);
  });

  it("lässt Einnahmen ganz aus dem Spiel — die Frage ist, was OHNE sie reicht", () => {
    const ohneEinnahmen = drei.map((m) => ({ ...m, zeilen: m.zeilen.filter((z) => z.id !== "einnahmen") }));
    expect(reichweite(900000, ohneEinnahmen)).toEqual(reichweite(900000, drei));
  });

  it("übergeht den laufenden und künftige Monate", () => {
    const mit = [...drei, monat("2026-04", { fixkosten: -900000 }, { laufend: true }), monat("2026-05", { fixkosten: -900000 }, { zukunft: true })];
    expect(reichweite(900000, mit)).toEqual(reichweite(900000, drei));
  });

  it(`macht unter ${REICHWEITE_MINDESTENS} abgeschlossenen Monaten keine Aussage`, () => {
    expect(reichweite(900000, drei.slice(0, REICHWEITE_MINDESTENS - 1))).toBeNull();
    // Auch nicht, wenn der laufende die Zahl auffüllen würde.
    expect(reichweite(900000, [...drei.slice(0, 2), monat("2026-04", { fixkosten: -1 }, { laufend: true })])).toBeNull();
  });

  it("lässt eine Erstattung die Kosten senken, nicht erhöhen", () => {
    const mitErstattung = [...drei.slice(0, 2), monat("2026-03", { fixkosten: -100000, laufend: -60000, ungeplant: 30000 })];
    // Grund: (180000 + 150000 + 130000) / 3 — die Erstattung zieht ab.
    expect(reichweite(900000, mitErstattung)!.grundkosten).toBe(153333);
  });

  it("macht ohne Kosten keine Aussage über die Monate, sagt aber, worüber gemittelt wurde", () => {
    const leer = [monat("2026-01", {}), monat("2026-02", {}), monat("2026-03", {})];
    const r = reichweite(500000, leer)!;
    expect(r.monate).toBe(3);
    expect(r.ohneZuruecklegen).toBeNull();
    expect(r.mitZuruecklegen).toBeNull();
  });
});

describe("GRUNDKOSTEN", () => {
  it("zählt die Tilgung mit — eine Kreditrate lässt sich nicht aussetzen", () => {
    expect(GRUNDKOSTEN).toContain("tilgung");
  });
});
