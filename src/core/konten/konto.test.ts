// Die Kontoarten, die Kontoklassen — und die Grenze dazwischen.
//
// Der Typ sagt, WAS ein Konto ist. Die Klasse sagt, WOFÜR es da ist, und daraus folgt die
// einzige Rechnung, die daran hängt: ob sein Saldo zu den liquiden Mitteln zählt. Beides
// zu vermengen wäre naheliegend und falsch — dasselbe Tagesgeldkonto kann Alltagsreserve
// oder zweckgebundene Rücklage sein, ohne dass sich sein Typ ändert.

import { describe, expect, it } from "vitest";
import {
  KONTOKLASSEN,
  KONTOTYPEN,
  istLiquide,
  klasseVorschlag,
  liquideMittel,
  type Zahlungskonto,
} from "./konto";

function konto(over: Partial<Zahlungskonto> = {}): Zahlungskonto {
  return { id: "k1", bezeichnung: "Konto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0, ...over };
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

describe("Kontoklassen", () => {
  it("bietet jede Klasse genau einmal", () => {
    expect(new Set(KONTOKLASSEN).size).toBe(KONTOKLASSEN.length);
  });

  it("hält allein die Klasse liquide für verfügbar", () => {
    // Die einzige Wirkung, die die Klasse heute hat. Rücklage und Vorsorge trennt bislang
    // nur der Name — was sie sonst unterscheiden soll, ist offen.
    expect(istLiquide({ klasse: "liquide" })).toBe(true);
    expect(istLiquide({ klasse: "ruecklage" })).toBe(false);
    expect(istLiquide({ klasse: "vorsorge" })).toBe(false);
  });

  it("schlägt für ein Depot etwas anderes vor als für die übrigen Arten", () => {
    // Nur ein Vorschlag: ein Tagesgeldkonto ist mal Reserve, mal zweckgebundene Rücklage,
    // und das weiß nur der, dem es gehört.
    expect(klasseVorschlag("Depot")).toBe("vorsorge");
    expect(klasseVorschlag("Giro")).toBe("liquide");
    expect(klasseVorschlag("Tagesgeld")).toBe("liquide");
  });
});

describe("liquideMittel", () => {
  it("summiert die verfügbaren Kontostände", () => {
    expect(liquideMittel([konto({ saldo: 120_00 }), konto({ id: "k2", saldo: 80_00 })])).toBe(200_00);
  });

  it("lässt Rücklage und Vorsorge draußen", () => {
    // Bis 2026-08-21 summierte diese Funktion alle Salden ohne Unterschied, und ein Depot
    // zählte als Bargeld.
    const summe = liquideMittel([
      konto({ saldo: 100_00 }),
      konto({ id: "k2", klasse: "ruecklage", saldo: 50_00 }),
      konto({ id: "k3", typ: "Depot", klasse: "vorsorge", saldo: 900_00 }),
    ]);
    expect(summe).toBe(100_00);
  });

  it("richtet sich nach der Klasse, nicht nach dem Typ", () => {
    // Ein Depot, das der Nutzer ausdrücklich als verfügbar führt, zählt mit. Der Typ ist
    // ein Etikett; die Aussage über Verfügbarkeit trifft die Klasse.
    expect(liquideMittel([konto({ typ: "Depot", klasse: "liquide", saldo: 42_00 })])).toBe(42_00);
  });

  it("ist ohne Konten null", () => {
    expect(liquideMittel([])).toBe(0);
  });
});
