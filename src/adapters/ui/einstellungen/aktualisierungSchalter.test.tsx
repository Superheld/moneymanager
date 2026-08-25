/** @vitest-environment jsdom */
// Der Schalter für die Aktualisierungsprüfung.
//
// Er war seit dem Update-Weg gebaut und geprüft (`pruefungSchalten`), hatte aber keine
// Oberfläche — abschalten ging nur über die Einstellungstabelle. Eine Fähigkeit, die
// niemand erreicht, ist keine, und ausgerechnet bei dieser zählt es doppelt: die Prüfung
// ist der einzige Netzzugriff, den die App von sich aus macht.
//
// Der Unterschied zum Experimente-Schalter daneben ist die VORGABE. Ein Experiment ist
// aus, bis jemand es einschaltet; diese Prüfung ist an, bis jemand sie abschaltet — ein
// Update, von dem niemand erfährt, ist keines. Deshalb steht der erste Test hier und
// nicht als Nachtrag: ein fehlender Schlüssel heisst „nie entschieden", und das ist
// etwas anderes als „abgelehnt".

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

// Über die i18n-Schlüssel statt über Formulierungen — sonst wird die Suite beim nächsten
// Wording-Durchgang rot (src/CLAUDE.md).
const registerName = () => i18n.t("einstellungen.aktualisierung.titel");
const schalterName = () => i18n.t("einstellungen.aktualisierung.schalterTitel");

async function schalterHolen(nutzer: ReturnType<typeof userEvent.setup>) {
  await registerWaehlen(nutzer, registerName());
  return (await screen.findByLabelText(schalterName())) as HTMLInputElement;
}

describe("Schalter für die Aktualisierungsprüfung", () => {
  it("ist AN, solange niemand etwas entschieden hat", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    expect((await schalterHolen(nutzer)).checked).toBe(true);
    // Und zwar ohne Zeile in der Tabelle: „nie entschieden" ist nicht „abgelehnt".
    expect(await sqliteEinstellungenRepository.lesen()).not.toHaveProperty("aktualisierungPruefen");
  });

  it("schaltet ab und schreibt es in die Datenbank", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    const schalter = await schalterHolen(nutzer);

    await nutzer.click(schalter);

    await waitFor(async () => {
      const kv = await sqliteEinstellungenRepository.lesen();
      expect(kv["aktualisierungPruefen"]).toBe("aus");
    });
    await waitFor(() => expect(schalter.checked).toBe(false));
  });

  it("schaltet wieder an", async () => {
    await sqliteEinstellungenRepository.schreiben("aktualisierungPruefen", "aus");

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    const schalter = await schalterHolen(nutzer);
    expect(schalter.checked).toBe(false);

    await nutzer.click(schalter);

    await waitFor(async () => {
      const kv = await sqliteEinstellungenRepository.lesen();
      expect(kv["aktualisierungPruefen"]).toBe("an");
    });
    await waitFor(() => expect(schalter.checked).toBe(true));
  });

  // Der eigentliche Punkt eines Schalters: er überlebt den Neustart. Ohne das wäre er
  // eine Anzeige und keine Einstellung.
  it("gilt nach einem Neuaufbau der Oberfläche weiter", async () => {
    await sqliteEinstellungenRepository.schreiben("aktualisierungPruefen", "aus");

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    expect((await schalterHolen(nutzer)).checked).toBe(false);
  });
});
