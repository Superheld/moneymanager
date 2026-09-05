import { describe, expect, it } from "vitest";
import { vormerkungslast, type Vormerkung } from "./vormerkung";

const v = (over: Partial<Vormerkung> = {}): Vormerkung => ({
  id: "v1",
  zahlungskontoId: "k1",
  betrag: -2500,
  waehrung: "EUR",
  gegenpartei: "Kesselmann",
  verwendungszweck: "",
  erfasstAm: "2026-09-05T20:00:00.000Z",
  ...over,
});

describe("vormerkungslast", () => {
  it("summiert, was noch abgeht", () => {
    const last = vormerkungslast([v({ betrag: -2500 }), v({ id: "v2", betrag: -1000 })]);
    expect(last).toEqual({ betrag: -3500, anzahl: 2 });
  });

  /**
   * `INFO` heisst: die Bank wird diese Zeile NICHT buchen. Sie mitzurechnen zoege Geld
   * ab, das nie abgeht — und der Fehler faellt nicht auf, weil die Vorschau danach
   * lediglich vorsichtiger aussieht.
   */
  it("laesst aus, was die Bank gar nicht buchen wird", () => {
    const last = vormerkungslast([v({ betrag: -2500 }), v({ id: "v2", betrag: -9900, buchungsstand: "INFO" })]);
    expect(last).toEqual({ betrag: -2500, anzahl: 1 });
  });

  it("kommt mit einer leeren Liste klar", () => {
    expect(vormerkungslast([])).toEqual({ betrag: 0, anzahl: 0 });
  });

  it("rechnet einen Zufluss als Zufluss", () => {
    // Eine Gutschrift kann ebenso vorgemerkt sein. Das Vorzeichen traegt sie selbst.
    expect(vormerkungslast([v({ betrag: 5000 })]).betrag).toBe(5000);
  });
});
