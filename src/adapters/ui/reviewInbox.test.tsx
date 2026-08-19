/** @vitest-environment jsdom */
// Die Import-Inbox als einzige Vorstufe — was der Dateiimport bringt, wird vorher geprüft.
//
// Der Dublettenverdacht hing bis 2026-08-20 nur am Konto-Block „Neu von der Bank". Den
// gibt es nicht mehr; die Prüfung, die den Dateiimport absichert, muss also hier stehen.
//
// Namen und Beträge sind erfunden — das Repo ist öffentlich.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { ReviewScreen } from "./ReviewScreen";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const GEMEINSAM = {
  zahlungskontoId: "k1", buchungstag: "2026-08-11", betrag: -5700, waehrung: "EUR",
  gegenpartei: "Musterladen", verwendungszweck: "Musterladen, Musterstadt",
};

async function grunddaten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await laufRepo.speichern({ id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-19T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
  await laufRepo.speichern({ id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-18T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
}

describe("Import-Inbox", () => {
  it("meldet an der Zeile, dass es sie womöglich schon gibt", async () => {
    await grunddaten();
    // Die Bank hat dieselbe Zahlung schon gebracht und sie ist längst gebucht.
    await umsatzRepo.speichern({
      ...GEMEINSAM, id: "u-bank", laufId: "l-bank", rohHash: "h-bank",
      status: "verbucht", istbuchungId: "b-bank",
    });
    // Und jetzt kommt sie aus einer Datei noch einmal herein.
    await umsatzRepo.speichern({
      ...GEMEINSAM, id: "u-datei", laufId: "l-datei", rohHash: "h-datei", status: "neu",
    });

    rendere(<ReviewScreen />);

    await waitFor(async () => {
      expect(await screen.findByText(/steht schon drin|könnte doppelt sein/)).toBeInTheDocument();
    });
    // Mit Begründung — eine Markierung ohne Grund ist nicht überprüfbar.
    expect(await screen.findByText(/Gründe:/)).toBeInTheDocument();
    // Und der Hinweis nennt den Zustand des Gegenstücks.
    expect(await screen.findByText(/bereits gebucht/)).toBeInTheDocument();
  });

  it("schweigt bei einer Zeile ohne Gegenstück", async () => {
    await grunddaten();
    await umsatzRepo.speichern({
      ...GEMEINSAM, id: "u-datei", laufId: "l-datei", rohHash: "h-datei", status: "neu",
    });

    rendere(<ReviewScreen />);

    await screen.findByText("Musterladen");
    expect(screen.queryByText(/steht schon drin|könnte doppelt sein/)).not.toBeInTheDocument();
  });
});
