// Rücklage: die Rechnung (Ziel ÷ Frist, sonst die freie Rate) und ihr Abgleich gegen
// echte Kontostände. Reine Funktionen, keine Uhr, kein IO.

import { describe, expect, it } from "vitest";
import { euroZuCent } from "../basis/geld";
import {
  monatsRuecklage,
  monatsRuecklageGesamt,
  ruecklagenBedarf,
  ruecklagenDeckung,
  ruecklagenKonten,
  sollRuecklage,
  hatZiel,
  mindestRuecklage,
  zielwertGesamt,
  zyklusUngedeckt,
  type Ruecklage,
  type Ruecklagenzyklus,
} from "./ruecklage";
import type { Budget } from "../budgets/budget";

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

  // Der Fall, wegen dem es die Kontobelegung gibt: ein aufbauendes Budget auf DEMSELBEN
  // Konto beansprucht denselben Euro. Ohne den zweiten Anspruch wäre die Rücklage hier voll
  // gedeckt — obwohl die Hälfte des Geldes dem Budget gehört.
  it("teilt das Konto mit fremden Ansprüchen, statt es der Rücklage allein zu geben", () => {
    const items = [{ ...auto, kontoId: "k1" }];
    const budget = { art: "budget" as const, id: "b1", kontoId: "k1", betrag: euroZuCent(720) };
    const d = ruecklagenDeckung(items, "2026-07-01", stand({ k1: euroZuCent(720) }), [budget]);
    expect(d.posten[0].tatsaechlich).toBe(euroZuCent(360));
    expect(d.grad).toBe(50);
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

describe("zyklusUngedeckt", () => {
  // 1200 in 12 Monaten ab Januar, ausgebucht Anfang Juli: sechs Monate, also 600 angespart.
  const zyklus: Ruecklagenzyklus = {
    id: "a1", ruecklageId: "r1", datum: "2026-07-01",
    zyklusBeginn: "2026-01-01", zyklusZiel: 120000, zyklusFrist: 12,
  };

  it("nennt, was die Ausgabe über das Angesparte hinaus kostete", () => {
    expect(zyklusUngedeckt(zyklus, 80000)).toBe(20000);
  });

  it("ist null Cent, wenn das Angesparte reicht", () => {
    expect(zyklusUngedeckt(zyklus, 50000)).toBe(0);
  });

  it("weiss nichts, wenn die Ausbuchung keinen Zyklus festhielt", () => {
    expect(zyklusUngedeckt({ id: "a2", ruecklageId: "r1", datum: "2026-07-01" }, 80000)).toBeNull();
  });

  it("liest eine Rückbuchung nicht als Ausgabe", () => {
    expect(zyklusUngedeckt(zyklus, -5000)).toBe(0);
  });
});

/**
 * Seit 2026-11-16 zählen die Kennzahlen des Bereichs beide Formen. Eine Rücklage über die
 * Kategorie (im Modell ein aufbauendes Budget) liefert ihren Rest als Anspruch der Art
 * `budget` an — ihr Soll ist dieser Rest, gedeckt ist, was die Belegung ihr zuteilt.
 */
describe("ruecklagenDeckung über beide Formen", () => {
  const stand = (eintraege: Record<string, number>) => new Map(Object.entries(eintraege));
  const ueberKategorie = { art: "budget" as const, id: "b-kat", kontoId: "k2", betrag: euroZuCent(400) };

  it("zählt den Rest einer Rücklage über die Kategorie in Soll, Gedecktes und Grad", () => {
    // Von Hand: 720,00 Soll auf k1, voll da. Über die Kategorie: 400,00 Rest auf k2, 100,00 da.
    const d = ruecklagenDeckung(
      [{ ...auto, kontoId: "k1" }],
      "2026-07-01",
      stand({ k1: euroZuCent(720), k2: euroZuCent(100) }),
      [ueberKategorie],
    );
    expect(d.soll).toBe(euroZuCent(1120));
    expect(d.sollMitKonto).toBe(euroZuCent(1120));
    expect(d.tatsaechlich).toBe(euroZuCent(820));
    expect(d.grad).toBe(73);
    expect(d.ueberKategorie).toEqual([{ ...ueberKategorie, gedeckt: euroZuCent(100) }]);
    // Die Posten bleiben die Rücklagen von Hand — die Liste darunter zeigt nur sie.
    expect(d.posten.map((p) => p.ruecklage.id)).toEqual(["auto"]);
  });

  it("lässt einen Rest von null oder darunter aus — er beansprucht nichts", () => {
    const d = ruecklagenDeckung([], "2026-07-01", stand({ k2: euroZuCent(100) }), [{ ...ueberKategorie, betrag: -500 }]);
    expect(d).toMatchObject({ soll: 0, tatsaechlich: 0, grad: 100, ueberKategorie: [] });
  });

  it("nennt die Lage nur Rechnung, wenn keine Rücklage ein Konto hat und es keine über die Kategorie gibt", () => {
    expect(ruecklagenDeckung([auto], "2026-07-01", stand({})).nurRechnung).toBe(true);
    // Eine über die Kategorie hat immer ein Konto, auch mit Rest 0.
    expect(ruecklagenDeckung([auto], "2026-07-01", stand({}), [{ ...ueberKategorie, betrag: 0 }]).nurRechnung).toBe(false);
    expect(ruecklagenDeckung([{ ...auto, kontoId: "k1" }], "2026-07-01", stand({})).nurRechnung).toBe(false);
    expect(ruecklagenDeckung([], "2026-07-01", stand({})).nurRechnung).toBe(false);
  });
});

describe("ruecklagenKonten und ruecklagenBedarf mit Rücklagen über die Kategorie", () => {
  const konten = [
    { id: "giro", bezeichnung: "Giro", typ: "Giro" as const, klasse: "liquide" as const, inhaberIds: [], saldo: 0 },
    { id: "spar", bezeichnung: "Spar", typ: "Tagesgeld" as const, klasse: "sparen" as const, inhaberIds: [], saldo: 0 },
  ];
  const budget = (over: Partial<Budget> = {}): Budget => ({
    id: "b", kategorieId: "kat", kontoId: "spar", art: "aufbauend", start: "2026-01-01",
    betraege: [{ abMonat: "2026-01", betrag: euroZuCent(30) }, { abMonat: "2026-06", betrag: euroZuCent(40) }],
    ...over,
  });

  it("nimmt das nicht liquide Konto einer Rücklage über die Kategorie dazu, das liquide nicht", () => {
    expect([...ruecklagenKonten(konten, [], [budget()])]).toEqual(["spar"]);
    // Auf dem Girokonto zählte sonst jedes Gehalt als Eingang in die Rücklagen.
    expect([...ruecklagenKonten(konten, [], [budget({ kontoId: "giro" })])]).toEqual([]);
    // Ein monatliches Budget ist keine Rücklage.
    expect([...ruecklagenKonten(konten, [], [budget({ art: "monatlich" })])]).toEqual([]);
  });

  it("zählt im Bedarf die Zuführung des Monats beider Formen", () => {
    // 120,00 im Monat von Hand (Auto) + 40,00 ab Juni über die Kategorie; ein monatliches zählt nicht.
    expect(ruecklagenBedarf([auto], [budget(), budget({ id: "m", art: "monatlich" })], "2026-06")).toBe(euroZuCent(160));
    expect(ruecklagenBedarf([auto], [budget()], "2026-05")).toBe(euroZuCent(150));
    // Vor dem Start legt sie noch nichts zurück.
    expect(ruecklagenBedarf([], [budget({ start: "2026-08-01" })], "2026-07")).toBe(0);
  });
});
