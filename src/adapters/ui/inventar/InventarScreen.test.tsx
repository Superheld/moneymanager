/** @vitest-environment jsdom */
// Die Bedienpfade des Inventars: bearbeiten, ersetzen, löschen.
//
// Das reine Anzeigen war abgedeckt, die Wege dahin nicht — und dort sitzt die Fachlogik,
// die bei einem Fehler still das Falsche tut: „bearbeiten" darf keinen ZWEITEN Gegenstand
// anlegen, und „ersetzt" startet den Rücklagen-Zyklus neu, statt nur ein Datum zu ändern.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { InventarScreen } from "./InventarScreen";
import { sqliteInventarRepository } from "../../persistence/sqliteInventarRepository";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Legt einen Gegenstand an und wartet, bis der Screen ihn zeigt. */
async function mitGegenstand(bezeichnung: string, wiederbeschaffung: number, dauer: number) {
  await sqliteInventarRepository.speichern({
    id: `inv-${bezeichnung}`,
    bezeichnung,
    anschaffung: "2024-03-01",
    wiederbeschaffung,
    nutzungsdauerMonate: dauer,
  });
  rendere(<InventarScreen />);
  await waitFor(() => expect(document.body.textContent).toMatch(bezeichnung));
}

describe("Inventar — Gegenstand bearbeiten", () => {
  it("übernimmt die Änderung am selben Gegenstand, statt einen zweiten anzulegen", async () => {
    const nutzer = userEvent.setup();
    await mitGegenstand("Trockner", 60000, 120);

    await nutzer.click(screen.getByRole("button", { name: "bearbeiten" }));

    // Der Dialog kommt vorbelegt — sonst überschriebe ein Speichern die Felder mit Leere.
    const felder = await screen.findAllByRole("textbox");
    expect((felder[0] as HTMLInputElement).value).toBe("Trockner");

    await nutzer.clear(felder[0]);
    await nutzer.type(felder[0], "Trockner (Ersatzgerät)");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const alle = await sqliteInventarRepository.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0].bezeichnung).toBe("Trockner (Ersatzgerät)");
      expect(alle[0].id).toBe("inv-Trockner");
    });
  });
});

describe("Inventar — ersetzt", () => {
  it("setzt die Anschaffung neu und zieht den Wiederbeschaffungswert nach", async () => {
    const nutzer = userEvent.setup();
    await mitGegenstand("Rasenmaeher", 40000, 96);

    await nutzer.click(screen.getByRole("button", { name: "ersetzt" }));

    // Der Dialog schlägt den bisherigen Wert vor; hier wird er erhöht (Preise steigen).
    const felder = await screen.findAllByRole("textbox");
    const wert = felder[felder.length - 1];
    await nutzer.clear(wert);
    await nutzer.type(wert, "520");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const [g] = await sqliteInventarRepository.alle();
      expect(g.wiederbeschaffung).toBe(52000);
      // Der Zyklus beginnt neu: die Anschaffung ist nicht mehr der alte Tag.
      expect(g.anschaffung).not.toBe("2024-03-01");
    });
  });

  it("meldet einen unbrauchbaren Wert, statt ihn zu speichern", async () => {
    const nutzer = userEvent.setup();
    await mitGegenstand("Werkbank", 30000, 60);

    await nutzer.click(screen.getByRole("button", { name: "ersetzt" }));
    const felder = await screen.findAllByRole("textbox");
    const wert = felder[felder.length - 1];
    await nutzer.clear(wert);
    await nutzer.type(wert, "0");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    // Der Fehler steht am Dialog, und der Bestand ist unangetastet.
    await waitFor(() => expect(document.querySelector(".err")).not.toBeNull());
    const [g] = await sqliteInventarRepository.alle();
    expect(g.wiederbeschaffung).toBe(30000);
    expect(g.anschaffung).toBe("2024-03-01");
  });
});

describe("Inventar — löschen", () => {
  /**
   * Die eigentliche Zusage der Rückfrage — und die einzige, die man testen muss: dass
   * Abbrechen NICHTS tut. Ein Dialog, der aufgeht und trotzdem löscht, wäre schlimmer
   * als gar keiner, weil er Sicherheit vortäuscht.
   */
  it("löscht nicht, wenn die Rückfrage abgebrochen wird", async () => {
    const nutzer = userEvent.setup();
    await mitGegenstand("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    await nutzer.click(await screen.findByRole("button", { name: "Abbrechen" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Endgültig löschen" })).toBeNull();
    });
    expect(await sqliteInventarRepository.alle()).toHaveLength(1);
  });

  it("entfernt den Gegenstand aus dem Bestand", async () => {
    const nutzer = userEvent.setup();
    await mitGegenstand("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    // Seit 2026-08-27 fragt jeder Löschweg nach — bestätigen gehört jetzt dazu.
    await nutzer.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    await waitFor(async () => {
      expect(await sqliteInventarRepository.alle()).toHaveLength(0);
    });
  });
});
