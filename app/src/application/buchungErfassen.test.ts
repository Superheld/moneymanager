import { describe, it, expect } from "vitest";
import { euroZuCent, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";
import { buchungErfassen, buchungLoeschen } from "./buchungErfassen";

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
  return {
    daten,
    async alle() {
      return [...daten];
    },
    async speichern(b) {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b;
      else daten.push(b);
    },
    async loeschen(id) {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
}

describe("buchungErfassen", () => {
  it("legt eine manuelle Ausgabe an (Aufwand → negativ), ohne planRef", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betragEuro: 12.5, charakter: "Aufwand", notiz: "Bäcker" });
    expect(b.betrag).toBe(euroZuCent(-12.5));
    expect(b.quelle).toBe("manuell");
    expect(b.planRef).toBeUndefined();
    expect(b.notiz).toBe("Bäcker");
    expect(ledger.daten).toHaveLength(1);
  });

  it("Ertrag wird positiv gebucht", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betragEuro: 100, charakter: "Ertrag" });
    expect(b.betrag).toBe(euroZuCent(100));
  });

  it("validiert Konto, Datum und Betrag", async () => {
    const ledger = memLedger();
    await expect(buchungErfassen(ledger, { kontoId: "", datum: "2026-06-17", betragEuro: 5, charakter: "Aufwand" })).rejects.toThrow(/Konto/);
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "17.06.2026", betragEuro: 5, charakter: "Aufwand" })).rejects.toThrow(/Datum/);
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betragEuro: 0, charakter: "Aufwand" })).rejects.toThrow(/größer als 0/);
  });

  it("buchungLoeschen entfernt die Buchung", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betragEuro: 5, charakter: "Aufwand" });
    await buchungLoeschen(ledger, b.id);
    expect(ledger.daten).toHaveLength(0);
  });
});
