import { describe, expect, it } from "vitest";
import { nachRang, rang, zusammenfuehren, type Beleg } from "./belege";

/** Ein Beleg mit dem Nötigsten; alles Weitere je Testfall dazu. */
function beleg(teil: Partial<Beleg> & Pick<Beleg, "id" | "quelle">): Beleg {
  return {
    laufId: `lauf-${teil.id}`,
    zeitpunkt: "2026-09-01T10:00:00.000Z",
    buchungstag: "2026-03-14",
    betrag: -4210,
    waehrung: "EUR",
    gegenpartei: "Kesselmann",
    verwendungszweck: "Rechnung",
    rohHash: `hash-${teil.id}`,
    ...teil,
  } as Beleg;
}

const CAMT = { quelle: "fints", format: "CAMT" };
const MT940 = { quelle: "fints", format: "MT940" };
const FREMD = { quelle: "finanzguru" };

describe("rang", () => {
  it("stellt die Bank vor die Fremdsoftware und CAMT vor MT940", () => {
    // Die Bank ist die QUELLE der Zahlung, eine Fremdsoftware erzählt sie nach. Und CAMT
    // trägt den Empfängernamen vollständig, MT940 schneidet bei 27 Zeichen ab.
    expect(rang(CAMT)).toBeLessThan(rang(MT940));
    expect(rang(MT940)).toBeLessThan(rang(FREMD));
  });
});

describe("nachRang", () => {
  it("lässt bei Gleichrang den jüngeren Lauf gewinnen", () => {
    // Er hat den späteren Stand der Quelle gesehen.
    const alt = beleg({ id: "a", ...CAMT, zeitpunkt: "2026-01-01T00:00:00.000Z" });
    const neu = beleg({ id: "b", ...CAMT, zeitpunkt: "2026-09-01T00:00:00.000Z" });
    expect(nachRang([alt, neu]).map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("ordnet auch bei gleichem Zeitpunkt bestimmt", () => {
    // Welcher gewinnt, ist dann beliebig — aber dieselbe Eingabe muss morgen dieselbe
    // Ausgabe ergeben, sonst wechselt eine Anzeige ohne Anlass ihren Inhalt.
    const x = beleg({ id: "x", ...CAMT });
    const y = beleg({ id: "y", ...CAMT });
    expect(nachRang([x, y]).map((b) => b.id)).toEqual(nachRang([y, x]).map((b) => b.id));
  });
});

describe("zusammenfuehren", () => {
  it("nimmt den ersten Wert in der Rangfolge", () => {
    // Der Fall, um den es überhaupt geht: MT940 hat den Namen bei 27 Zeichen
    // abgeschnitten, CAMT hat ihn ganz.
    const felder = zusammenfuehren(
      [
        beleg({ id: "f", ...FREMD, gegenpartei: "Vibora" }),
        beleg({ id: "c", ...CAMT, gegenpartei: "Vibora Handelsgesellschaft mbH" }),
      ],
      "f",
    );
    expect(felder.gegenpartei).toBe("Vibora Handelsgesellschaft mbH");
  });

  it("nimmt jedes Feld von dem, der es überhaupt hat", () => {
    // Die häufigste Lage, und die ohne jeden Konflikt: `zweckCode` liefert nur die Bank,
    // die native Id nur die Fremdsoftware. Beide sollen ankommen.
    const felder = zusammenfuehren(
      [
        beleg({ id: "f", ...FREMD, nativeId: "fg-9" }),
        beleg({ id: "c", ...CAMT, zweckCode: "SALA" }),
      ],
      "f",
    );
    expect(felder.zweckCode).toBe("SALA");
    expect(felder.nativeId).toBe("fg-9");
  });

  /**
   * Der Kern der Sache. Die drei Felder sind nur zusammen mit dem Format ihres Laufs
   * deutbar; feldweise gefüllt stünden hier zwei Vokabulare nebeneinander, ohne dass man
   * ihnen ansieht, welches.
   */
  it("nimmt die Formatgruppe geschlossen aus EINEM Beleg", () => {
    const felder = zusammenfuehren(
      [
        beleg({ id: "f", ...FREMD, umsatzart: "Analyse-Einordnung", buchungsschluessel: "77" }),
        beleg({ id: "c", ...CAMT, umsatzart: "SEPA-Gutschrift", bankBuchungscode: "NTRF+166" }),
      ],
      "f",
    );
    expect(felder.umsatzart).toBe("SEPA-Gutschrift");
    expect(felder.bankBuchungscode).toBe("NTRF+166");
    // Und NICHT die 77 aus dem Finanzguru-Beleg, obwohl der CAMT-Beleg hier nichts hat:
    // die Gruppe kommt aus einem Beleg oder aus keinem.
    expect(felder.buchungsschluessel).toBeUndefined();
  });

  it("lässt die Formatgruppe leer, wenn kein Beleg etwas davon trägt", () => {
    const felder = zusammenfuehren([beleg({ id: "c", ...CAMT })], "c");
    expect(felder.umsatzart).toBeUndefined();
    expect(felder.buchungsschluessel).toBeUndefined();
    expect(felder.bankBuchungscode).toBeUndefined();
  });

  /**
   * Herkunft ist nicht Inhalt. `laufId` gruppiert die Dublettenanzeige nach Läufen, und
   * der Hash ist der Schlüssel, unter dem die Zeile seinerzeit gebucht wurde — wanderten
   * sie mit dem Rang, änderte ein späterer Abruf rückwirkend die Herkunft einer Zahlung.
   */
  it("nimmt Id, Lauf und Hash vom namengebenden Beleg, nicht vom stärksten", () => {
    const felder = zusammenfuehren(
      [
        beleg({ id: "f", ...FREMD, laufId: "lauf-datei", rohHash: "hash-datei" }),
        beleg({ id: "c", ...CAMT, laufId: "lauf-bank", rohHash: "hash-bank" }),
      ],
      "f",
    );
    expect(felder.id).toBe("f");
    expect(felder.laufId).toBe("lauf-datei");
    expect(felder.rohHash).toBe("hash-datei");
  });

  it("trägt die Belegherkunft nicht in die Zahlung", () => {
    // Quelle, Format und Zeitpunkt gehören dem einzelnen Beleg. In der zusammengeführten
    // Zahlung wären sie eine Behauptung über etwas, das aus mehreren Quellen besteht.
    const felder = zusammenfuehren([beleg({ id: "c", ...CAMT })], "c") as Record<string, unknown>;
    expect(felder.quelle).toBeUndefined();
    expect(felder.format).toBeUndefined();
    expect(felder.zeitpunkt).toBeUndefined();
  });

  it("weist eine Zahlung ohne Beleg ab", () => {
    // Die gibt es nicht — und ein stilles leeres Ergebnis wäre eine Zahlung ohne Betrag.
    expect(() => zusammenfuehren([], "x")).toThrow(/ohne Beleg/);
  });
});
