import { describe, expect, it } from "vitest";

import { gruppenDesKontos, inGruppe, kontenDerGruppe, type Kontogruppe } from "./gruppe";

const LEBENSHALTUNG: Kontogruppe = {
  id: "g1",
  bezeichnung: "Lebenshaltung",
  kontoIds: ["giro", "bar"],
};
const URLAUB: Kontogruppe = { id: "g2", bezeichnung: "Urlaub", kontoIds: ["bar", "tagesgeld"] };

const KONTEN = [{ id: "giro" }, { id: "bar" }, { id: "tagesgeld" }, { id: "depot" }];

describe("Kontogruppe", () => {
  it("liefert die Mitglieder in der Reihenfolge der Kontenliste", () => {
    expect(kontenDerGruppe(LEBENSHALTUNG, KONTEN).map((k) => k.id)).toEqual(["giro", "bar"]);
  });

  // Eine Id ohne Konto ist kein Fehler, sondern eine Lücke — sie fällt heraus, statt als
  // undefined weiterzureisen und irgendwo später umzufallen.
  it("überspringt Ids, zu denen es kein Konto gibt", () => {
    const verwaist: Kontogruppe = { ...LEBENSHALTUNG, kontoIds: ["giro", "weg"] };
    expect(kontenDerGruppe(verwaist, KONTEN).map((k) => k.id)).toEqual(["giro"]);
  });

  // Der Unterschied zur Klasse: ein Konto hat GENAU EINE Klasse, aber es darf in
  // beliebig vielen Gruppen liegen.
  it("lässt ein Konto in mehreren Gruppen liegen", () => {
    expect(gruppenDesKontos([LEBENSHALTUNG, URLAUB], "bar").map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(gruppenDesKontos([LEBENSHALTUNG, URLAUB], "giro").map((g) => g.id)).toEqual(["g1"]);
  });

  it("weiss, ob ein Konto dazugehört", () => {
    expect(inGruppe(LEBENSHALTUNG, "giro")).toBe(true);
    expect(inGruppe(LEBENSHALTUNG, "depot")).toBe(false);
  });

  it("liefert für ein Konto ohne Gruppe eine leere Liste", () => {
    expect(gruppenDesKontos([LEBENSHALTUNG, URLAUB], "depot")).toEqual([]);
  });
});
