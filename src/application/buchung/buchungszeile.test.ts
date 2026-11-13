// Die eine Form einer Buchung in einer Liste — und die eine Regel für ihren Namen.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../../core";
import type { Umsatz } from "../import/umsatz";
import { buchungsname, buchungszeile, type Zeilenkontext } from "./buchungszeile";

const beleg = (felder: Partial<Umsatz>) => ({ gegenpartei: "", verwendungszweck: "", ...felder }) as Umsatz;

describe("buchungsname", () => {
  it("nimmt die eigene Notiz vor dem Empfänger", () => {
    expect(buchungsname("Wocheneinkauf", beleg({ gegenpartei: "Talmer Markt" }))).toBe("Wocheneinkauf");
  });

  it("fällt ohne Notiz auf den Empfänger zurück", () => {
    expect(buchungsname(undefined, beleg({ gegenpartei: "Talmer Markt" }))).toBe("Talmer Markt");
  });

  it("nimmt den Verwendungszweck, wenn die Bank keinen Empfänger liefert", () => {
    expect(buchungsname("", beleg({ verwendungszweck: "Beleg 4711" }))).toBe("Beleg 4711");
  });

  it("bleibt leer, wenn nichts da ist — die Kategorie ist kein Name", () => {
    expect(buchungsname(undefined, undefined)).toBe("");
  });
});

describe("buchungszeile", () => {
  const buchung = {
    id: "b1", datum: "2026-10-03", betrag: -5000, kontoId: "k1",
    kategorieId: "kat-a", charakter: "Aufwand", quelle: "import",
  } as IstBuchung;
  const kontext: Zeilenkontext = {
    umsatzZuBuchung: new Map([["b1", beleg({ gegenpartei: "Halvern", verwendungszweck: "Rate 10" })]]),
    kontoNamen: new Map([["k1", "Girokonto"]]),
    kategorieNamen: new Map([["kat-b", "Freizeit"]]),
    vertragsnamen: new Map([["b1", "Halvern"]]),
  };

  it("trägt den Betrag DIESER Auswertung und die Kategorie DES ANTEILS", () => {
    // Ein Anteil einer geteilten Buchung: −20 von −50, in einer anderen Kategorie als die
    // Buchung selbst.
    const z = buchungszeile(buchung, -2000, "kat-b", kontext);
    expect(z.betrag).toBe(-2000);
    expect(z.kategorieName).toBe("Freizeit");
  });

  it("holt Name, Zweck, Konto und Vertrag aus dem Kontext", () => {
    const z = buchungszeile(buchung, -5000, undefined, kontext);
    expect(z).toMatchObject({
      name: "Halvern",
      verwendungszweck: "Rate 10",
      kontoName: "Girokonto",
      vertragsname: "Halvern",
      kategorieName: "",
    });
  });
});
