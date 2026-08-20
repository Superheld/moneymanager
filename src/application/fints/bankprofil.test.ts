import { describe, expect, it } from "vitest";
import type { Bankprofil } from "./abrufPort";
import {
  abruffenster,
  alleKontenAmStueck,
  erstabrufTage,
  kannVorfall,
  kontoKannVorfall,
  speicherzeitraumJeFormat,
  speicherzeitraumTage,
} from "./bankprofil";

function profil(over: Partial<Bankprofil> = {}): Bankprofil {
  return {
    standAm: "2026-08-20",
    tanVerfahren: [],
    vorfaelle: [],
    kontoVorfaelle: {},
    ...over,
  };
}

describe("speicherzeitraumTage", () => {
  it("nimmt das Maximum über die Formate, nicht das Minimum", () => {
    // Wer 540 Tage über CAMT bekommen kann, soll nicht auf die 90 von MT940 gedeckelt
    // werden: der eine Fehler ist sichtbar (leere Tage), der andere nicht (nie geholte
    // Monate).
    const p = profil({
      vorfaelle: [
        { segment: "HKCAZ", speicherzeitraumTage: 540 },
        { segment: "HKKAZ", speicherzeitraumTage: 90 },
      ],
    });
    expect(speicherzeitraumTage(p)).toBe(540);
  });

  it("ist unbekannt, wenn die Bank zu keinem Format etwas sagt", () => {
    expect(speicherzeitraumTage(profil({ vorfaelle: [{ segment: "HKKAZ" }] }))).toBeUndefined();
  });

  it("wertet eine gemeldete Null nicht als Grenze", () => {
    // Eine Null wäre „diese Bank hält nichts vor" — das gibt es nicht, das ist ein
    // ungesetztes Feld. Als Grenze genommen hätte sie den Abruf abgeschaltet.
    const p = profil({ vorfaelle: [{ segment: "HKKAZ", speicherzeitraumTage: 0 }] });
    expect(speicherzeitraumTage(p)).toBeUndefined();
  });

  it("schlüsselt für die Anzeige nach Format auf", () => {
    const p = profil({
      vorfaelle: [
        { segment: "HKCAZ", speicherzeitraumTage: 540 },
        { segment: "HKKAZ", speicherzeitraumTage: 90 },
        { segment: "HKSAL" },
      ],
    });
    expect(speicherzeitraumJeFormat(p)).toEqual([
      { segment: "HKCAZ", tage: 540 },
      { segment: "HKKAZ", tage: 90 },
    ]);
  });
});

describe("abruffenster", () => {
  const p = profil({ vorfaelle: [{ segment: "HKKAZ", speicherzeitraumTage: 540 }] });

  it("lässt einen Wunsch innerhalb der Grenze stehen", () => {
    expect(abruffenster(p, 30)).toEqual({ tage: 30, gedeckelt: false, grenze: 540 });
  });

  it("deckelt und sagt es", () => {
    expect(abruffenster(p, 720)).toEqual({ tage: 540, gedeckelt: true, grenze: 540 });
  });

  it("lässt den Wunsch stehen, wo die Bank nichts gesagt hat", () => {
    expect(abruffenster(profil(), 720)).toEqual({ tage: 720, gedeckelt: false });
    expect(abruffenster(undefined, 720)).toEqual({ tage: 720, gedeckelt: false });
  });
});

describe("erstabrufTage", () => {
  it("holt, was die Bank vorhält", () => {
    const p = profil({ vorfaelle: [{ segment: "HKKAZ", speicherzeitraumTage: 540 }] });
    expect(erstabrufTage(p, 30)).toBe(540);
  });

  it("unterschreitet die Vorgabe nicht", () => {
    // Eine Bank mit kurzem Speicherzeitraum soll den Erstabruf nicht kleiner machen als
    // er ohne sie wäre — mehr als sie hat, liefert sie ohnehin nicht.
    const p = profil({ vorfaelle: [{ segment: "HKKAZ", speicherzeitraumTage: 7 }] });
    expect(erstabrufTage(p, 30)).toBe(30);
  });

  it("bleibt bei der Vorgabe, wo nichts gesagt wurde", () => {
    expect(erstabrufTage(profil(), 30)).toBe(30);
    expect(erstabrufTage(undefined, 30)).toBe(30);
  });
});

describe("Fähigkeiten", () => {
  it("kennt die Vorfälle der Bank", () => {
    const p = profil({ vorfaelle: [{ segment: "HKWPD", version: 6 }] });
    expect(kannVorfall(p, "HKWPD")).toBe(true);
    expect(kannVorfall(p, "DKKKU")).toBe(false);
  });

  it("unterscheidet die Freigabe je Konto von der Fähigkeit der Bank", () => {
    // Ein Depot kann Umsätze verweigern und Bestände liefern; die Bank als Ganzes kann
    // beides. Wer nur die Bank fragt, ruft für das falsche Konto ab.
    const p = profil({
      vorfaelle: [{ segment: "HKWPD" }, { segment: "HKKAZ" }],
      kontoVorfaelle: { "1|Depot": ["HKWPD"], "1|Giro": ["HKKAZ", "HKSAL"] },
    });
    expect(kontoKannVorfall(p, "1|Depot", "HKWPD")).toBe(true);
    expect(kontoKannVorfall(p, "1|Depot", "HKKAZ")).toBe(false);
    expect(kontoKannVorfall(p, "1|Unbekannt", "HKKAZ")).toBe(false);
  });

  it("erlaubt den Sammelabruf nur, wenn BEIDE Umsatzwege ihn erlauben", () => {
    // Sonst hinge am Rückfall auf MT940 ein zweiter, anders geschnittener Auftrag.
    const beide = profil({
      vorfaelle: [
        { segment: "HKCAZ", alleKontenAmStueck: true },
        { segment: "HKKAZ", alleKontenAmStueck: true },
      ],
    });
    const nurEiner = profil({
      vorfaelle: [
        { segment: "HKCAZ", alleKontenAmStueck: true },
        { segment: "HKKAZ", alleKontenAmStueck: false },
      ],
    });
    expect(alleKontenAmStueck(beide)).toBe(true);
    expect(alleKontenAmStueck(nurEiner)).toBe(false);
    expect(alleKontenAmStueck(profil())).toBe(false);
  });
});
