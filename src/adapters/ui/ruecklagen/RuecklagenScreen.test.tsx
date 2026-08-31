/** @vitest-environment jsdom */
// Die Bedienpfade der Rücklagen: bearbeiten, ausbuchen, löschen.
//
// Das reine Anzeigen war abgedeckt, die Wege dahin nicht — und dort sitzt die Fachlogik,
// die bei einem Fehler still das Falsche tut: „bearbeiten" darf keine ZWEITE Rücklage
// anlegen, und „ausgebucht" startet den Zyklus neu, statt nur ein Datum zu ändern.

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
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Legt eine Rücklage mit Ziel und Frist an und wartet, bis der Screen sie zeigt. */
async function mitRuecklage(bezeichnung: string, ziel: number, frist: number) {
  await sqliteRuecklagenRepository.speichern({
    id: `rue-${bezeichnung}`,
    bezeichnung,
    beginn: "2024-03-01",
    ziel,
    fristMonate: frist,
  });
  rendere(<RuecklagenScreen />);
  await waitFor(() => expect(document.body.textContent).toMatch(bezeichnung));
}

describe("Rücklagen — bearbeiten", () => {
  it("übernimmt die Änderung am selben Gegenstand, statt einen zweiten anzulegen", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Trockner", 60000, 120);

    await nutzer.click(screen.getByRole("button", { name: "bearbeiten" }));

    // Der Dialog kommt vorbelegt — sonst überschriebe ein Speichern die Felder mit Leere.
    const felder = await screen.findAllByRole("textbox");
    expect((felder[0] as HTMLInputElement).value).toBe("Trockner");

    await nutzer.clear(felder[0]);
    await nutzer.type(felder[0], "Trockner (Ersatzgerät)");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const alle = await sqliteRuecklagenRepository.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0].bezeichnung).toBe("Trockner (Ersatzgerät)");
      expect(alle[0].id).toBe("rue-Trockner");
    });
  });
});

describe("Rücklagen — ausbuchen", () => {
  it("startet den Zyklus neu und zieht das Ziel nach", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Rasenmaeher", 40000, 96);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));

    // Der Dialog schlägt das bisherige Ziel vor; hier wird es erhöht (Preise steigen).
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "520");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r.ziel).toBe(52000);
      // Der Zyklus beginnt neu: der Beginn ist nicht mehr der alte Tag.
      expect(r.beginn).not.toBe("2024-03-01");
    });
  });

  it("meldet ein unbrauchbares Ziel, statt es zu speichern", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Werkbank", 30000, 60);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "0");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    // Der Fehler steht am Dialog, und der Bestand ist unangetastet.
    await waitFor(() => expect(document.querySelector(".err")).not.toBeNull());
    const [r] = await sqliteRuecklagenRepository.alle();
    expect(r.ziel).toBe(30000);
    expect(r.beginn).toBe("2024-03-01");
  });

  /**
   * Die freie Rücklage ist der andere Ausgang derselben Handlung — und der Grund,
   * warum es kein Feld „wiederkehrend" gibt: die Form entscheidet.
   */
  it("beendet eine freie Rücklage, statt sie neu zu starten", async () => {
    const nutzer = userEvent.setup();
    await sqliteRuecklagenRepository.speichern({
      id: "rue-frei", bezeichnung: "Urlaubskasse", beginn: "2024-03-01", rate: 5000,
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Urlaubskasse"));

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    // Ohne Ziel gibt es auch kein Zielfeld im Dialog.
    expect(screen.queryByLabelText(/^Ziel/)).toBeNull();
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
    // Was sie gekostet hat, bleibt trotzdem festgehalten.
    expect(await sqliteRuecklagenRepository.ausbuchungen()).toHaveLength(1);
  });
});

describe("Rücklagen — löschen", () => {
  /**
   * Die eigentliche Zusage der Rückfrage — und die einzige, die man testen muss: dass
   * Abbrechen NICHTS tut. Ein Dialog, der aufgeht und trotzdem löscht, wäre schlimmer
   * als gar keiner, weil er Sicherheit vortäuscht.
   */
  it("löscht nicht, wenn die Rückfrage abgebrochen wird", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    await nutzer.click(await screen.findByRole("button", { name: "Abbrechen" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Endgültig löschen" })).toBeNull();
    });
    expect(await sqliteRuecklagenRepository.alle()).toHaveLength(1);
  });

  it("entfernt die Rücklage aus dem Bestand", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    // Seit 2026-08-27 fragt jeder Löschweg nach — bestätigen gehört jetzt dazu.
    await nutzer.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
  });
});
