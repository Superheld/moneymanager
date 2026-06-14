import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { Zahlungsregel } from "./zahlungsregel";
import type { Budget } from "./budget";
import type { Ersatztopf } from "./topf";
import { projiziereLiquiditaet } from "./projektion";

const gehalt: Zahlungsregel = {
  id: "g", bezeichnung: "Gehalt", betrag: euroZuCent(3000), rhythmus: "monatlich",
  startdatum: "2026-01-01", charakter: "Ertrag",
};
const miete: Zahlungsregel = {
  id: "m", bezeichnung: "Miete", betrag: euroZuCent(-1200), rhythmus: "monatlich",
  startdatum: "2026-01-01", charakter: "Aufwand",
};
const lebensmittel: Budget = { id: "b", kategorieId: "k", rahmen: euroZuCent(400), periode: "monatlich" };
const waschmaschine: Ersatztopf = {
  id: "t", typ: "ersatz", bezeichnung: "Waschmaschine", start: "2026-01-01",
  wiederbeschaffung: euroZuCent(600), nutzungsdauerMonate: 60, // 10 €/Mt
};

describe("projiziereLiquiditaet", () => {
  it("zwei Kurven: Kontosaldo (echte Flüsse) und freie Liquidität (− Topf-Sollstände)", () => {
    const v = projiziereLiquiditaet(
      [gehalt, miete], [lebensmittel], [waschmaschine], "2026-01-01", 12, euroZuCent(2000),
    );
    // Monat 0: netto = 3000 − 1200 − 400 = 1400; Kontosaldo = 2000 + 1400 = 3400.
    expect(v[0].netto).toBe(euroZuCent(1400));
    expect(v[0].kontosaldo).toBe(euroZuCent(3400));
    // Topf-Sollstand am Monatsende (1 Monat) = 10 €; freie Liquidität = 3390.
    expect(v[0].sollSumme).toBe(euroZuCent(10));
    expect(v[0].freieLiquiditaet).toBe(euroZuCent(3390));
  });

  it("Topf-Zuführung bewegt den Kontosaldo nicht, nur die freie Liquidität", () => {
    const v = projiziereLiquiditaet([], [], [waschmaschine], "2026-01-01", 12, euroZuCent(1000));
    // keine echten Flüsse → Kontosaldo bleibt 1000 über alle Monate
    expect(v[0].kontosaldo).toBe(euroZuCent(1000));
    expect(v[11].kontosaldo).toBe(euroZuCent(1000));
    // freie Liquidität sinkt mit wachsendem Sollstand (nach 12 Monaten 120 €)
    expect(v[11].sollSumme).toBe(euroZuCent(120));
    expect(v[11].freieLiquiditaet).toBe(euroZuCent(880));
  });

  it("freie Liquidität darf ins Minus gehen (Überplanung)", () => {
    const grosserPuffer: Ersatztopf = {
      id: "p", typ: "ersatz", bezeichnung: "Dach", start: "2026-01-01",
      wiederbeschaffung: euroZuCent(12000), nutzungsdauerMonate: 12, // 1000 €/Mt
    };
    const v = projiziereLiquiditaet([], [], [grosserPuffer], "2026-01-01", 12, euroZuCent(500));
    // nach 1 Monat Sollstand 1000 > 500 → freie Liquidität −500
    expect(v[0].freieLiquiditaet).toBe(euroZuCent(-500));
  });
});
