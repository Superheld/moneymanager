// Sammelzuordnung — dieselbe Entscheidung für viele Buchungen.
//
// Der Fall, der hier zählt, ist der mittlere: „gehört zu keinem Vertrag" ist eine AUSSAGE
// und kein fehlender Wert. Wer sie als Löschen umsetzt, nimmt der Handkorrektur genau die
// Wirkung, wegen der sie gemacht wurde — beim nächsten Abgleich stünde der Fehlgriff der
// Automatik wieder da. Die drei Fälle liegen deshalb einzeln hier und nicht als einer.

import { describe, expect, it } from "vitest";
import type { Vertragszuordnung } from "../../core";
import type { VertragszuordnungRepository } from "../ports";
import { zuordnungenVonHand } from "./vertragszuordnung";

function repo(anfang: Vertragszuordnung[] = []) {
  const bestand = new Map(anfang.map((z) => [z.istbuchungId, z]));
  const port: VertragszuordnungRepository = {
    alle: async () => [...bestand.values()],
    speichern: async (z) => {
      bestand.set(z.istbuchungId, z);
    },
    loeschen: async (id) => {
      bestand.delete(id);
    },
  };
  return { port, bestand };
}

describe("zuordnungenVonHand", () => {
  it("setzt den Vertrag an allen gewählten Buchungen — als Handentscheidung", () => {
    const { port, bestand } = repo();

    return zuordnungenVonHand(port, ["b1", "b2"], { art: "vertrag", vertragId: "v1" }).then((n) => {
      expect(n).toBe(2);
      // Die Herkunft ist der ganze Punkt: ohne sie überschreibt der nächste Abgleich
      // genau das, was jemand gerade von Hand gesetzt hat.
      expect(bestand.get("b1")).toEqual({ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" });
      expect(bestand.get("b2")?.herkunft).toBe("manuell");
    });
  });

  it("schreibt fuer das Ziel keiner eine Zeile mit leerem Vertrag statt zu loeschen", async () => {
    const { port, bestand } = repo([{ istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" }]);

    await zuordnungenVonHand(port, ["b1"], { art: "keiner" });

    expect(bestand.get("b1")).toEqual({ istbuchungId: "b1", vertragId: null, herkunft: "manuell" });
  });

  it("raeumt fuer das Ziel automatik die Zeile weg — danach entscheidet wieder die Regel", async () => {
    const { port, bestand } = repo([{ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" }]);

    await zuordnungenVonHand(port, ["b1"], { art: "automatik" });

    expect(bestand.has("b1")).toBe(false);
  });

  it("kommt mit einer leeren Auswahl klar, ohne etwas anzufassen", async () => {
    const { port, bestand } = repo([{ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" }]);

    expect(await zuordnungenVonHand(port, [], { art: "automatik" })).toBe(0);
    expect(bestand.size).toBe(1);
  });
});
