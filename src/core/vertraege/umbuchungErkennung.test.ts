// Umbuchungsverträge — erkannt am WEG, nicht am Empfänger.
//
// Der Unterschied zur normalen Vertragserkennung ist der Grund, warum es diese Datei
// gibt: dort wird ein Name mit Unschärfe verglichen, hier ein Kontopaar hart geprüft.

import { describe, expect, it } from "vitest";
import { istUmbuchungsregel, umbuchungsregelFuer } from "./umbuchungErkennung";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import type { Zahlungsspur } from "../buchung/zahlungsspur";

const regel = (over: Partial<Zahlungsregel> = {}): Zahlungsregel => ({
  id: "r1",
  bezeichnung: "Sparrate",
  betrag: -20000,
  rhythmus: "monatlich",
  startdatum: "2026-01-01",
  charakter: "Umschichtung",
  kontoId: "giro",
  gegenkontoId: "tagesgeld",
  vertragId: "v1",
  ...over,
});

const spur = (over: Partial<Zahlungsspur> = {}): Zahlungsspur => ({
  id: "b1",
  datum: "2026-06-01",
  betrag: -20000,
  gegenpartei: "",
  verwendungszweck: "",
  kontoId: "giro",
  gegenkontoId: "tagesgeld",
  charakter: "Umschichtung",
  ...over,
});

describe("istUmbuchungsregel", () => {
  it("verlangt Umschichtung und beide Konten", () => {
    expect(istUmbuchungsregel(regel())).toBe(true);
    expect(istUmbuchungsregel(regel({ charakter: "Aufwand" }))).toBe(false);
    expect(istUmbuchungsregel(regel({ gegenkontoId: undefined }))).toBe(false);
    expect(istUmbuchungsregel(regel({ kontoId: undefined }))).toBe(false);
  });
});

describe("umbuchungsregelFuer", () => {
  it("erkennt die Buchung am Kontopaar", () => {
    expect(umbuchungsregelFuer([regel()], spur())?.id).toBe("r1");
  });

  /**
   * Der Betrag prüft NICHT auf Passung. Wer seine Sparrate erhöht und die Regel nicht
   * nachzieht, soll eine erkannte Umbuchung mit Abweichung sehen — nicht eine
   * unerklärte Umschichtung neben einer Zeile, die als „offen" dasteht.
   */
  it("erkennt sie auch bei stark abweichendem Betrag", () => {
    expect(umbuchungsregelFuer([regel()], spur({ betrag: -95000 }))?.id).toBe("r1");
  });

  it("nimmt nur das abgehende Bein", () => {
    // Beide Beine zuzuordnen hiesse, die Ist-Summe des Vertrags auf null zu bringen:
    // einmal −200, einmal +200, obwohl 200 geflossen sind.
    expect(umbuchungsregelFuer([regel()], spur({ betrag: 20000 }))).toBeUndefined();
  });

  it("greift nicht bei Aufwand oder Ertrag", () => {
    expect(umbuchungsregelFuer([regel()], spur({ charakter: "Aufwand" }))).toBeUndefined();
    expect(umbuchungsregelFuer([regel()], spur({ charakter: "Ertrag", betrag: -1 }))).toBeUndefined();
  });

  it("greift nicht bei anderem Weg", () => {
    expect(umbuchungsregelFuer([regel()], spur({ gegenkontoId: "depot" }))).toBeUndefined();
    expect(umbuchungsregelFuer([regel()], spur({ kontoId: "zweitkonto" }))).toBeUndefined();
  });

  it("greift nicht ohne Gegenkonto an der Buchung", () => {
    // Eine Umschichtung ohne Gegenkonto ist eine halbe Umbuchung — die gibt es seit
    // Migration 63 nicht mehr, aber ein Altbestand darf sie nicht zu einem Vertrag machen.
    expect(umbuchungsregelFuer([regel()], spur({ gegenkontoId: undefined }))).toBeUndefined();
  });

  it("wählt bei mehreren Regeln auf demselben Weg die mit dem nächsten Betrag", () => {
    const klein = regel({ id: "klein", betrag: -5000, vertragId: "v-klein" });
    const gross = regel({ id: "gross", betrag: -50000, vertragId: "v-gross" });
    expect(umbuchungsregelFuer([klein, gross], spur({ betrag: -48000 }))?.id).toBe("gross");
    expect(umbuchungsregelFuer([klein, gross], spur({ betrag: -6000 }))?.id).toBe("klein");
  });
});
