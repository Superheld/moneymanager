import { describe, it, expect } from "vitest";
import { euroZuCent, regelnAusVertraegen, type Vertrag } from "../../core";
import type { VertragRepository } from "../ports";
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
function eingabe(over: Partial<VertragEingabe> = {}): VertragEingabe {
  return {
    anbieter: "Petrossen",
    beginn: "2026-01-01",
    verlaengerung: "automatisch",
    verlaengerungMonate: 12,
    betrag: euroZuCent(60),
    rhythmus: "monatlich",
    charakter: "Aufwand",
    ...over,
  };
}

describe("vertragAnlegen", () => {
  it("schreibt den Vertrag samt Zahlung; die Regel der Planung wird aus ihm gebaut", async () => {
    const vr = memVertrag();
    const { vertrag, regel } = await vertragAnlegen(vr, eingabe());
    expect(vr.daten).toHaveLength(1);
    expect(regelnAusVertraegen(vr.daten)).toHaveLength(1);
    expect(regel.vertragId).toBe(vertrag.id);
    // Aufwand → negativer Betrag
    expect(regel.betrag).toBe(euroZuCent(-60));
    expect(regel.startdatum).toBe("2026-01-01");
  });

  it("nutzt ersteZahlung als Regel-Start, wenn gesetzt", async () => {
    const vr = memVertrag();
    const { regel } = await vertragAnlegen(vr, eingabe({ ersteZahlung: "2026-02-15" }));
    expect(regel.startdatum).toBe("2026-02-15");
  });

  it("verwirft verlaengerungMonate, wenn nicht automatisch verlängert", async () => {
    const vr = memVertrag();
    const { vertrag } = await vertragAnlegen(vr, eingabe({ verlaengerung: "keine", verlaengerungMonate: 12 }));
    expect(vertrag.verlaengerungMonate).toBeUndefined();
  });

  it("validiert Anbieter, Beginn-Datum und Betrag", async () => {
    const vr = memVertrag();
    await expect(vertragAnlegen(vr, eingabe({ anbieter: " " }))).rejects.toThrow("anbieter.fehlt");
    await expect(vertragAnlegen(vr, eingabe({ beginn: "2026" }))).rejects.toThrow("beginn.ungueltig");
    await expect(vertragAnlegen(vr, eingabe({ betrag: euroZuCent(0) }))).rejects.toThrow("betrag.groesserNull");
  });
});

describe("vertragAktualisieren / vertragLoeschen", () => {
  it("behält die Id und aktualisiert die Zahlung", async () => {
    const vr = memVertrag();
    const { vertrag, regel } = await vertragAnlegen(vr, eingabe());
    const { vertrag: v2, regel: r2 } = await vertragAktualisieren(vr, vertrag.id, eingabe({ betrag: euroZuCent(75) }));
    expect(v2.id).toBe(vertrag.id);
    expect(r2.id).toBe(regel.id);
    expect(r2.betrag).toBe(euroZuCent(-75));
    expect(vr.daten).toHaveLength(1);
    expect(regelnAusVertraegen(vr.daten)).toHaveLength(1);
  });

  it("löscht den Vertrag und mit ihm seine Zahlung", async () => {
    const vr = memVertrag();
    const { vertrag } = await vertragAnlegen(vr, eingabe());
    await vertragLoeschen(vr, vertrag.id);
    expect(vr.daten).toHaveLength(0);
  });
});

describe("Kündigen — das Vertragsende", () => {
  it("schreibt das Ende an den Vertrag, und die Regel der Planung nimmt es von dort", async () => {
    const vr = memVertrag();
    const { vertrag } = await vertragAnlegen(vr, eingabe());
    const { vertrag: v2, regel } = await vertragAktualisieren(vr, vertrag.id, eingabe({ ende: "2026-03-31" }));
    expect(v2.ende).toBe("2026-03-31");
    expect(regel.vertragsende).toBe("2026-03-31");
  });

  it("ein geleertes Ende nimmt die Kündigung zurück", async () => {
    const vr = memVertrag();
    const { vertrag } = await vertragAnlegen(vr, eingabe({ ende: "2026-03-31" }));
    const { vertrag: v2 } = await vertragAktualisieren(vr, vertrag.id, eingabe({ ende: "" }));
    expect(v2.ende).toBeUndefined();
  });

  it("weist ein Ende in falscher Form und eines vor dem Beginn ab", async () => {
    const vr = memVertrag();
    await expect(vertragAnlegen(vr, eingabe({ ende: "31.03.2026" }))).rejects.toThrow("ende.ungueltig");
    await expect(vertragAnlegen(vr, eingabe({ ende: "2025-12-31" }))).rejects.toThrow("ende.vorBeginn");
  });

  it("ein Ende am Tag des Beginns ist erlaubt", async () => {
    const vr = memVertrag();
    const { vertrag } = await vertragAnlegen(vr, eingabe({ ende: "2026-01-01" }));
    expect(vertrag.ende).toBe("2026-01-01");
  });
});
