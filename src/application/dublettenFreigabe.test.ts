import { describe, expect, it } from "vitest";
import { FachlicherFehler } from "../core";
import { dublettenFreigabeAufheben, dublettenFreigeben } from "./dublettenFreigabe";
import type { Dublettenfreigabe } from "./dublettensicht";
import type { DublettenfreigabeRepository } from "./ports";

function repo() {
  const gespeichert: Dublettenfreigabe[] = [];
  const entfernt: [string, string][] = [];
  const port: DublettenfreigabeRepository = {
    async alle() { return gespeichert; },
    async speichern(f) { gespeichert.push(f); },
    async entfernen(a, b) { entfernt.push([a, b]); },
  };
  return { port, gespeichert, entfernt };
}

describe("dublettenFreigeben", () => {
  it("legt das Paar sortiert ab — der Schlüssel muss in beide Richtungen greifen", async () => {
    const { port, gespeichert } = repo();
    await dublettenFreigeben(port, "u-z", "u-a", () => "2026-08-20T10:00:00.000Z");
    expect(gespeichert).toEqual([
      { umsatzA: "u-a", umsatzB: "u-z", angelegt: "2026-08-20T10:00:00.000Z" },
    ]);
  });

  it("weist eine Zeile zurück, die ihr eigener Zwilling sein soll", async () => {
    // Ein Aufrufer-Fehler, der sich still als „nie wieder gemeldet" auswirken würde.
    const { port, gespeichert } = repo();
    await expect(dublettenFreigeben(port, "u-a", "u-a")).rejects.toBeInstanceOf(FachlicherFehler);
    expect(gespeichert).toEqual([]);
  });

  it("reicht beide IDs unverändert zum Aufheben durch", async () => {
    const { port, entfernt } = repo();
    await dublettenFreigabeAufheben(port, "u-a", "u-z");
    expect(entfernt).toEqual([["u-a", "u-z"]]);
  });
});
