import { describe, expect, it } from "vitest";
import type { Kategorie } from "../core";
import type { KategorieRepository } from "./ports";
import { STANDARDKATEGORIEN } from "./kategorien/standardkategorien";

// Eigene Repo-Instanz pro Test, weil appBootstrap eine modulweite Singleton-Promise cacht;
// wir testen daher die Bootstrap-Logik über standardkategorienAnlegen direkt (gleiches Verhalten).
import { standardkategorienAnlegen } from "./kategorien/standardkategorien";

function memRepo(initial: Kategorie[] = []): KategorieRepository {
  const daten = [...initial];
  return {
    alle: async () => [...daten],
    speichern: async (k) => { daten.push(k); },
    loeschen: async (id) => { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

const ERWARTET = STANDARDKATEGORIEN.reduce((n, g) => n + 1 + g.kinder.length, 0);

describe("Standardkategorien-Seed/Backfill", () => {
  /**
   * ENTSCHIEDEN: ein Rueckfluss gehoert in die Kategorie der AUSGABE — eine Erstattung
   * fuer Kleidung entlastet dort das Budget. Eine Kategorie fuer Erstattungen unter den
   * EINNAHMEN gibt es deshalb nicht mehr, und sie darf auch nicht zurueckkommen: unter
   * ihr gebucht taete dieselbe Zahlung das Gegenteil, sie bliebe eine Einnahme und
   * entlastete nie etwas. Der Test steht hier, weil das Wiedereinfuegen der naheliegende
   * Handgriff ist — die Liste sieht ohne sie unvollstaendig aus.
   */
  it("kennt keine Kategorie fuer Erstattungen", () => {
    const alle = STANDARDKATEGORIEN.flatMap((g) => [
      g.name,
      ...g.kinder.map((k) => (typeof k === "string" ? k : k.name)),
    ]);
    expect(alle.filter((n) => /rstattung/.test(n))).toEqual([]);
  });

  it("legt auf leerer DB alle Standardkategorien an", async () => {
    const repo = memRepo();
    await standardkategorienAnlegen(repo);
    expect((await repo.alle()).length).toBe(ERWARTET);
  });

  it("ist idempotent — ein zweiter Lauf legt nichts doppelt an", async () => {
    const repo = memRepo();
    await standardkategorienAnlegen(repo);
    const angelegt = await standardkategorienAnlegen(repo);
    expect(angelegt).toBe(0);
    expect((await repo.alle()).length).toBe(ERWARTET);
  });

  it("zieht fehlende Kategorien bei bestehender (Teil-)DB nach", async () => {
    // DB mit nur einer Hauptgruppe vorbelegt → der Rest muss ergänzt werden.
    const repo = memRepo([{ id: "x", name: "Einnahmen", defaultCharakter: "Ertrag" }]);
    const angelegt = await standardkategorienAnlegen(repo);
    expect(angelegt).toBe(ERWARTET - 1);
    expect((await repo.alle()).length).toBe(ERWARTET);
  });
});
