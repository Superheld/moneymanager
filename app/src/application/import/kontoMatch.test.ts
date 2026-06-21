import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";
import { kontoMatchVorschlag, typAusName } from "./kontoMatch";

function roh(over: Partial<RohUmsatz>): RohUmsatz {
  return {
    buchungstag: "2022-01-01", betrag: -1, waehrung: "EUR", gegenpartei: "x",
    verwendungszweck: "y", istUmbuchung: false, quelle: "finanzguru", ...over,
  };
}

describe("typAusName", () => {
  it("rät den Kontotyp aus dem Quell-Namen", () => {
    expect(typAusName("Girokonto")).toBe("Giro");
    expect(typAusName("Tagesgeldkonto")).toBe("Tagesgeld");
    expect(typAusName("Bargeld")).toBe("Bargeld");
    expect(typAusName("Kreditkarte GenialCard")).toBe("Kreditkarte");
    expect(typAusName("Verrechnungskonto")).toBe("Giro");
    expect(typAusName(undefined)).toBe("Giro");
  });
});

describe("kontoMatchVorschlag", () => {
  const giro: Zahlungskonto = {
    id: "k-giro", bezeichnung: "Mein Giro", typ: "Giro",
    iban: "DE61 2004 1144 0690 6028 00", inhaberIds: [], saldo: 0,
  };

  it("verknüpft per IBAN mit bestehendem Konto (Normalisierung greift)", () => {
    const matches = kontoMatchVorschlag(
      [roh({ kontoIban: "DE61200411440690602800", kontoName: "Girokonto" })],
      [giro],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].kontoId).toBe("k-giro");
    expect(matches[0].neu).toBeUndefined();
    expect(matches[0].anzahl).toBe(1);
  });

  it("schlägt fehlende Konten zum Anlegen vor — mit geratenem Typ und gültiger IBAN", () => {
    const matches = kontoMatchVorschlag(
      [
        roh({ kontoIban: "DE89370400440532013000", kontoName: "Tagesgeldkonto" }),
        roh({ kontoIban: "DE89370400440532013000", kontoName: "Tagesgeldkonto" }),
        roh({ kontoIban: "562dabc5b2", kontoName: "Bargeld" }),
      ],
      [],
    );
    const tagesgeld = matches.find((m) => m.quelleName === "Tagesgeldkonto")!;
    expect(tagesgeld.anzahl).toBe(2);
    expect(tagesgeld.neu).toEqual({ bezeichnung: "Tagesgeldkonto", typ: "Tagesgeld", iban: "DE89370400440532013000" });

    const bargeld = matches.find((m) => m.quelleName === "Bargeld")!;
    expect(bargeld.neu?.typ).toBe("Bargeld");
    expect(bargeld.neu?.iban).toBeUndefined(); // kein gültiger IBAN-Schlüssel
  });
});
