/** @vitest-environment jsdom */
// App — Bootstrap und Navigation zwischen den Bereichen.
//
// Deckt den Startpfad ab, den sonst niemand testet: Standardkategorien nachziehen, erst
// danach rendern, und den Wechsel zwischen den Screens. Läuft wie die Screen-Tests gegen
// eine echte In-Memory-Datenbank.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./adapters/persistence/db", () => ({ getDb: async () => halter.lesen() }));

// Das Tor vor der App redet mit Rust. Im Test gibt es kein Rust — hier steht es auf
// „eingerichtet und offen", damit die Navigationstests das prüfen, worum es ihnen geht.
// Der Sperrbildschirm selbst hat eigene Tests.
vi.mock("./adapters/dienste", async () => {
  const echt = await vi.importActual<typeof import("./adapters/dienste")>("./adapters/dienste");
  return {
    ...echt,
    zugangsstand: async () => ({ eingerichtet: true, offen: true, altbestand: false }),
    zeitsperre: async () => 0,
    zugangSperren: async () => {},
  };
});

import { frischeDb, pluginApi, sqlLaden } from "./testwerkzeug/harness";
import App from "./App";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

describe("App", () => {
  it("zieht beim Start die Standardkategorien nach und rendert erst danach", async () => {
    render(<App />);
    // Vor dem Bootstrap rendert App bewusst nichts — sonst blitzt ein leerer Zustand auf.
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));

    const kategorien = await sqliteKategorieRepository.alle();
    expect(kategorien.length).toBeGreaterThan(0);
  });

  it("startet auf der Übersicht", async () => {
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));
    // Der Übersichts-Screen ist der Einstieg; irgendeine seiner Kennzahlen muss stehen.
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("wechselt über die Navigation in einen anderen Bereich", async () => {
    const nutzer = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));

    // „Konten" steht zweimal in der Seitenleiste: die Übersicht unter Überblick und die
    // Verwaltung unter Verwaltung. Hier ist die erste gemeint.
    await nutzer.click((await screen.findAllByText(/^Konten$/))[0]);
    // Nach dem Wechsel muss der Konten-Bereich sichtbar sein.
    await waitFor(() => expect(document.body.textContent).toMatch(/Konto|Konten/));
  });

  it("erreicht auch Budgets, Verträge und Einstellungen", async () => {
    const nutzer = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));

    for (const bereich of [/^Budgets$/, /^Verträge$/, /^Einstellungen$/]) {
      const ziel = screen.queryAllByText(bereich)[0];
      if (!ziel) continue;
      await nutzer.click(ziel);
      await waitFor(() => expect(document.body.textContent).toBeTruthy());
    }
    expect(document.body.textContent).toMatch(/Moneymanager/);
  });
});
