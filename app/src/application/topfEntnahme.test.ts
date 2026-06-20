import { describe, it, expect } from "vitest";
import {
  euroZuCent,
  type Ersatztopf,
  type Inventargegenstand,
  type IstBuchung,
  type Puffertopf,
  type Spartopf,
  type Topf,
} from "../core";
import type { InventarRepository, LedgerPort, TopfRepository } from "./ports";
import { ersatzErsetzt, topfEntnahme } from "./topfEntnahme";

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) { const i = daten.findIndex((x) => x.id === b.id); if (i >= 0) daten[i] = b; else daten.push(b); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}
function memTopf(seed: Topf[] = []): TopfRepository & { daten: Topf[] } {
  const daten = [...seed];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(t) { const i = daten.findIndex((x) => x.id === t.id); if (i >= 0) daten[i] = t; else daten.push(t); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}
function memInventar(seed: Inventargegenstand[] = []): InventarRepository & { daten: Inventargegenstand[] } {
  const daten = [...seed];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(g) { const i = daten.findIndex((x) => x.id === g.id); if (i >= 0) daten[i] = g; else daten.push(g); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

const puffer: Puffertopf = {
  id: "p", typ: "puffer", bezeichnung: "Autoreparatur", start: "2026-01-01",
  schaetzbetrag: euroZuCent(1200), fristMonate: 12, kategorieId: "kat-auto",
};
const spartopf: Spartopf = {
  id: "s", typ: "spartopf", bezeichnung: "Reise", start: "2026-01-01",
  zufuehrungProMonat: euroZuCent(50), sparziel: euroZuCent(500),
};

describe("topfEntnahme", () => {
  it("bucht einen Abfluss mit Verwendung = Topf und Kategorie des Topfes", async () => {
    const led = memLedger();
    const b = await topfEntnahme(led, { topf: puffer, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(300) });
    expect(led.daten).toHaveLength(1);
    expect(b.betrag).toBe(euroZuCent(-300)); // Abfluss
    expect(b.verwendung).toEqual({ art: "topf", topfId: "p" });
    expect(b.kategorieId).toBe("kat-auto");
    expect(b.kontoId).toBe("giro");
  });

  it("leitet den Charakter aus dem Topf-Typ ab: Puffer → Umschichtung", async () => {
    const led = memLedger();
    const b = await topfEntnahme(led, { topf: puffer, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(100) });
    expect(b.charakter).toBe("Umschichtung");
  });

  it("Spartopf → Aufwand (Konsum)", async () => {
    const led = memLedger();
    const b = await topfEntnahme(led, { topf: spartopf, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(100) });
    expect(b.charakter).toBe("Aufwand");
  });

  it("validiert Konto, Datum und Betrag", async () => {
    const led = memLedger();
    await expect(topfEntnahme(led, { topf: puffer, kontoId: "", datum: "2026-06-01", betrag: euroZuCent(100) })).rejects.toThrow("konto.waehlen");
    await expect(topfEntnahme(led, { topf: puffer, kontoId: "giro", datum: "2026", betrag: euroZuCent(100) })).rejects.toThrow("datum.ungueltig");
    await expect(topfEntnahme(led, { topf: puffer, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(0) })).rejects.toThrow("betrag.groesserNull");
  });
});

describe("ersatzErsetzt", () => {
  const gegenstand: Inventargegenstand = {
    id: "inv", bezeichnung: "Laptop", wiederbeschaffung: euroZuCent(1200),
    nutzungsdauerMonate: 36, anschaffung: "2023-01-01", kategorieId: "kat-it",
  };
  const ersatz: Ersatztopf = {
    id: "e", typ: "ersatz", bezeichnung: "Laptop", start: "2023-01-01",
    wiederbeschaffung: euroZuCent(1200), nutzungsdauerMonate: 36, inventarId: "inv", kategorieId: "kat-it",
  };

  it("bucht die Entnahme und startet den Zyklus neu (Topf.start + Inventar.anschaffung)", async () => {
    const led = memLedger();
    const topfRepo = memTopf([ersatz]);
    const invRepo = memInventar([gegenstand]);
    const { buchung, topf } = await ersatzErsetzt(led, topfRepo, invRepo, {
      topf: ersatz, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(1100),
    });
    expect(buchung.charakter).toBe("Umschichtung");
    expect(buchung.verwendung).toEqual({ art: "topf", topfId: "e" });
    expect(topf.start).toBe("2026-06-01");
    expect(topfRepo.daten[0].start).toBe("2026-06-01");
    expect(invRepo.daten[0].anschaffung).toBe("2026-06-01");
  });

  it("funktioniert auch ohne verknüpften Inventargegenstand (nur Topf.start)", async () => {
    const led = memLedger();
    const ohneInv: Ersatztopf = { ...ersatz, inventarId: undefined };
    const topfRepo = memTopf([ohneInv]);
    const invRepo = memInventar();
    const { topf } = await ersatzErsetzt(led, topfRepo, invRepo, {
      topf: ohneInv, kontoId: "giro", datum: "2026-06-01", betrag: euroZuCent(1100),
    });
    expect(topf.start).toBe("2026-06-01");
    expect(invRepo.daten).toHaveLength(0);
  });
});
