import { describe, expect, it } from "vitest";
import { formatWaehlen } from "./formatwahl";

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
