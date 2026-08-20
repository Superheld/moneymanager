// Die Kontoarten und was sie bedeuten.
//
// Der Test hält vor allem EINE Entscheidung fest, die man sonst für einen Fehler halten
// würde: ein Konto vom Typ „Depot" zählt zu den liquiden Mitteln. Der Grund steht bei
// `Kontotyp` — es ist ein selbst geführtes Konto und nicht die `depot`-Entität, die aus
// dem Bankabruf kommt.

import { describe, expect, it } from "vitest";
import { KONTOTYPEN, liquideMittel, type Zahlungskonto } from "./konto";

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Konto", typ: "Giro", inhaberIds: [], saldo: 0, ...over };
}

describe("Kontoarten", () => {
  it("bietet Depot als Art an", () => {
    // Zum Markieren eines bestehenden Kontos. Der Abruf legt darüber KEINE Konten an —
    // was die Bank als Depot meldet, landet in der `depot`-Entität.
    expect(KONTOTYPEN).toContain("Depot");
  });

  it("bietet jede Art genau einmal", () => {
    expect(new Set(KONTOTYPEN).size).toBe(KONTOTYPEN.length);
  });
});

describe("liquideMittel", () => {
  it("summiert die Kontostände", () => {
    expect(liquideMittel([konto({ saldo: 120_00 }), konto({ id: "k2", saldo: 80_00 })])).toBe(200_00);
  });

  it("nimmt ein Konto vom Typ Depot NICHT aus", () => {
    // Sieht nach einem Fehler aus, ist keiner: `istMonatsverlauf` bildet den Sockel aus
    // dieser Summe und lässt danach alle Buchungen darüberlaufen. Nähme man den Sockel
    // heraus und die Buchungen nicht, ergäbe der Verlauf einen Saldo, den es nie gab.
    //
    // Nicht zu verwechseln mit der `depot`-Entität aus dem Bankabruf: die hat gar keinen
    // Saldo und kommt hier nie vorbei.
    const summe = liquideMittel([konto({ saldo: 100_00 }), konto({ id: "k2", typ: "Depot", saldo: 50_00 })]);
    expect(summe).toBe(150_00);
  });

  it("ist ohne Konten null", () => {
    expect(liquideMittel([])).toBe(0);
  });
});
