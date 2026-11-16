// Die Kontobelegung — die eine Rechnung, gegen die jede Anzeige „gebunden / frei" liest.

import { describe, expect, it } from "vitest";
import { bilanzJeKlasse, kontobelegung, type Anspruch } from "./kontobelegung";
import type { Klassenstand } from "../buchung/istbuchung";
import type { Zahlungskonto } from "./konto";

const anspruch = (id: string, kontoId: string, betrag: number): Anspruch => ({
  id,
  kontoId,
  betrag,
});

describe("kontobelegung", () => {
  it("zieht alle Ansprüche vom Stand ab, gleich welcher Art", () => {
    const b = kontobelegung(new Map([["k1", 5000]]), [
      anspruch("r1", "k1", 1200),
      anspruch("b1", "k1", 650),
    ]).get("k1")!;
    expect(b.gebunden).toBe(1850);
    expect(b.frei).toBe(3150);
    expect(b.posten.map((p) => p.gedeckt)).toEqual([1200, 650]);
  });

  it("verteilt eine Unterdeckung anteilig über alle Ansprüche", () => {
    const b = kontobelegung(new Map([["k1", 600]]), [
      anspruch("r1", "k1", 800),
      anspruch("b1", "k1", 200),
    ]).get("k1")!;
    expect(b.anteil).toBeCloseTo(0.6);
    expect(b.posten.map((p) => p.gedeckt)).toEqual([480, 120]);
    // Negativ heisst: so viel fehlt, um alles zu decken.
    expect(b.frei).toBe(-400);
  });

  it("deckt bei einem Konto im Minus nichts, statt negativ zu decken", () => {
    const b = kontobelegung(new Map([["k1", -50]]), [anspruch("r1", "k1", 100)]).get("k1")!;
    expect(b.posten[0].gedeckt).toBe(0);
    expect(b.anteil).toBe(0);
  });

  it("führt auch Konten ohne Anspruch, mit allem frei", () => {
    const b = kontobelegung(new Map([["k1", 300]]), []).get("k1")!;
    expect(b).toMatchObject({ gebunden: 0, frei: 300, anteil: 1, posten: [] });
  });

  it("lässt einen Anspruch von 0 oder darunter aus", () => {
    const b = kontobelegung(new Map([["k1", 300]]), [anspruch("b1", "k1", -20)]).get("k1")!;
    expect(b.posten).toEqual([]);
  });

  it("rechnet einen Anspruch auf ein unbekanntes Konto gegen 0 — ungedeckt, nicht verschwunden", () => {
    const b = kontobelegung(new Map(), [anspruch("r1", "weg", 100)]).get("weg")!;
    expect(b).toMatchObject({ stand: 0, gebunden: 100, frei: -100 });
    expect(b.posten[0].gedeckt).toBe(0);
  });
});

describe("bilanzJeKlasse", () => {
  const konto = (id: string, klasse: Zahlungskonto["klasse"]): Zahlungskonto => ({
    id, bezeichnung: id, typ: "Tagesgeld", klasse, inhaberIds: [], saldo: 0,
  });
  const klasse = (k: Zahlungskonto["klasse"], staende: Record<string, number>): Klassenstand => ({
    klasse: k,
    stand: Object.values(staende).reduce((s, x) => s + x, 0),
    konten: Object.keys(staende).map((id) => konto(id, k)),
  });

  it("teilt den Stand in gebunden und frei", () => {
    const belegung = kontobelegung(new Map([["a", 5000]]), [anspruch("r1", "a", 3000)]);
    const [b] = bilanzJeKlasse([klasse("ruecklage", { a: 5000 })], belegung);
    expect(b).toMatchObject({ stand: 5000, gebunden: 3000, frei: 2000, fehlt: 0, kontenAnzahl: 1 });
  });

  it("verrechnet den Überschuss eines Kontos nicht mit der Lücke eines anderen", () => {
    // Auf a fehlen 2000, auf b sind 4000 frei. Über die Summe gerechnet fehlte nichts.
    const belegung = kontobelegung(new Map([["a", 1000], ["b", 4000]]), [anspruch("r1", "a", 3000)]);
    const [b] = bilanzJeKlasse([klasse("ruecklage", { a: 1000, b: 4000 })], belegung);
    expect(b).toMatchObject({ stand: 5000, gebunden: 1000, frei: 4000, fehlt: 2000 });
  });

  it("lässt eine Klasse ohne Ansprüche ganz frei", () => {
    const belegung = kontobelegung(new Map([["g", 7000]]), []);
    const [b] = bilanzJeKlasse([klasse("liquide", { g: 7000 })], belegung);
    expect(b).toMatchObject({ gebunden: 0, frei: 7000, fehlt: 0 });
    expect(b.posten).toEqual([]);
  });
});
