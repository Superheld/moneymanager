import { describe, expect, it } from "vitest";
import { formatWaehlen } from "./formatwahl";

const BEIDE = ["CAMT", "MT940"] as const;
const NUR_MT940 = ["MT940"] as const;
const NUR_CAMT = ["CAMT"] as const;

describe("formatWaehlen", () => {
  it("nimmt CAMT, wenn das Konto es anbietet", () => {
    expect(formatWaehlen(undefined, BEIDE)).toBe("CAMT");
  });

  /**
   * Der Fall, der frueher den zweiten Versuch gebraucht hat: ein Konto ohne HKCAZ. Es
   * wurde bis 2026-09-04 erst mit CAMT gefragt, lieferte nichts, und bekam dann MT940 —
   * eine vergebliche Runde bei JEDEM Abruf. Jetzt steht die Antwort vorher fest.
   */
  it("nimmt MT940, wenn das Konto kein CAMT anbietet", () => {
    expect(formatWaehlen(undefined, NUR_MT940)).toBe("MT940");
  });

  /**
   * Der Fund vom 05.09.2026: gefragt wurde bis dahin, was die BANK kann. Eine Bank kann
   * CAMT beherrschen und es nur fuer einen Teil ihrer Konten freigeben — dann bekam das
   * Tagesgeldkonto im selben Zugang ein CAMT-Etikett auf einen MT940-Abruf, und
   * `umsatzart` und `buchungsschluessel` waren nicht mehr deutbar.
   */
  it("entscheidet aus dem Angebot DIESES Kontos", () => {
    expect(formatWaehlen(undefined, NUR_CAMT)).toBe("CAMT");
    expect(formatWaehlen(undefined, NUR_MT940)).toBe("MT940");
  });

  it("laesst die Festlegung des Nutzers gewinnen, solange es das Format gibt", () => {
    // Wer MT940 WAEHLT, soll dessen Ergebnis sehen, auch wenn CAMT danebenliegt. Ein
    // stiller Wechsel beantwortete die Frage, die niemand gestellt hat.
    expect(formatWaehlen({ wahl: "MT940" }, BEIDE)).toBe("MT940");
    expect(formatWaehlen({ wahl: "CAMT" }, BEIDE)).toBe("CAMT");
  });

  /**
   * Bis f943818 gewann die Festlegung auch gegen ein Konto, das das Format gar nicht
   * anbietet — die Bibliothek holte dann still das andere. Jetzt wirft sie, und der Wurf
   * gehoert hierher: VOR den Bankverkehr, auf Deutsch, mit dem Konto im Text. Eine Ebene
   * tiefer machte unser Fehlerpfad daraus ein „liess sich nicht lesen", und das ist der
   * falsche Satz — es liess sich nicht ANFORDERN.
   */
  it("weist eine Festlegung ab, die das Konto nicht anbietet", () => {
    expect(() => formatWaehlen({ wahl: "CAMT" }, NUR_MT940, "Tagesgeldkonto")).toThrow(
      /Tagesgeldkonto.*nur MT940.*CAMT ist nicht abrufbar/s,
    );
    expect(() => formatWaehlen({ wahl: "MT940" }, NUR_CAMT)).toThrow(/nur CAMT/);
  });

  it("sagt es deutlich, wenn das Konto ueberhaupt keine Umsaetze hergibt", () => {
    // Sonst liefe der Abruf gegen eine leere Auswahl los und die Bibliothek meldete es
    // erst nach dem Verbindungsaufbau.
    expect(() => formatWaehlen(undefined, [])).toThrow(/weder als CAMT noch als MT940/);
    expect(() => formatWaehlen({ wahl: "CAMT" }, [])).toThrow(/weder als CAMT noch als MT940/);
  });

  it("behandelt „automatisch“ wie keine Wahl", () => {
    expect(formatWaehlen({ wahl: "automatisch" }, BEIDE)).toBe("CAMT");
    expect(formatWaehlen({ wahl: "automatisch" }, NUR_MT940)).toBe("MT940");
  });
});
