import { describe, it, expect } from "vitest";
import { euroZuCent, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";
import { buchungBearbeiten, buchungErfassen, buchungLoeschen } from "./buchungErfassen";

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
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(12.5), charakter: "Aufwand", notiz: "Bäcker" });
    expect(b.betrag).toBe(euroZuCent(-12.5));
    expect(b.quelle).toBe("manuell");
    expect(b.planRef).toBeUndefined();
    expect(b.notiz).toBe("Bäcker");
    expect(ledger.daten).toHaveLength(1);
  });

  it("Ertrag wird positiv gebucht", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(100), charakter: "Ertrag" });
    expect(b.betrag).toBe(euroZuCent(100));
  });

  it("validiert Konto, Datum und Betrag", async () => {
    const ledger = memLedger();
    await expect(buchungErfassen(ledger, { kontoId: "", datum: "2026-06-17", betrag: euroZuCent(5), charakter: "Aufwand" })).rejects.toThrow("konto.waehlen");
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "17.06.2026", betrag: euroZuCent(5), charakter: "Aufwand" })).rejects.toThrow("datum.ungueltig");
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(0), charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
  });

  it("buchungBearbeiten erhält Herkunft (quelle, rohHash) und aktualisiert die Felder", async () => {
    const ledger = memLedger();
    const original: IstBuchung = { id: "x1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Aufwand", quelle: "import", rohHash: "h1" };
    ledger.daten.push(original);
    const u = await buchungBearbeiten(ledger, original, { datum: "2026-06-05", betrag: euroZuCent(25), charakter: "Aufwand", kategorieId: "k1", notiz: "korrigiert" });
    expect(u.id).toBe("x1");
    expect(u.quelle).toBe("import");
    expect(u.rohHash).toBe("h1");
    expect(u.betrag).toBe(euroZuCent(-25));
    expect(u.kategorieId).toBe("k1");
    expect(ledger.daten).toHaveLength(1);
  });

  it("buchungBearbeiten validiert Datum und Betrag", async () => {
    const ledger = memLedger();
    const o: IstBuchung = { id: "x", datum: "2026-06-01", betrag: -100, kontoId: "g", charakter: "Aufwand", quelle: "manuell" };
    await expect(buchungBearbeiten(ledger, o, { datum: "x", betrag: 100, charakter: "Aufwand" })).rejects.toThrow("datum.ungueltig");
    await expect(buchungBearbeiten(ledger, o, { datum: "2026-06-01", betrag: 0, charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
  });

  it("buchungLoeschen entfernt die Buchung", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(5), charakter: "Aufwand" });
    await buchungLoeschen(ledger, b.id);
    expect(ledger.daten).toHaveLength(0);
  });
});
