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
   * Der Betrag MUSS passen (seit 2026-11-25). Zwischen zwei eigenen Konten wird auch
   * ohne Vertrag verschoben, und jede solche Buchung landete sonst beim Vertrag, nur
   * weil sie denselben Weg nahm.
   */
  it("greift nicht bei abweichendem Betrag — auch nicht bei einem knapp daneben", () => {
    expect(umbuchungsregelFuer([regel()], spur({ betrag: -95000 }))).toBeUndefined();
    expect(umbuchungsregelFuer([regel()], spur({ betrag: -20001 }))).toBeUndefined();
  });

  it("verlangt den Termin: wenige Tage neben der Fälligkeit ja, mitten im Monat nein", () => {
    expect(umbuchungsregelFuer([regel()], spur({ datum: "2026-06-04" }))?.id).toBe("r1");
    // Vor dem Ersten gebucht, weil der Erste auf ein Wochenende fiel.
    expect(umbuchungsregelFuer([regel()], spur({ datum: "2026-05-29" }))?.id).toBe("r1");
    expect(umbuchungsregelFuer([regel()], spur({ datum: "2026-06-15" }))).toBeUndefined();
  });

  it("findet auch Umbuchungen vor der ersten Fälligkeit, wenn sie im Takt liegen", () => {
    // Der Vertrag wird oft erst erfasst, wenn der Dauerauftrag längst läuft.
    expect(umbuchungsregelFuer([regel()], spur({ datum: "2025-09-02" }))?.id).toBe("r1");
    expect(umbuchungsregelFuer([regel()], spur({ datum: "2025-09-16" }))).toBeUndefined();
  });

  it("greift nicht mehr nach dem Ende des Vertrags", () => {
    const beendet = regel({ vertragsende: "2026-04-30" });
    expect(umbuchungsregelFuer([beendet], spur({ datum: "2026-04-01" }))?.id).toBe("r1");
    expect(umbuchungsregelFuer([beendet], spur({ datum: "2026-06-01" }))).toBeUndefined();
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

  it("trennt zwei Regeln auf demselben Weg am Betrag, bei gleichem Betrag am Termin", () => {
    const klein = regel({ id: "klein", betrag: -5000, vertragId: "v-klein" });
    const gross = regel({ id: "gross", betrag: -50000, vertragId: "v-gross" });
    expect(umbuchungsregelFuer([klein, gross], spur({ betrag: -50000 }))?.id).toBe("gross");
    expect(umbuchungsregelFuer([klein, gross], spur({ betrag: -5000 }))?.id).toBe("klein");
    expect(umbuchungsregelFuer([klein, gross], spur({ betrag: -48000 }))).toBeUndefined();

    const anfang = regel({ id: "anfang", vertragId: "v-anfang" });
    const mitte = regel({ id: "mitte", startdatum: "2026-01-04", vertragId: "v-mitte" });
    expect(umbuchungsregelFuer([anfang, mitte], spur({ datum: "2026-06-01" }))?.id).toBe("anfang");
    expect(umbuchungsregelFuer([anfang, mitte], spur({ datum: "2026-06-04" }))?.id).toBe("mitte");
  });
});
