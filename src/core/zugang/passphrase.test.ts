import { describe, expect, it } from "vitest";
import { MINDESTLAENGE, passphrasePruefen } from "./passphrase";

describe("Passphrase prüfen", () => {
  it("nimmt, was lang genug ist", () => {
    expect(passphrasePruefen("vier gewoehnliche Woerter")).toEqual({ taugt: true });
  });

  it("weist zu Kurzes ab und sagt, wie viel fehlt", () => {
    expect(passphrasePruefen("kurz")).toEqual({ taugt: false, grund: "zuKurz", fehlt: MINDESTLAENGE - 4 });
  });

  it("weist reine Leerzeichen ab", () => {
    // Sonst käme man mit der Leertaste durch die Mindestlänge.
    expect(passphrasePruefen("               ")).toEqual({ taugt: false, grund: "nurLeerzeichen" });
  });

  it("zählt Zeichen, nicht Bytes", () => {
    // Zwölf Zeichen, aber mehr Bytes. Für jemanden, der das tippt, ist es ein Wort.
    expect(passphrasePruefen("Straßenbahn€")).toEqual({ taugt: true });
  });

  it("schneidet Leerzeichen NICHT ab", () => {
    // Ein abgeschnittenes Leerzeichen passte beim nächsten Entsperren nicht mehr — und
    // der Nutzer suchte den Fehler bei sich.
    expect(passphrasePruefen("  zehn Zeic  ")).toEqual({ taugt: true });
  });

  it("hat kein Maximum", () => {
    expect(passphrasePruefen("x".repeat(500))).toEqual({ taugt: true });
  });

  it("verlangt keine Zeichenklassen", () => {
    // Genau der Punkt: `Passwort1!` ist das Ergebnis von Regeln, nicht von Sicherheit.
    expect(passphrasePruefen("nur kleine buchstaben")).toEqual({ taugt: true });
  });
});
