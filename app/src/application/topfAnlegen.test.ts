import { describe, it, expect } from "vitest";
import { euroZuCent, type Topf } from "../core";
import type { TopfRepository } from "./ports";
import { topfAnlegen } from "./topfAnlegen";

function memRepo(): TopfRepository & { daten: Topf[] } {
  const daten: Topf[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(t) { const i = daten.findIndex((x) => x.id === t.id); if (i >= 0) daten[i] = t; else daten.push(t); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

describe("topfAnlegen — gemeinsame Validierung", () => {
  it("verlangt Bezeichnung und gültiges Startdatum", async () => {
    const repo = memRepo();
    await expect(topfAnlegen(repo, { typ: "puffer", bezeichnung: "  ", start: "2026-06-01", schaetzbetrag: euroZuCent(100), fristMonate: 6 })).rejects.toThrow("bezeichnung.fehlt");
    await expect(topfAnlegen(repo, { typ: "puffer", bezeichnung: "X", start: "06/2026", schaetzbetrag: euroZuCent(100), fristMonate: 6 })).rejects.toThrow("startdatum.ungueltig");
  });
});

describe("topfAnlegen — Ersatz", () => {
  it("legt einen Ersatztopf an und konvertiert den Wiederbeschaffungswert", async () => {
    const repo = memRepo();
    const t = await topfAnlegen(repo, { typ: "ersatz", bezeichnung: "Laptop", start: "2026-06-01", wiederbeschaffung: euroZuCent(1200), nutzungsdauerMonate: 48 });
    expect(t.typ).toBe("ersatz");
    if (t.typ === "ersatz") {
      expect(t.wiederbeschaffung).toBe(euroZuCent(1200));
      expect(t.nutzungsdauerMonate).toBe(48);
    }
  });

  it("validiert Wiederbeschaffung und Nutzungsdauer", async () => {
    const repo = memRepo();
    await expect(topfAnlegen(repo, { typ: "ersatz", bezeichnung: "X", start: "2026-06-01", wiederbeschaffung: euroZuCent(0), nutzungsdauerMonate: 12 })).rejects.toThrow("wiederbeschaffung.groesserNull");
    await expect(topfAnlegen(repo, { typ: "ersatz", bezeichnung: "X", start: "2026-06-01", wiederbeschaffung: euroZuCent(100), nutzungsdauerMonate: 0 })).rejects.toThrow("nutzungsdauer.groesserNull");
  });
});

describe("topfAnlegen — Puffer", () => {
  it("legt einen Puffertopf an", async () => {
    const repo = memRepo();
    const t = await topfAnlegen(repo, { typ: "puffer", bezeichnung: "Reparaturen", start: "2026-06-01", schaetzbetrag: euroZuCent(600), fristMonate: 12 });
    if (t.typ === "puffer") {
      expect(t.schaetzbetrag).toBe(euroZuCent(600));
      expect(t.fristMonate).toBe(12);
    }
  });

  it("validiert Schätzbetrag und Frist", async () => {
    const repo = memRepo();
    await expect(topfAnlegen(repo, { typ: "puffer", bezeichnung: "X", start: "2026-06-01", schaetzbetrag: euroZuCent(0), fristMonate: 6 })).rejects.toThrow("schaetzbetrag.groesserNull");
    await expect(topfAnlegen(repo, { typ: "puffer", bezeichnung: "X", start: "2026-06-01", schaetzbetrag: euroZuCent(100), fristMonate: 0 })).rejects.toThrow("zeitfenster.groesserNull");
  });
});

describe("topfAnlegen — Spartopf", () => {
  it("legt einen Spartopf an, Sparziel optional", async () => {
    const repo = memRepo();
    const ohneZiel = await topfAnlegen(repo, { typ: "spartopf", bezeichnung: "Urlaub", start: "2026-06-01", zufuehrungProMonat: euroZuCent(100) });
    if (ohneZiel.typ === "spartopf") {
      expect(ohneZiel.zufuehrungProMonat).toBe(euroZuCent(100));
      expect(ohneZiel.sparziel).toBeUndefined();
    }
    const mitZiel = await topfAnlegen(repo, { typ: "spartopf", bezeichnung: "Auto", start: "2026-06-01", zufuehrungProMonat: euroZuCent(200), sparziel: euroZuCent(5000) });
    if (mitZiel.typ === "spartopf") expect(mitZiel.sparziel).toBe(euroZuCent(5000));
  });

  it("validiert die Zuführung", async () => {
    const repo = memRepo();
    await expect(topfAnlegen(repo, { typ: "spartopf", bezeichnung: "X", start: "2026-06-01", zufuehrungProMonat: euroZuCent(0) })).rejects.toThrow("zufuehrung.groesserNull");
  });
});
