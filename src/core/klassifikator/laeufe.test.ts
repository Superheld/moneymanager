import { describe, expect, it } from "vitest";
import { laeufeVergleichen, type Trainingslauf } from "./laeufe";

function lauf(id: string, vorhersagen: [string, string, string][], ausschluesse: string[] = [], herkuenfte: Trainingslauf["konfiguration"]["herkuenfte"] = ["empGanz", "vwz"]): Trainingslauf {
  return {
    id,
    zeitpunkt: `2026-11-0${id.length}T10:00:00.000Z`,
    beispiele: 10,
    konfiguration: { herkuenfte, ausschluesse: ausschluesse.map((wort) => ({ wort })) },
    vorhersagen: vorhersagen.map(([zid, tatsaechlich, vorhergesagt]) => ({ id: zid, tatsaechlich, vorhergesagt })),
  };
}

describe("laeufeVergleichen", () => {
  it("findet gewonnene und verlorene Zeilen, auch wenn die Trefferquote gleich bleibt", () => {
    // Beide Läufe liegen 1 von 3 richtig — und haben doch zwei Zeilen getauscht. Genau
    // das sieht man an der Trefferquote allein nicht.
    const alt = lauf("a", [["z1", "x", "x"], ["z2", "y", "x"], ["z3", "y", "x"]]);
    const neu = lauf("bb", [["z1", "x", "y"], ["z2", "y", "y"], ["z3", "y", "x"]]);
    const v = laeufeVergleichen(alt, neu);
    expect(v.gemeinsam).toBe(3);
    expect(v.gewonnen).toBe(1);
    expect(v.verloren).toBe(1);
    expect(v.gekippt[0]).toEqual({ id: "z2", tatsaechlich: "y", vorher: "x", nachher: "y", gewonnen: true });
    expect(v.gekippt[1].id).toBe("z1");
  });

  it("vergleicht nur an Zeilen, die beide Läufe geprüft haben", () => {
    // Ein Import dazwischen schiebt das Prüffenster weiter — z9 kennt nur der neue Lauf.
    const v = laeufeVergleichen(lauf("a", [["z1", "x", "y"]]), lauf("bb", [["z1", "x", "x"], ["z9", "x", "y"]]));
    expect(v.gemeinsam).toBe(1);
    expect(v.gekippt.map((g) => g.id)).toEqual(["z1"]);
  });

  it("nennt, was an der Konfiguration anders war", () => {
    const v = laeufeVergleichen(
      lauf("a", [], ["kdn", "sepa"], ["empGanz", "vwz"]),
      lauf("bb", [], ["sepa", "karte"], ["empGanz", "vwz", "betrag"]),
    );
    expect(v.ausgeschlossenDazu).toEqual(["karte"]);
    expect(v.ausgeschlossenWeg).toEqual(["kdn"]);
    expect(v.herkuenfteDazu).toEqual(["betrag"]);
    expect(v.herkuenfteWeg).toEqual([]);
  });
});
