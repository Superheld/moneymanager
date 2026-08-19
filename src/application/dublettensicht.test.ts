// Die drei Blicke auf dieselbe Frage — und was sie unterscheidet.
//
// Der Anlass ist ein gemeldeter Widerspruch: der Kontoauszug schwieg, der Dialog mahnte
// weiter. Zwei Stellen, zwei Regeln. Hier wird festgehalten, welche Regel wo gilt.
//
// Die Namen und Beträge sind erfunden; nachgebaut ist nur die FORM, in der sich zwei
// Quellen unterscheiden — das Repo ist öffentlich.

import { describe, expect, it } from "vitest";
import {
  entwurfVerdacht,
  freigabeAus,
  freigabeSchluessel,
  freigegebenePaare,
  ledgerVerdacht,
  stapelVerdacht,
} from "./dublettensicht";
import type { Umsatz } from "./import";

function umsatz(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1", laufId: "l-datei", zahlungskontoId: "giro", buchungstag: "2026-08-11",
    betrag: -5700, waehrung: "EUR", gegenpartei: "Musterladen",
    verwendungszweck: "Musterladen, Musterstadt", rohHash: "h1",
    status: "verbucht", istbuchungId: "b1", ...over,
  };
}

const AUS_DATEI = umsatz({ id: "u-datei", laufId: "l-datei", istbuchungId: "b-datei" });
const AUS_BANK = umsatz({
  id: "u-bank", laufId: "l-bank", istbuchungId: "b-bank", rohHash: "h2",
  verwendungszweck: "Musterladen, Musterstadt DEKarte Nr 1",
});

describe("freigabeSchluessel", () => {
  it("ist richtungslos", () => {
    expect(freigabeSchluessel("a", "b")).toBe(freigabeSchluessel("b", "a"));
  });

  it("sortiert auch beim Anlegen", () => {
    const f = freigabeAus("z", "a", "2026-08-20T10:00:00.000Z");
    expect([f.umsatzA, f.umsatzB]).toEqual(["a", "z"]);
  });
});

describe("ledgerVerdacht — steht das zweimal im Saldo?", () => {
  const IM_LEDGER = new Set(["b-datei", "b-bank"]);

  it("markiert beide Zeilen", () => {
    const karte = ledgerVerdacht([AUS_DATEI, AUS_BANK], IM_LEDGER);
    expect(karte.get("b-datei")?.zwillingIstId).toBe("b-bank");
    expect(karte.get("b-bank")?.zwillingUmsatzId).toBe("u-datei");
  });

  it("zählt nur, was wirklich im Ledger steht", () => {
    // Der gemeldete Fall: das Duplikat wurde entfernt, der Umsatz zeigte weiter darauf.
    expect(ledgerVerdacht([AUS_DATEI, AUS_BANK], new Set(["b-datei"])).size).toBe(0);
  });

  it("zählt nur Verbuchtes — ein verworfener Umsatz steht in keinem Saldo", () => {
    const weggelegt = umsatz({ ...AUS_BANK, status: "verworfen", istbuchungId: undefined });
    expect(ledgerVerdacht([AUS_DATEI, weggelegt], IM_LEDGER).size).toBe(0);
  });

  it("schweigt für ein freigegebenes Paar", () => {
    const frei = freigegebenePaare([freigabeAus("u-bank", "u-datei", "2026-08-20T10:00:00.000Z")]);
    expect(ledgerVerdacht([AUS_DATEI, AUS_BANK], IM_LEDGER, frei).size).toBe(0);
  });

  it("hebt die Freigabe nur für DIESES Paar auf, nicht für eine dritte Zeile", () => {
    // „A ist nicht dasselbe wie B" sagt nichts darüber, ob A dasselbe ist wie C.
    const dritte = umsatz({ id: "u-dritt", laufId: "l-dritt", istbuchungId: "b-dritt", rohHash: "h3" });
    const frei = freigegebenePaare([freigabeAus("u-bank", "u-datei", "2026-08-20T10:00:00.000Z")]);
    const karte = ledgerVerdacht(
      [AUS_DATEI, AUS_BANK, dritte],
      new Set(["b-datei", "b-bank", "b-dritt"]),
      frei,
    );
    expect(karte.has("b-dritt")).toBe(true);
    // Und die beiden freigegebenen finden trotzdem ihren dritten Zwilling.
    expect(karte.get("b-datei")?.zwillingUmsatzId).toBe("u-dritt");
  });
});

describe("entwurfVerdacht — ist diese Bankzeile schon bekannt?", () => {
  it("zählt auch Verworfenes mit — anders als im Ledger", () => {
    // Genau hier gehen die beiden Fragen auseinander: „ich habe das schon einmal
    // weggelegt" ist beim Durchsehen die wichtigste Auskunft, im Saldo dagegen irrelevant.
    const weggelegt = umsatz({ ...AUS_BANK, status: "verworfen", istbuchungId: undefined });
    const entwurf = umsatz({ id: "u-neu", laufId: "l-neu", status: "neu", istbuchungId: undefined });
    expect(entwurfVerdacht(entwurf, [weggelegt])?.zwillingUmsatzId).toBe("u-bank");
  });

  it("achtet auf die Freigabe", () => {
    const entwurf = umsatz({ id: "u-neu", laufId: "l-neu", status: "neu", istbuchungId: undefined });
    const frei = freigegebenePaare([freigabeAus("u-neu", "u-bank", "2026-08-20T10:00:00.000Z")]);
    expect(entwurfVerdacht(entwurf, [AUS_BANK], frei)).toBeUndefined();
  });

  it("prüft je Konto getrennt", () => {
    const entwurf = umsatz({ id: "u-neu", laufId: "l-neu", status: "neu", zahlungskontoId: "bar", istbuchungId: undefined });
    expect(entwurfVerdacht(entwurf, [AUS_BANK])).toBeUndefined();
  });
});

describe("stapelVerdacht — der ganze Eingang auf einmal", () => {
  it("vergibt jede Bestandszeile nur einmal", () => {
    // Ohne die 1:1-Regel zeigten beide neuen auf dieselbe alte Zeile, und eine echte
    // Buchung verschwände aus der Anzeige.
    const a = umsatz({ id: "n-a", laufId: "l-neu", status: "neu", istbuchungId: undefined });
    const b = umsatz({ id: "n-b", laufId: "l-neu", status: "neu", istbuchungId: undefined, rohHash: "h9" });
    const karte = stapelVerdacht([a, b], [AUS_BANK]);
    expect(karte.size).toBe(1);
  });

  it("achtet auf die Freigabe", () => {
    const a = umsatz({ id: "n-a", laufId: "l-neu", status: "neu", istbuchungId: undefined });
    const frei = freigegebenePaare([freigabeAus("n-a", "u-bank", "2026-08-20T10:00:00.000Z")]);
    expect(stapelVerdacht([a], [AUS_BANK], frei).size).toBe(0);
  });
});
