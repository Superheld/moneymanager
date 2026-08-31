// Rücklage: die Rechnung (Ziel ÷ Frist, sonst die freie Rate) und ihr Abgleich gegen
// echte Kontostände. Reine Funktionen, keine Uhr, kein IO.

import { describe, expect, it } from "vitest";
import { euroZuCent } from "../basis/geld";
import {
  monatsRuecklage,
  monatsRuecklageGesamt,
  ruecklagenDeckung,
  sollRuecklage,
  hatZiel,
  mindestRuecklage,
  zielwertGesamt,
  type Ruecklage,
} from "./ruecklage";

const auto: Ruecklage = {
  id: "auto",
  bezeichnung: "Auto",
  ziel: euroZuCent(12000),
  fristMonate: 100,
  beginn: "2026-01-01",
};
const laptop: Ruecklage = {
  id: "laptop",
  bezeichnung: "Laptop",
  ziel: euroZuCent(1200),
  fristMonate: 48,
  beginn: "2026-01-01",
};

describe("monatsRuecklage", () => {
  it("teilt das Ziel durch die Frist", () => {
    expect(monatsRuecklage(auto)).toBe(euroZuCent(120));
    expect(monatsRuecklage(laptop)).toBe(2500); // 120000 / 48
  });

  it("summiert über alle Rücklagen", () => {
    expect(monatsRuecklageGesamt([auto, laptop])).toBe(euroZuCent(120) + 2500);
    expect(monatsRuecklageGesamt([])).toBe(0);
  });

  it("bleibt bei Frist 0 endlich statt Infinity zu werden", () => {
    expect(monatsRuecklage({ ...auto, fristMonate: 0 })).toBe(0);
  });
});

describe("sollRuecklage", () => {
  it("wächst linear ab dem Beginn", () => {
    expect(sollRuecklage(auto, "2026-01-01")).toBe(0);
    expect(sollRuecklage(auto, "2026-07-01")).toBe(euroZuCent(720)); // 6 × 120
  });

  it("wird auf das Ziel gedeckelt", () => {
    expect(sollRuecklage(auto, "2200-01-01")).toBe(euroZuCent(12000));
  });

  it("ist vor dem Beginn 0", () => {
    expect(sollRuecklage(auto, "2025-06-01")).toBe(0);
  });

  // Anteilig aus dem Ziel gerechnet, nicht als (gerundete Rate × Monate) — sonst fehlte
  // am Ende ein Rundungsrest, und die fachliche Zusage bräche.
  it("erreicht das Ziel am Ende der Frist exakt, auch bei krummer Teilung", () => {
    const krumm: Ruecklage = { ...auto, ziel: 1000, fristMonate: 3 };
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

  // Der Nenner zählt NUR die Rücklagen mit Konto — sonst drückte eine Rücklage ohne
  // Zuordnung den Deckungsgrad der anderen, obwohl über sie gar nichts bekannt ist.
  it("rechnet den Grad nur über die Rücklagen mit Konto", () => {
    const items = [{ ...auto, kontoId: "k1" }, laptop];
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(720) }));
    expect(d.soll).toBe(euroZuCent(870));
    expect(d.sollMitKonto).toBe(euroZuCent(720));
    expect(d.grad).toBe(100);
  });
});

/**
 * Die freie Rücklage — der Fall, für den das frühere Inventar keinen Platz hatte. Sie
 * hat kein Ziel, keine Frist und keinen Deckel; ihre Rate steht direkt da.
 */
describe("Rücklage ohne Ziel", () => {
  const urlaub: Ruecklage = {
    id: "urlaub",
    bezeichnung: "Urlaub",
    rate: euroZuCent(50),
    beginn: "2026-01-01",
  };

  it("nimmt die eingetragene Rate", () => {
    expect(hatZiel(urlaub)).toBe(false);
    expect(monatsRuecklage(urlaub)).toBe(euroZuCent(50));
  });

  it("wächst weiter, statt irgendwo anzuschlagen", () => {
    expect(sollRuecklage(urlaub, "2026-07-01")).toBe(euroZuCent(300));
    // Zehn Jahre später sind es zehn Jahre — es gibt nichts, wogegen zu deckeln wäre.
    expect(sollRuecklage(urlaub, "2036-01-01")).toBe(euroZuCent(6000));
  });

  it("zählt nicht in den Zielwert", () => {
    // Sonst mischte die Summe „was soll einmal dasein" mit „was ist bis jetzt fällig".
    expect(zielwertGesamt([auto, urlaub])).toBe(euroZuCent(12000));
  });

  it("wird beim Abgleich behandelt wie jede andere", () => {
    const items = [{ ...urlaub, kontoId: "k1" }];
    const d = ruecklagenDeckung(items, "2026-07-01", new Map([["k1", euroZuCent(150)]]));
    expect(d.soll).toBe(euroZuCent(300));
    expect(d.grad).toBe(50);
  });

  it("zählt ohne Rate als 0 und reißt keine Summe auf", () => {
    const leer: Ruecklage = { id: "x", bezeichnung: "x", beginn: "2026-01-01" };
    expect(monatsRuecklage(leer)).toBe(0);
    expect(sollRuecklage(leer, "2030-01-01")).toBe(0);
  });
});

/** Reine Information: die Faustformel für den Notgroschen. */
describe("mindestRuecklage", () => {
  it("nimmt drei Monatseinnahmen", () => {
    expect(mindestRuecklage(euroZuCent(3000))).toBe(euroZuCent(9000));
  });

  it("lässt den Faktor offen — die Formel ist eine Faustregel, keine Herleitung", () => {
    expect(mindestRuecklage(euroZuCent(3000), 6)).toBe(euroZuCent(18000));
  });

  it("wird bei Einnahmen von 0 nicht negativ", () => {
    expect(mindestRuecklage(-5000)).toBe(0);
  });
});
