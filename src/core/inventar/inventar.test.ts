// Inventar-Rücklage: die Rechnung (Wiederbeschaffung ÷ Nutzungsdauer) und ihr Abgleich
// gegen echte Kontostände. Reine Funktionen, keine Uhr, kein IO.

import { describe, expect, it } from "vitest";
import { euroZuCent } from "../basis/geld";
import {
  monatsRuecklage,
  monatsRuecklageGesamt,
  ruecklagenDeckung,
  sollRuecklage,
  type Inventargegenstand,
} from "./inventar";

const auto: Inventargegenstand = {
  id: "auto",
  bezeichnung: "Auto",
  wiederbeschaffung: euroZuCent(12000),
  nutzungsdauerMonate: 100,
  anschaffung: "2026-01-01",
};
const laptop: Inventargegenstand = {
  id: "laptop",
  bezeichnung: "Laptop",
  wiederbeschaffung: euroZuCent(1200),
  nutzungsdauerMonate: 48,
  anschaffung: "2026-01-01",
};

describe("monatsRuecklage", () => {
  it("teilt Wiederbeschaffung durch Nutzungsdauer", () => {
    expect(monatsRuecklage(auto)).toBe(euroZuCent(120));
    expect(monatsRuecklage(laptop)).toBe(2500); // 120000 / 48
  });

  it("summiert über alle Gegenstände", () => {
    expect(monatsRuecklageGesamt([auto, laptop])).toBe(euroZuCent(120) + 2500);
    expect(monatsRuecklageGesamt([])).toBe(0);
  });

  it("bleibt bei Nutzungsdauer 0 endlich statt Infinity zu werden", () => {
    expect(monatsRuecklage({ ...auto, nutzungsdauerMonate: 0 })).toBe(0);
  });
});

describe("sollRuecklage", () => {
  it("wächst linear ab der Anschaffung", () => {
    expect(sollRuecklage(auto, "2026-01-01")).toBe(0);
    expect(sollRuecklage(auto, "2026-07-01")).toBe(euroZuCent(720)); // 6 × 120
  });

  it("wird auf die Wiederbeschaffung gedeckelt", () => {
    expect(sollRuecklage(auto, "2200-01-01")).toBe(euroZuCent(12000));
  });

  it("ist vor der Anschaffung 0", () => {
    expect(sollRuecklage(auto, "2025-06-01")).toBe(0);
  });

  // Anteilig aus dem Ziel gerechnet, nicht als (gerundete Rate × Monate) — sonst fehlte
  // am Ende ein Rundungsrest, und die fachliche Zusage bräche.
  it("erreicht das Ziel am Ende der Nutzungsdauer exakt, auch bei krummer Teilung", () => {
    const krumm: Inventargegenstand = { ...auto, wiederbeschaffung: 1000, nutzungsdauerMonate: 3 };
    expect(monatsRuecklage(krumm)).toBe(333); // gerundet
    expect(sollRuecklage(krumm, "2026-04-01")).toBe(1000); // trotzdem voll
  });
});

describe("ruecklagenDeckung", () => {
  const stand = (eintraege: Record<string, number>) => new Map(Object.entries(eintraege));

  it("ohne Kontozuordnung gibt es nur die Rechnung", () => {
    const d = ruecklagenDeckung([auto], "2026-07-01", stand({}));
    expect(d.soll).toBe(euroZuCent(720));
    expect(d.posten[0].tatsaechlich).toBeNull();
    expect(d.sollMitKonto).toBe(0);
    expect(d.tatsaechlich).toBe(0);
    // Nichts zu decken heißt gedeckt — nicht 0 %.
    expect(d.grad).toBe(100);
  });

  it("verteilt den realen Kontostand anteilig am Soll", () => {
    // Soll am 2026-07-01: Auto 720,00 + Laptop 150,00 = 870,00, auf dem Konto die Hälfte.
    const items = [
      { ...auto, kontoId: "k1" },
      { ...laptop, kontoId: "k1" },
    ];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(435) }));

    expect(d.soll).toBe(euroZuCent(870));
    expect(d.grad).toBe(50);
    expect(d.posten[0].tatsaechlich).toBe(euroZuCent(360)); // die Hälfte von 720
    expect(d.posten[1].tatsaechlich).toBe(euroZuCent(75)); // die Hälfte von 150
    expect(d.tatsaechlich).toBe(euroZuCent(435));
  });

  it("hält die Konten auseinander", () => {
    const items = [
      { ...auto, kontoId: "voll" },
      { ...laptop, kontoId: "leer" },
    ];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ voll: euroZuCent(720), leer: 0 }));
    expect(d.posten[0].tatsaechlich).toBe(euroZuCent(720)); // voll gedeckt
    expect(d.posten[1].tatsaechlich).toBe(0); // gar nicht
  });

  it("kappt Überschuss statt mehr als das Soll auszuweisen", () => {
    const items = [{ ...auto, kontoId: "k1" }];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(5000) }));
    expect(d.posten[0].tatsaechlich).toBe(euroZuCent(720));
    expect(d.grad).toBe(100);
  });

  it("wertet ein überzogenes Konto als 0, nicht als negative Deckung", () => {
    const items = [{ ...auto, kontoId: "k1" }];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(-200) }));
    expect(d.posten[0].tatsaechlich).toBe(0);
    expect(d.grad).toBe(0);
  });

  // Der Nenner zählt NUR die Gegenstände mit Konto — sonst drückte ein Gegenstand ohne
  // Zuordnung den Deckungsgrad der anderen, obwohl über ihn gar nichts bekannt ist.
  it("rechnet den Grad nur über die Gegenstände mit Konto", () => {
    const items = [{ ...auto, kontoId: "k1" }, laptop];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(720) }));
    expect(d.soll).toBe(euroZuCent(870));
    expect(d.sollMitKonto).toBe(euroZuCent(720));
    expect(d.grad).toBe(100);
  });
});
