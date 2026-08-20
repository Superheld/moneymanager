import { describe, expect, it } from "vitest";
import { adapterNach, adapterRegistrieren, alleAdapter, waehleAdapter, type Quellenadapter } from "./quellenAdapter";
// Import des Adapters löst dessen Selbst-Registrierung aus.
import "../../adapters/import/finanzguruAdapter";
import { xlsxAusZeilen } from "../../testwerkzeug/xlsxBauen";

const fgDatei = xlsxAusZeilen([
  ["Buchungstag", "Betrag", "Analyse-Hauptkategorie"],
  ["44562", "-1.00", "Essen"],
]);
const fremd = new TextEncoder().encode("völlig fremder inhalt");

describe("Quellen-Registry", () => {
  it("kennt den selbst-registrierten Finanzguru-Adapter", () => {
    expect(adapterNach("finanzguru")?.name).toBe("Finanzguru-Export (Excel)");
    expect(alleAdapter().map((a) => a.id)).toContain("finanzguru");
  });

  it("wählt per Auto-Erkennung den passenden Adapter", () => {
    expect(waehleAdapter(fgDatei)?.id).toBe("finanzguru");
    expect(waehleAdapter(fremd)).toBeUndefined();
  });

  it("nimmt neue Adapter modular auf — ohne dass bestehender Code sich ändert", () => {
    const dummy: Quellenadapter = {
      id: "dummy-test",
      name: "Dummy",
      erkennt: (d) => new TextDecoder().decode(d.slice(0, 5)) === "DUMMY",
      lies: () => ({ quelle: "dummy-test", umsaetze: [], warnungen: [] }),
    };
    adapterRegistrieren(dummy);
    expect(adapterNach("dummy-test")).toBe(dummy);
    expect(waehleAdapter(new TextEncoder().encode("DUMMY-format"))?.id).toBe("dummy-test");
    // Finanzguru bleibt unberührt erkennbar.
    expect(waehleAdapter(fgDatei)?.id).toBe("finanzguru");
  });
});
