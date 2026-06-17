import { describe, it, expect } from "vitest";
import { euroZuCent, type Vertrag, type Zahlungsregel } from "../core";
import type { VertragRepository, ZahlungsregelRepository } from "./ports";
import { vertragAktualisieren, vertragAnlegen, vertragLoeschen, type VertragEingabe } from "./vertragAnlegen";

function memVertrag(): VertragRepository & { daten: Vertrag[] } {
  const daten: Vertrag[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(v) { const i = daten.findIndex((x) => x.id === v.id); if (i >= 0) daten[i] = v; else daten.push(v); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}
function memRegel(): ZahlungsregelRepository & { daten: Zahlungsregel[] } {
  const daten: Zahlungsregel[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(r) { const i = daten.findIndex((x) => x.id === r.id); if (i >= 0) daten[i] = r; else daten.push(r); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

function eingabe(over: Partial<VertragEingabe> = {}): VertragEingabe {
  return {
    anbieter: "Stadtwerke",
    beginn: "2026-01-01",
    verlaengerung: "automatisch",
    verlaengerungMonate: 12,
    betragEuro: 60,
    rhythmus: "monatlich",
    charakter: "Aufwand",
    ...over,
  };
}

describe("vertragAnlegen", () => {
  it("schreibt Vertrag UND abgeleitete Zahlungsregel, verknüpft über vertragId", async () => {
    const vr = memVertrag(), rr = memRegel();
    const { vertrag, regel } = await vertragAnlegen(vr, rr, eingabe());
    expect(vr.daten).toHaveLength(1);
    expect(rr.daten).toHaveLength(1);
    expect(regel.vertragId).toBe(vertrag.id);
    // Aufwand → negativer Betrag
    expect(regel.betrag).toBe(euroZuCent(-60));
    expect(regel.startdatum).toBe("2026-01-01");
  });

  it("nutzt ersteZahlung als Regel-Start, wenn gesetzt", async () => {
    const vr = memVertrag(), rr = memRegel();
    const { regel } = await vertragAnlegen(vr, rr, eingabe({ ersteZahlung: "2026-02-15" }));
    expect(regel.startdatum).toBe("2026-02-15");
  });

  it("verwirft verlaengerungMonate, wenn nicht automatisch verlängert", async () => {
    const vr = memVertrag(), rr = memRegel();
    const { vertrag } = await vertragAnlegen(vr, rr, eingabe({ verlaengerung: "keine", verlaengerungMonate: 12 }));
    expect(vertrag.verlaengerungMonate).toBeUndefined();
  });

  it("validiert Anbieter, Beginn-Datum und Betrag", async () => {
    const vr = memVertrag(), rr = memRegel();
    await expect(vertragAnlegen(vr, rr, eingabe({ anbieter: " " }))).rejects.toThrow(/Anbieter/);
    await expect(vertragAnlegen(vr, rr, eingabe({ beginn: "2026" }))).rejects.toThrow(/Beginn/);
    await expect(vertragAnlegen(vr, rr, eingabe({ betragEuro: 0 }))).rejects.toThrow(/größer als 0/);
  });
});

describe("vertragAktualisieren / vertragLoeschen", () => {
  it("behält die IDs und aktualisiert die verknüpfte Regel", async () => {
    const vr = memVertrag(), rr = memRegel();
    const { vertrag, regel } = await vertragAnlegen(vr, rr, eingabe());
    const { vertrag: v2, regel: r2 } = await vertragAktualisieren(vr, rr, vertrag.id, eingabe({ betragEuro: 75 }));
    expect(v2.id).toBe(vertrag.id);
    expect(r2.id).toBe(regel.id);
    expect(r2.betrag).toBe(euroZuCent(-75));
    expect(vr.daten).toHaveLength(1);
    expect(rr.daten).toHaveLength(1);
  });

  it("löscht Vertrag samt abgeleiteter Regel(n)", async () => {
    const vr = memVertrag(), rr = memRegel();
    const { vertrag } = await vertragAnlegen(vr, rr, eingabe());
    await vertragLoeschen(vr, rr, vertrag.id);
    expect(vr.daten).toHaveLength(0);
    expect(rr.daten).toHaveLength(0);
  });
});
