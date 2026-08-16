import { describe, it, expect } from "vitest";
import {
  euroZuCent,
  type IstBuchung,
  type Puffertopf,
  type Spartopf,
} from "../core";
import type { LedgerPort } from "./ports";
import { topfEntnahme } from "./topfEntnahme";

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) { const i = daten.findIndex((x) => x.id === b.id); if (i >= 0) daten[i] = b; else daten.push(b); },
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
