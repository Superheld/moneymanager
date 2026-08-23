/** @vitest-environment jsdom */
// Der Experimente-Schalter — geprüft wird der Rückweg: über die Oberfläche umlegen,
// danach muss es in der Datenbank stehen und beim nächsten Aufbau wieder gelten.
//
// Der Bankname steht hier NICHT im Klartext, sondern kommt über seinen i18n-Schlüssel.
// Zwei Gründe, und beide zählen: nach Formulierungen zu suchen macht die Suite beim
// nächsten Wording-Durchgang rot (src/CLAUDE.md), und der Name ist zugleich ein Wert aus
// dem echten Bestand — jede weitere Stelle im Repo bräuchte eine eigene Freigabe im
// Wächter. Über den Schlüssel gibt es beide Probleme nicht.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { sqliteEinstellungenRepository } from "../../persistence/sqliteEinstellungenRepository";
import i18n from "../../../i18n/i18n";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const registerName = () => i18n.t("einstellungen.experiment.titel");
const schalterName = () => i18n.t("einstellungen.experiment.hanseaticTitel");

async function schalterHolen(nutzer: ReturnType<typeof userEvent.setup>) {
  await registerWaehlen(nutzer, registerName());
  return (await screen.findByLabelText(schalterName())) as HTMLInputElement;
}

describe("Experimente-Schalter", () => {
  it("ist aus, solange ihn niemand eingeschaltet hat", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    expect((await schalterHolen(nutzer)).checked).toBe(false);
  });

  it("schaltet ein und schreibt es in die Datenbank", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    const schalter = await schalterHolen(nutzer);

    await nutzer.click(schalter);

    await waitFor(async () => {
      const kv = await sqliteEinstellungenRepository.lesen();
      expect(kv["experiment.hanseatic"]).toBe("an");
    });
    await waitFor(() => expect(schalter.checked).toBe(true));
  });

  it("schaltet wieder aus", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    const schalter = await schalterHolen(nutzer);

    await nutzer.click(schalter);
    await waitFor(() => expect(schalter.checked).toBe(true));
    await nutzer.click(schalter);

    await waitFor(async () => {
      const kv = await sqliteEinstellungenRepository.lesen();
      expect(kv["experiment.hanseatic"]).toBe("aus");
    });
    await waitFor(() => expect(schalter.checked).toBe(false));
  });

  // Der eigentliche Punkt eines Schalters: er überlebt den Neustart. Ohne das wäre er
  // eine Anzeige und keine Einstellung.
  it("gilt nach einem Neuaufbau der Oberfläche weiter", async () => {
    await sqliteEinstellungenRepository.schreiben("experiment.hanseatic", "an");

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    expect((await schalterHolen(nutzer)).checked).toBe(true);
  });
});
