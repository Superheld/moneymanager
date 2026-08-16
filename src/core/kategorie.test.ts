// Kategoriebaum — Auflösung nach oben (Hauptkategorie). Der Unterbaum-Weg nach unten
// wird dort geprüft, wo er gebraucht wird (Budget-Verbrauch).

import { describe, expect, it } from "vitest";
import { hauptkategorie, type Kategorie } from "./kategorie";

const baum: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "energie", name: "Energie", elternId: "wohnen", defaultCharakter: "Aufwand" },
  { id: "strom", name: "Strom", elternId: "energie", defaultCharakter: "Aufwand" },
  { id: "solo", name: "Solo", defaultCharakter: "Aufwand" },
];

describe("hauptkategorie", () => {
  it("liefert die Wurzel über mehrere Ebenen", () => {
    expect(hauptkategorie(baum, "strom")?.id).toBe("wohnen");
  });

  it("liefert eine Wurzelkategorie unverändert zurück", () => {
    expect(hauptkategorie(baum, "solo")?.id).toBe("solo");
  });

  it("kennt eine unbekannte Id nicht", () => {
    expect(hauptkategorie(baum, "gibtsnicht")).toBeUndefined();
  });

  /**
   * Verwaiste Elternreferenz: die Kategorie zeigt auf einen Knoten, den es nicht (mehr)
   * gibt. Dann ist sie selbst das Beste, was als Hauptkategorie zu haben ist — auf keinen
   * Fall `undefined`, sonst fiele die Buchung in einer Auswertung still unter den Tisch.
   */
  it("bleibt beim letzten bekannten Knoten stehen, wenn der Elternteil fehlt", () => {
    const kaputt: Kategorie[] = [{ id: "x", name: "X", elternId: "weg", defaultCharakter: "Aufwand" }];
    expect(hauptkategorie(kaputt, "x")?.id).toBe("x");
  });
});
