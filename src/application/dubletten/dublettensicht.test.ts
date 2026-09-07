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
  fremdkontoZwilling,
  ledgerVerdacht,
  quellzeilenIndex,
  stapelVerdacht,
} from "./dublettensicht";
import type { Beleg, Umsatz } from "../import";

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

/**
 * Dieselbe Zahlung, aber mit einem Beleg, der seine Quelle und deren Kennung trägt.
 *
 * Ohne Beleg gibt es keinen Quellschlüssel — und damit auch keine Behauptung über ein
 * anderes Konto. Das ist Absicht und wird unten geprüft.
 */
function mitBeleg(u: Umsatz, quelle: string, nativeId: string): Umsatz {
  const b: Beleg = {
    id: u.id, laufId: u.laufId, buchungstag: u.buchungstag, betrag: u.betrag,
    waehrung: u.waehrung, gegenpartei: u.gegenpartei, verwendungszweck: u.verwendungszweck,
    rohHash: u.rohHash, nativeId, quelle, zeitpunkt: "2026-09-07T10:00:00.000Z",
  };
  return { ...u, nativeId, belege: [b] };
}

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

describe("fremdkontoZwilling — dieselbe Quellzeile auf zwei Konten", () => {
  // Die dritte Frage, und die einzige, die die Kontogrenze überschreitet. Sie ist keine
  // Schätzung: die Quelle hat ihre eigene Zeile benannt.
  //
  // Der Anlass steht im Import: der hat diese Prüfung selbst gemacht und den Fund STILL
  // verschluckt — dieselbe Datei auf ein zweites Konto einzulesen legte nichts an. Jetzt
  // legt er an, und der Fund gehört hierher.
  const AUF_GIRO = mitBeleg(
    umsatz({ id: "u-giro", zahlungskontoId: "giro", istbuchungId: "b-giro" }),
    "finanzguru",
    "fg-1",
  );
  const AUF_BAR = mitBeleg(
    umsatz({ id: "u-bar", zahlungskontoId: "bar", istbuchungId: "b-bar", laufId: "l-zweit" }),
    "finanzguru",
    "fg-1",
  );

  it("findet den Zwilling und nennt sein Konto", () => {
    const karte = ledgerVerdacht([AUF_GIRO, AUF_BAR], new Set(["b-giro", "b-bar"]));
    expect(karte.get("b-giro")?.zwillingUmsatzId).toBe("u-bar");
    expect(karte.get("b-giro")?.zwillingKontoId).toBe("bar");
    // Der Befund steht an BEIDEN Zeilen — es gibt kein Original.
    expect(karte.get("b-bar")?.zwillingKontoId).toBe("giro");
  });

  it("schweigt auf DEMSELBEN Konto — dafür sind die beiden anderen Fragen da", () => {
    const zweiteAufGiro = { ...AUF_BAR, zahlungskontoId: "giro" };
    const index = quellzeilenIndex([AUF_GIRO, zweiteAufGiro]);
    expect(fremdkontoZwilling(AUF_GIRO, index)).toBeUndefined();
  });

  it("verlangt DIESELBE Quelle — eine Kennung allein sagt nichts", () => {
    // Zwei Quellen dürfen dieselbe Zeichenkette vergeben, ohne dieselbe Zeile zu meinen.
    const ausBank = mitBeleg({ ...AUF_BAR }, "fints", "fg-1");
    expect(fremdkontoZwilling(AUF_GIRO, quellzeilenIndex([ausBank]))).toBeUndefined();
  });

  it("behauptet nichts ohne Beleg", () => {
    const ohne = umsatz({ id: "u-ohne", zahlungskontoId: "bar", nativeId: "fg-1" });
    expect(fremdkontoZwilling(AUF_GIRO, quellzeilenIndex([ohne]))).toBeUndefined();
  });

  it("achtet auf die Freigabe", () => {
    const frei = freigegebenePaare([freigabeAus("u-giro", "u-bar", "2026-09-07T10:00:00.000Z")]);
    expect(fremdkontoZwilling(AUF_GIRO, quellzeilenIndex([AUF_BAR]), frei)).toBeUndefined();
  });

  it("tritt hinter einen Fund auf dem EIGENEN Konto zurück", () => {
    // Zweimal dasselbe auf einem Konto ist die dringendere Auskunft: dort stimmt schon
    // der Saldo des Kontos nicht.
    const zwillingAufGiro = umsatz({
      id: "u-giro-2", zahlungskontoId: "giro", istbuchungId: "b-giro-2", laufId: "l-dritt",
    });
    const karte = ledgerVerdacht(
      [AUF_GIRO, zwillingAufGiro, AUF_BAR],
      new Set(["b-giro", "b-giro-2", "b-bar"]),
    );
    expect(karte.get("b-giro")?.zwillingUmsatzId).toBe("u-giro-2");
  });

  it("greift auch im Stapel und am einzelnen Entwurf", () => {
    const entwurf = mitBeleg(
      umsatz({ id: "u-neu", laufId: "l-neu", zahlungskontoId: "bar", status: "neu", istbuchungId: undefined }),
      "finanzguru",
      "fg-1",
    );
    expect(stapelVerdacht([entwurf], [AUF_GIRO]).get("u-neu")?.zwillingKontoId).toBe("giro");
    expect(entwurfVerdacht(entwurf, [AUF_GIRO])?.zwillingKontoId).toBe("giro");
  });
});
