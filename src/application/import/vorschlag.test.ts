import { describe, expect, it } from "vitest";
import type { Kategorie } from "../../core";
import { katalogNachName, vorschlagFuer } from "./vorschlag";

const kategorien: Kategorie[] = [
  { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "k-sp", name: "Sparen & Anlegen", defaultCharakter: "Umschichtung" },
];
const katalog = katalogNachName(kategorien);

describe("vorschlagFuer", () => {
  it("labelt Umbuchungen als Umschichtung, nicht nach FG-Hinweis", () => {
    const v = vorschlagFuer({ istUmbuchung: true, kategorieHinweis: "Restaurants" }, katalog);
    expect(v).toEqual({ charakter: "Umschichtung", quelle: "umbuchung" });
  });

  it("mappt den FG-Hinweis auf unsere Kategorie inkl. Charakter", () => {
    const v = vorschlagFuer({ istUmbuchung: false, kategorieHinweis: "Lebensmittel" }, katalog);
    expect(v).toEqual({ kategorieId: "k-le", charakter: "Aufwand", quelle: "remapping" });
  });

  it("nimmt den Charakter aus der Zielkategorie (Sparen → Umschichtung)", () => {
    const v = vorschlagFuer({ istUmbuchung: false, kategorieHinweis: "Kapitalanlage" }, katalog);
    expect(v).toEqual({ kategorieId: "k-sp", charakter: "Umschichtung", quelle: "remapping" });
  });

  it("liefert undefined, wenn der Hinweis unbekannt ist oder die Kategorie fehlt", () => {
    expect(vorschlagFuer({ istUmbuchung: false, kategorieHinweis: "Gibtsnicht" }, katalog)).toBeUndefined();
    // bekannter Hinweis, aber Zielkategorie nicht im Katalog des Nutzers:
    expect(vorschlagFuer({ istUmbuchung: false, kategorieHinweis: "Tanken" }, katalog)).toBeUndefined();
  });
});
