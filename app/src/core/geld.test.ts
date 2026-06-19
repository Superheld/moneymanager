import { describe, it, expect } from "vitest";
import {
  euroZuCent,
  formatBetrag,
  geldFormatieren,
  geldFormatierenMitSymbol,
  majorZuMinor,
  minorZuMajor,
  parseBetrag,
} from "./geld";
import { STANDARD_WAEHRUNG, waehrungNachCode, type Waehrung } from "./waehrung";

const EUR = STANDARD_WAEHRUNG; // skala 2
const JPY: Waehrung = { code: "JPY", skala: 0 };
const KWD: Waehrung = { code: "KWD", skala: 3 };

describe("majorZuMinor / minorZuMajor — Skala je Währung", () => {
  it("EUR (Skala 2): 120,5 → 12050 und zurück", () => {
    expect(majorZuMinor(120.5, EUR)).toBe(12050);
    expect(minorZuMajor(12050, EUR)).toBe(120.5);
  });
  it("JPY (Skala 0): keine Untereinheit, 1200 → 1200", () => {
    expect(majorZuMinor(1200, JPY)).toBe(1200);
    expect(minorZuMajor(1200, JPY)).toBe(1200);
  });
  it("KWD (Skala 3): 1,234 → 1234", () => {
    expect(majorZuMinor(1.234, KWD)).toBe(1234);
    expect(minorZuMajor(1234, KWD)).toBe(1.234);
  });
  it("rundet auf die kleinste Einheit", () => {
    expect(majorZuMinor(1.236, EUR)).toBe(124); // 123,6 → 124
    expect(majorZuMinor(1.234, EUR)).toBe(123); // 123,4 → 123
  });
});

describe("geldFormatieren — Locale + Skala, ohne Symbol", () => {
  it("de-DE EUR: Tausenderpunkt, Komma, U+2212-Minus", () => {
    expect(geldFormatieren(1234567, { waehrung: EUR, locale: "de-DE" })).toBe("12.345,67");
    expect(geldFormatieren(-500, { waehrung: EUR, locale: "de-DE" })).toBe("−" + "5,00");
  });
  it("en-US EUR: Tausenderkomma, Punkt", () => {
    expect(geldFormatieren(1234567, { waehrung: EUR, locale: "en-US" })).toBe("12,345.67");
  });
  it("JPY: keine Nachkommastellen", () => {
    expect(geldFormatieren(1200, { waehrung: JPY, locale: "de-DE" })).toBe("1.200");
  });
  it("KWD: drei Nachkommastellen", () => {
    expect(geldFormatieren(1234, { waehrung: KWD, locale: "de-DE" })).toBe("1,234");
  });
  it("mitVorzeichen setzt + bei positiven Beträgen", () => {
    expect(geldFormatieren(500, { waehrung: EUR, mitVorzeichen: true })).toBe("+5,00");
  });
});

describe("geldFormatierenMitSymbol", () => {
  it("hängt das Währungssymbol per Intl an (de-DE EUR)", () => {
    const s = geldFormatierenMitSymbol(12050, { waehrung: EUR, locale: "de-DE" });
    expect(s).toContain("€");
    expect(s).toContain("120,50");
  });
  it("negativ → U+2212 vorangestellt", () => {
    expect(geldFormatierenMitSymbol(-100, { waehrung: EUR, locale: "de-DE" }).startsWith("−")).toBe(true);
  });
});

describe("parseBetrag — rechtester Trenner ist Dezimaltrenner", () => {
  it("deutsche Eingabe 1.234,56 → 123456 (EUR)", () => {
    expect(parseBetrag("1.234,56", EUR)).toBe(123456);
  });
  it("englische Eingabe 1,234.56 → 123456 (EUR)", () => {
    expect(parseBetrag("1,234.56", EUR)).toBe(123456);
  });
  it("einfache Eingaben 12,5 und 12.5 → 1250", () => {
    expect(parseBetrag("12,5", EUR)).toBe(1250);
    expect(parseBetrag("12.5", EUR)).toBe(1250);
  });
  it("ganze Zahl ohne Trenner", () => {
    expect(parseBetrag("350", EUR)).toBe(35000);
  });
  it("negativ", () => {
    expect(parseBetrag("-7,50", EUR)).toBe(-750);
  });
  it("JPY: kein Nachkomma-Faktor", () => {
    expect(parseBetrag("1200", JPY)).toBe(1200);
  });
  it("ignoriert Symbole und Leerzeichen", () => {
    expect(parseBetrag("  1.000,00 € ", EUR)).toBe(100000);
  });
  it("leere/unparsebare Eingabe → null", () => {
    expect(parseBetrag("", EUR)).toBeNull();
    expect(parseBetrag("   ", EUR)).toBeNull();
    expect(parseBetrag("abc", EUR)).toBeNull();
  });
});

describe("EUR-Back-compat-Shims bleiben EUR/de-DE", () => {
  it("euroZuCent / centZuEuro", () => {
    expect(euroZuCent(120.5)).toBe(12050);
    expect(centZuEuroRoundtrip()).toBe(120.5);
  });
  it("formatBetrag wie bisher (de-DE, U+2212, ohne Symbol)", () => {
    expect(formatBetrag(1234567)).toBe("12.345,67");
    expect(formatBetrag(-500)).toBe("−" + "5,00");
    expect(formatBetrag(500, true)).toBe("+5,00");
  });
});

function centZuEuroRoundtrip(): number {
  return minorZuMajor(euroZuCent(120.5), STANDARD_WAEHRUNG);
}

describe("waehrungNachCode", () => {
  it("findet bekannte Währung", () => {
    expect(waehrungNachCode("JPY")).toEqual({ code: "JPY", skala: 0 });
  });
  it("unbekannter Code → konservativ Skala 2", () => {
    expect(waehrungNachCode("XAU")).toEqual({ code: "XAU", skala: 2 });
  });
});
