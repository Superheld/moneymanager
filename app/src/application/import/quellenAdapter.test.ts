import { describe, expect, it } from "vitest";
import { adapterNach, adapterRegistrieren, alleAdapter, waehleAdapter, type Quellenadapter } from "./quellenAdapter";
// Import des Adapters löst dessen Selbst-Registrierung aus.
import "../../adapters/import/finanzguruAdapter";

const fgInhalt = "Buchungstag;Betrag;Analyse-Hauptkategorie\n01.01.2022;-1,00;Essen";

describe("Quellen-Registry", () => {
  it("kennt den selbst-registrierten Finanzguru-Adapter", () => {
    expect(adapterNach("finanzguru")?.name).toBe("Finanzguru-Export (CSV)");
    expect(alleAdapter().map((a) => a.id)).toContain("finanzguru");
  });

  it("wählt per Auto-Erkennung den passenden Adapter", () => {
    expect(waehleAdapter(fgInhalt)?.id).toBe("finanzguru");
    expect(waehleAdapter("völlig fremder inhalt")).toBeUndefined();
  });

  it("nimmt neue Adapter modular auf — ohne dass bestehender Code sich ändert", () => {
    const dummy: Quellenadapter = {
      id: "dummy-test",
      name: "Dummy",
      erkennt: (i) => i.startsWith("DUMMY"),
      lies: () => ({ quelle: "dummy-test", umsaetze: [], warnungen: [] }),
    };
    adapterRegistrieren(dummy);
    expect(adapterNach("dummy-test")).toBe(dummy);
    expect(waehleAdapter("DUMMY-format")?.id).toBe("dummy-test");
    // Finanzguru bleibt unberührt erkennbar.
    expect(waehleAdapter(fgInhalt)?.id).toBe("finanzguru");
  });
});
