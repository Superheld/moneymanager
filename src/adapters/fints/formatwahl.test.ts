import { describe, expect, it } from "vitest";
import type { Bankprofil } from "../../application/fints/abrufPort";
import { formatWaehlen, kontoKannCamt } from "./formatwahl";

describe("formatWaehlen", () => {
  it("nimmt CAMT, wenn die Bank es kann", () => {
    expect(formatWaehlen(undefined, true)).toBe("CAMT");
  });

  /**
   * Der Fall, der frueher den zweiten Versuch gebraucht hat: eine Bank ohne HKCAZ. Sie
   * wurde bis 2026-09-04 erst mit CAMT gefragt, lieferte nichts, und bekam dann MT940 —
   * eine vergebliche Runde bei JEDEM Abruf. Jetzt steht die Antwort vorher fest.
   */
  it("nimmt MT940, wenn die Bank kein CAMT kann", () => {
    expect(formatWaehlen(undefined, false)).toBe("MT940");
  });

  it("laesst die Festlegung des Nutzers gewinnen — auch gegen die Faehigkeit", () => {
    expect(formatWaehlen({ wahl: "MT940" }, true)).toBe("MT940");
    // Wer CAMT WAEHLT, soll das Ergebnis von CAMT sehen, auch das leere. Ein stiller
    // Wechsel beantwortete die Frage, die niemand gestellt hat.
    expect(formatWaehlen({ wahl: "CAMT" }, false)).toBe("CAMT");
  });

  it("behandelt „automatisch“ wie keine Wahl", () => {
    expect(formatWaehlen({ wahl: "automatisch" }, true)).toBe("CAMT");
    expect(formatWaehlen({ wahl: "automatisch" }, false)).toBe("MT940");
  });
});


describe("kontoKannCamt", () => {
  const profil = (kontoVorfaelle: Record<string, readonly string[]>): Bankprofil => ({
    standAm: "2026-09-05",
    tanVerfahren: [],
    // Die Bank BEHERRSCHT CAMT — das ist genau der Fall, in dem die alte Abfrage falsch lag.
    vorfaelle: [{ segment: "HKCAZ" }, { segment: "HKKAZ" }],
    kontoVorfaelle,
  });

  it("fragt das Konto und nicht die Bank", () => {
    // Beide Konten liegen im selben Zugang derselben Bank. Bis 2026-09-05 entschied
    // `profil.vorfaelle` — und das sagt für beide dasselbe, obwohl die Bank CAMT nur für
    // eins freigegeben hat.
    const p = profil({ giro: ["HKKAZ", "HKCAZ", "HKSAL"], tagesgeld: ["HKKAZ", "HKSAL"] });
    expect(kontoKannCamt(p, "giro")).toBe(true);
    expect(kontoKannCamt(p, "tagesgeld")).toBe(false);
  });

  it("hält ein unbekanntes Konto für unfähig statt für fähig", () => {
    // Die vorsichtige Richtung: MT940 kann jede Bank, die überhaupt Umsätze liefert.
    // Andersherum bekäme ein Konto, über das nichts bekannt ist, ein CAMT-Etikett auf
    // einen Abruf, den die Bibliothek als MT940 ausführt — genau der Fehler von vorher.
    expect(kontoKannCamt(profil({}), "unbekannt")).toBe(false);
  });
});
