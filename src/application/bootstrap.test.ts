import { describe, expect, it } from "vitest";
import type { Kategorie } from "../core";
import type { KategorieRepository } from "./ports";
import { STANDARDKATEGORIEN } from "./standardkategorien";

// Eigene Repo-Instanz pro Test, weil appBootstrap eine modulweite Singleton-Promise cacht;
// wir testen daher die Bootstrap-Logik über standardkategorienAnlegen direkt (gleiches Verhalten).
import { standardkategorienAnlegen } from "./standardkategorien";

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
