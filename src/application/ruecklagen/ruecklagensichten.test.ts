// Die Auswahl beim Ausbuchen einer Rücklage. Alle Werte erfunden.

import { describe, expect, it } from "vitest";
import { buchungswahlFuer, ruecklagenGeschichte, type Buchungswahl } from "./ruecklagensichten";
import type { IstBuchung, Kategorie, Ruecklage } from "../../core";
import type { RuecklagenAusbuchung } from "../ports";

const KATEGORIEN: Kategorie[] = [
  { id: "haushalt", name: "Haushalt", defaultCharakter: "Aufwand" },
  { id: "geraete", name: "Geräte", elternId: "haushalt", defaultCharakter: "Aufwand" },
  { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
];

const wahl = (id: string, datum: string, kategorieId?: string): Buchungswahl => ({
  id, datum, betrag: -1000, bezeichnung: id, kategorieId,
});

/** Neueste zuerst, wie `ruecklagenLaden` sie liefert. */
const BUCHUNGEN = [wahl("c", "2026-03-10", "alltag"), wahl("b", "2026-02-10", "geraete"), wahl("a", "2026-01-10")];

describe("buchungswahlFuer", () => {
  it("holt nach vorn, was in der Kategorie der Rücklage oder darunter liegt", () => {
    const r = buchungswahlFuer({ buchungswahl: BUCHUNGEN, kategorien: KATEGORIEN }, { kategorieId: "haushalt" });
    expect(r.map((b) => [b.id, b.passt])).toEqual([["b", true], ["c", false], ["a", false]]);
  });

  it("lässt die Reihenfolge, wenn die Rücklage keine Kategorie trägt", () => {
    const r = buchungswahlFuer({ buchungswahl: BUCHUNGEN, kategorien: KATEGORIEN }, {});
    expect(r.map((b) => b.id)).toEqual(["c", "b", "a"]);
    expect(r.some((b) => b.passt)).toBe(false);
  });

  it("behält eine passende Buchung, auch wenn sie älter ist als die jüngsten fünfzig", () => {
    const viele = Array.from({ length: 60 }, (_, i) => wahl(`n${i}`, "2026-05-01", "alltag"));
    const alt = wahl("alt", "2024-01-01", "geraete");
    const r = buchungswahlFuer({ buchungswahl: [...viele, alt], kategorien: KATEGORIEN }, { kategorieId: "geraete" });
    expect(r[0].id).toBe("alt");
    expect(r).toHaveLength(50);
  });
});

describe("ruecklagenGeschichte", () => {
  // Zwei Rücklagen, beide erfunden: eine mit Ziel, die zweimal neu begann und weiterläuft,
  // und eine freie, die mit ihrer Ausbuchung endete.
  const kauf: IstBuchung = {
    id: "b-kauf", datum: "2025-06-03", betrag: -72000, kontoId: "k1", charakter: "Aufwand",
    quelle: "manuell", notiz: "Hollweck", budgetrelevant: false,
  };
  const ausbuchungen: RuecklagenAusbuchung[] = [
    // Mit Ziel: 1200,00 in 12 Monaten ab Januar 2025, Kauf Anfang Juli → 600,00 angespart,
    // die verknüpfte Buchung über 720,00 lässt 120,00 ungedeckt. Der eingetragene Betrag
    // weicht ab und zählt nicht — die Buchung ist die Ausgabe.
    {
      id: "a-ziel", ruecklageId: "r-ziel", bezeichnung: "Aldersbach", datum: "2025-07-01", betrag: 70000,
      istbuchungId: "b-kauf", zyklusBeginn: "2025-01-01", zyklusZiel: 120000, zyklusFrist: 12,
    },
    // Von vor Migration 76: kein Zyklus, also nichts bekannt.
    { id: "a-alt", ruecklageId: "r-ziel", bezeichnung: "Aldersbach", datum: "2024-02-10", betrag: 30000 },
    // Frei, 50,00 im Monat seit Januar 2025, ausgebucht Anfang April → 150,00 angespart.
    {
      id: "a-frei", ruecklageId: "r-frei", bezeichnung: "Penzberg", datum: "2025-04-01", betrag: 10000,
      zyklusBeginn: "2025-01-01", zyklusRate: 5000,
    },
  ];
  const beendete: Ruecklage[] = [
    { id: "r-frei", bezeichnung: "Penzberg", beginn: "2025-01-01", rate: 5000, beendetAm: "2025-04-01" },
  ];

  it("führt jede Ausbuchung, jüngste zuerst, mit Angespartem und Ungedecktem", () => {
    const g = ruecklagenGeschichte(ausbuchungen, beendete, [kauf], []);
    expect(g.map((z) => z.id)).toEqual(["a-ziel", "a-frei", "a-alt"]);
    expect(g[0]).toMatchObject({ ausgabe: 72000, angespart: 60000, ungedeckt: 12000, buchungsname: "Hollweck", beendet: false });
    expect(g[0].buchung?.id).toBe("b-kauf");
    expect(g[1]).toMatchObject({ ausgabe: 10000, angespart: 15000, ungedeckt: 0, beendet: true, bezeichnung: "Penzberg" });
    expect(g[1].buchung).toBeUndefined();
  });

  it("sagt bei einer Ausbuchung ohne festgehaltenen Zyklus unbekannt statt null Cent", () => {
    const alt = ruecklagenGeschichte(ausbuchungen, beendete, [kauf], []).find((z) => z.id === "a-alt");
    expect(alt).toMatchObject({ angespart: null, ungedeckt: null, ausgabe: 30000, beendet: false });
  });

  it("öffnet keine Buchung, die es nicht mehr gibt", () => {
    const g = ruecklagenGeschichte(ausbuchungen, beendete, [], []);
    expect(g[0].buchung).toBeUndefined();
    // Ohne Buchung gilt der eingetragene Betrag.
    expect(g[0]).toMatchObject({ ausgabe: 70000, ungedeckt: 10000 });
  });

  it("kennzeichnet nur die letzte Ausbuchung einer beendeten Rücklage als beendend", () => {
    const vorher: RuecklagenAusbuchung = {
      id: "a-frei-vorher", ruecklageId: "r-frei", bezeichnung: "Penzberg", datum: "2024-11-20", betrag: 4000,
    };
    const g = ruecklagenGeschichte([...ausbuchungen, vorher], beendete, [kauf], []);
    expect(g.filter((z) => z.beendet).map((z) => z.id)).toEqual(["a-frei"]);
  });

  it("führt eine Ausbuchung von davor weiter als Ausbuchung, nicht als Abschluss", () => {
    const g = ruecklagenGeschichte(ausbuchungen, beendete, [kauf], [], { ruecklagen: beendete, entnahmen: new Map() });
    expect(g.every((z) => !z.abschluss && z.frei === null)).toBe(true);
  });

  it("zeigt ein Abschliessen mit dem, was die Rücklage über ihre Kategorie trug und was frei wurde", () => {
    // Frei 60,00 im Monat seit Januar an `geraete`, abgeschlossen am 10.05. → Raten Januar
    // bis April 240,00, getragen 90,00 → frei 150,00.
    const r: Ruecklage = {
      id: "r-ab", bezeichnung: "Plimsaro", beginn: "2026-05-10", kategorieId: "geraete", art: "abschliessend",
      findetAb: "2026-01-01", raten: [{ abMonat: "2026-01", betrag: 6000 }],
    };
    const abschluss: RuecklagenAusbuchung = {
      id: "a-ab", ruecklageId: "r-ab", bezeichnung: "Plimsaro", kategorieId: "geraete", datum: "2026-05-10", betrag: 0,
      zyklusBeginn: "2026-01-01",
    };
    const entnahmen = new Map([["r-ab", [{ datum: "2026-03-02", betrag: -9000 }]]]);
    const [z] = ruecklagenGeschichte([abschluss], [], [], [], { ruecklagen: [r], entnahmen });
    expect(z).toMatchObject({ abschluss: true, angespart: 24000, ausgabe: 9000, frei: 15000, ungedeckt: 0, buchungsname: "" });
    // Im Minus: frei nichts, das Minus steht als ungedeckt da.
    const [minus] = ruecklagenGeschichte([abschluss], [], [], [], { ruecklagen: [r], entnahmen: new Map([["r-ab", [{ datum: "2026-03-02", betrag: -30000 }]]]) });
    expect(minus).toMatchObject({ abschluss: true, frei: 0, ungedeckt: 6000 });
  });

  it("zeigt eine beendete Rücklage auch dann, wenn keine Ausbuchung zu ihr gehört", () => {
    const ohne: Ruecklage = { id: "r-ohne", bezeichnung: "Tessendorf", beginn: "2024-01-01", rate: 1000, beendetAm: "2025-09-30" };
    const [z] = ruecklagenGeschichte([], [ohne], [], []);
    expect(z).toMatchObject({ ruecklageId: "r-ohne", bezeichnung: "Tessendorf", datum: "2025-09-30", beendet: true, ausgabe: 0, angespart: null });
  });
});
