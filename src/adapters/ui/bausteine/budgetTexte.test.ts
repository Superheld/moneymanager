// Jeder Satz, den ein aufbauendes Budget im Bereich Rücklagen anders trägt, muss es dort
// auch geben — in beiden Sprachen. Sonst stünde der Schlüssel selbst auf dem Bildschirm.

import { describe, expect, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { BUDGETTEXTE_ALS_RUECKLAGE, budgetText } from "./budgetTexte";

describe("budgetText", () => {
  it("leitet beim aufbauenden auf die Wörter der Rücklage um, beim monatlichen nicht", () => {
    expect(budgetText("aufbauend", "modalBearbeiten")).toBe("ruecklagen.kategorie.modalBearbeiten");
    expect(budgetText("monatlich", "modalBearbeiten")).toBe("budgets.modalBearbeiten");
    // Was für beide gleich lautet, bleibt beim Budget.
    expect(budgetText("aufbauend", "spalteRest")).toBe("budgets.spalteRest");
  });

  it.each(["de", "en"])("findet jeden umgeleiteten Satz und sein Gegenstück (%s)", (sprache) => {
    for (const k of BUDGETTEXTE_ALS_RUECKLAGE) {
      expect(i18n.exists(`ruecklagen.kategorie.${k}`, { lng: sprache }), k).toBe(true);
      expect(i18n.exists(`budgets.${k}`, { lng: sprache }), k).toBe(true);
      // Und das Wort, um das es geht, steht im umgeleiteten Satz nicht mehr.
      expect(i18n.t(`ruecklagen.kategorie.${k}`, { lng: sprache, monat: "2026-01", verbraucht: "1" })).not.toMatch(/budget/i);
    }
  });
});
