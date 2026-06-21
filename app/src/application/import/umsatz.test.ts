import { describe, expect, it } from "vitest";
import { FachlicherFehler } from "../../core";
import { alsDuplikat, kategorisieren, verbuchen, verwerfen, type Umsatz } from "./umsatz";

function basis(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1",
    laufId: "l1",
    zahlungskontoId: "k1",
    buchungstag: "2022-01-01",
    betrag: -655,
    waehrung: "EUR",
    gegenpartei: "Trinkgut",
    verwendungszweck: "Kartenzahlung",
    rohHash: "k1|2022-01-01|-655|kartenzahlung",
    nativeId: "abc",
    status: "neu",
    ...over,
  };
}

describe("Umsatz — Statusmaschine", () => {
  it("kategorisieren setzt den Vorschlag im Status neu", () => {
    const u = kategorisieren(basis(), { kategorieId: "kat1", charakter: "Aufwand", quelle: "remapping" });
    expect(u.vorschlag).toEqual({ kategorieId: "kat1", charakter: "Aufwand", quelle: "remapping" });
    expect(u.status).toBe("neu");
  });

  it("verbuchen führt neu → verbucht und verknüpft die Ist-Buchung", () => {
    const u = verbuchen(basis(), "ist-99");
    expect(u.status).toBe("verbucht");
    expect(u.istbuchungId).toBe("ist-99");
  });

  it("verbuchen ohne Ist-Buchungs-ID ist ein Verstoß (Invariante verbucht ⇒ istbuchungId)", () => {
    expect(() => verbuchen(basis(), "")).toThrow(FachlicherFehler);
  });

  it("alsDuplikat und verwerfen sind terminal — danach geht keine Transition mehr", () => {
    const dup = alsDuplikat(basis());
    expect(dup.status).toBe("duplikat");
    expect(() => verbuchen(dup, "x")).toThrow(FachlicherFehler);
    expect(() => kategorisieren(dup, { charakter: "Aufwand", quelle: "manuell" })).toThrow(FachlicherFehler);

    const weg = verwerfen(basis());
    expect(weg.status).toBe("verworfen");
    expect(() => verbuchen(weg, "x")).toThrow(FachlicherFehler);
  });

  it("ein verbuchter Umsatz lässt sich nicht erneut verbuchen", () => {
    const u = verbuchen(basis(), "ist-1");
    expect(() => verbuchen(u, "ist-2")).toThrow(FachlicherFehler);
  });
});
