import { describe, expect, it } from "vitest";
import { serienDatum, xlsxLesen } from "./xlsx";
import { xlsxAusZeilen } from "../../testwerkzeug/xlsxBauen";

describe("xlsxLesen", () => {
  it("liest Kopf- und Datenzeilen eines Blatts", () => {
    const datei = xlsxAusZeilen([
      ["Buchungstag", "Betrag", "Waehrung"],
      ["46251", "-5.3", "EUR"],
      ["46250", "1234.56", "EUR"],
    ]);
    expect(xlsxLesen(datei)).toEqual([
      ["Buchungstag", "Betrag", "Waehrung"],
      ["46251", "-5.3", "EUR"],
      ["46250", "1234.56", "EUR"],
    ]);
  });

  /**
   * Der teuerste Fehler in einem xlsx-Leser: Excel schreibt leere Zellen GAR NICHT.
   * Wer die Zellen einer Zeile nur abzählt, schiebt ab der Lücke jeden Wert eine Spalte
   * nach links — aus einer IBAN wird ein Verwendungszweck, und auffallen würde es erst
   * an den Daten.
   */
  it("hält die Spalten, wenn eine Zelle fehlt", () => {
    const datei = xlsxAusZeilen([
      ["A", "B", "C", "D"],
      ["1", null, null, "4"],
    ]);
    expect(xlsxLesen(datei)![1]).toEqual(["1", "", "", "4"]);
  });

  it("löst XML-Entities auf", () => {
    const datei = xlsxAusZeilen([["Kategorie"], ["Essen & Trinken"], ['Anführung "x" <y>']]);
    const zeilen = xlsxLesen(datei)!;
    expect(zeilen[1][0]).toBe("Essen & Trinken");
    expect(zeilen[2][0]).toBe('Anführung "x" <y>');
  });

  it("kommt mit Spalten jenseits von Z zurecht", () => {
    const kopf = Array.from({ length: 30 }, (_, i) => `S${i}`);
    const zeilen = xlsxLesen(xlsxAusZeilen([kopf]))!;
    expect(zeilen[0]).toHaveLength(30);
    expect(zeilen[0][29]).toBe("S29"); // Spalte AD
  });

  it("liefert null statt zu werfen, wenn es keine xlsx ist", () => {
    expect(xlsxLesen(new TextEncoder().encode("Buchungstag;Betrag\n1;2"))).toBeNull();
    expect(xlsxLesen(new Uint8Array([]))).toBeNull();
    // ZIP-Signatur, aber Müll dahinter — darf ebenfalls nicht werfen.
    expect(xlsxLesen(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))).toBeNull();
  });
});

describe("serienDatum", () => {
  it("rechnet Excel-Seriennummern in ISO-Daten um", () => {
    // Gegenprobe an echten Werten aus dem Export: 46251 ist der Buchungstag einer
    // Kartenzahlung von Samstag, dem 15.08.2026 — gebucht am Montag darauf.
    expect(serienDatum("46251")).toBe("2026-08-17");
    expect(serienDatum("46251.0")).toBe("2026-08-17");
    expect(serienDatum("44501")).toBe("2021-11-01");
  });

  it("schneidet Tageszeiten ab", () => {
    expect(serienDatum("46251.75")).toBe("2026-08-17");
  });

  it("weist Werte ab, die kein plausibles Datum sind", () => {
    expect(serienDatum("15.08.2026")).toBeNull();
    expect(serienDatum("")).toBeNull();
    expect(serienDatum("0")).toBeNull();
    expect(serienDatum("59")).toBeNull(); // vor dem 1900-Schaltjahr-Bug
    expect(serienDatum("99999999")).toBeNull();
  });
});
