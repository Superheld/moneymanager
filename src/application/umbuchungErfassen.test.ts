import { describe, it, expect } from "vitest";
import { euroZuCent, liquideMittelReal, realerKontostand, type IstBuchung, type Zahlungskonto } from "../core";
import type { LedgerPort } from "./ports";
import { umbuchungErfassen, umbuchungLoeschen } from "./umbuchungErfassen";

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

function konto(id: string, saldoEuro: number): Zahlungskonto {
  return { id, bezeichnung: id, typ: "Giro", inhaberIds: [], saldo: euroZuCent(saldoEuro) };
}

describe("umbuchungErfassen", () => {
  it("erzeugt zwei verknüpfte Beine mit gespiegeltem Vorzeichen, Charakter Umschichtung", async () => {
    const ledger = memLedger();
    const { ab, zu } = await umbuchungErfassen(ledger, { vonKontoId: "giro", nachKontoId: "tagesgeld", datum: "2026-06-17", betrag: euroZuCent(500) });
    expect(ab.betrag).toBe(euroZuCent(-500));
    expect(zu.betrag).toBe(euroZuCent(500));
    expect(ab.charakter).toBe("Umschichtung");
    expect(zu.charakter).toBe("Umschichtung");
    expect(ab.transferId).toBe(zu.transferId);
    expect(ab.gegenkontoId).toBe("tagesgeld");
    expect(zu.gegenkontoId).toBe("giro");
    expect(ledger.daten).toHaveLength(2);
  });

  it("lässt die liquiden Mittel über alle Konten unverändert (netto 0)", async () => {
    const ledger = memLedger();
    const konten = [konto("giro", 1000), konto("tagesgeld", 0)];
    await umbuchungErfassen(ledger, { vonKontoId: "giro", nachKontoId: "tagesgeld", datum: "2026-06-17", betrag: euroZuCent(500) });
    const ist = await ledger.alle();
    expect(realerKontostand(konten[0], ist)).toBe(euroZuCent(500));
    expect(realerKontostand(konten[1], ist)).toBe(euroZuCent(500));
    expect(liquideMittelReal(konten, ist)).toBe(euroZuCent(1000));
  });

  it("validiert: Konten verschieden, Datum, Betrag > 0", async () => {
    const ledger = memLedger();
    await expect(umbuchungErfassen(ledger, { vonKontoId: "a", nachKontoId: "a", datum: "2026-06-17", betrag: euroZuCent(5) })).rejects.toThrow("konten.verschieden");
    await expect(umbuchungErfassen(ledger, { vonKontoId: "a", nachKontoId: "b", datum: "x", betrag: euroZuCent(5) })).rejects.toThrow("datum.ungueltig");
    await expect(umbuchungErfassen(ledger, { vonKontoId: "a", nachKontoId: "b", datum: "2026-06-17", betrag: euroZuCent(0) })).rejects.toThrow("betrag.groesserNull");
  });

  it("umbuchungLoeschen entfernt beide Beine", async () => {
    const ledger = memLedger();
    const { ab } = await umbuchungErfassen(ledger, { vonKontoId: "giro", nachKontoId: "tagesgeld", datum: "2026-06-17", betrag: euroZuCent(500) });
    await umbuchungLoeschen(ledger, ab.transferId!);
    expect(ledger.daten).toHaveLength(0);
  });
});
