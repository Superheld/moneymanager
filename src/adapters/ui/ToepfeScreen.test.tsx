/** @vitest-environment jsdom */
// Töpfe-Screen — Integrationstest von der Oberfläche bis ins Schema.
//
// `getDb` zeigt auf eine frische In-Memory-SQLite; alles dazwischen (Repositories,
// Use-Cases, Kern) läuft echt. Ein falsches Spalten-Mapping fällt hier deshalb genauso
// auf wie eine kaputte Anzeige.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { ToepfeScreen } from "./ToepfeScreen";
import { sqliteTopfRepository } from "../persistence/sqliteTopfRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository } from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

describe("ToepfeScreen", () => {
  it("zeigt im Leerzustand Titel und Erklärung statt leerer Kennzahlen", async () => {
    rendere(<ToepfeScreen />);
    expect((await screen.findAllByText("Töpfe")).length).toBeGreaterThan(0);
    // Ohne Töpfe werden bewusst KEINE Kennzahlen gerendert — leere KPI-Kacheln (0,00 €
    // über alle Felder) sähen aus wie ein Datenfehler. Stattdessen die Erklärung.
    await waitFor(() => expect(document.body.textContent).toMatch(/Wie Budgets/));
    expect(document.body.textContent).not.toMatch(/Deckungsgrad/);
  });

  it("zeigt die Kennzahlen, sobald ein Topf existiert", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000, sparziel: 60000,
    });
    rendere(<ToepfeScreen />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Angespart|Ziel gesamt|Deckungsgrad/),
    );
  });

  it("zeigt einen gespeicherten Spartopf mit Bezeichnung und Zielwert", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1",
      typ: "spartopf",
      bezeichnung: "Urlaubskasse",
      start: "2026-01-01",
      zufuehrungProMonat: 10000,
      sparziel: 120000,
    });

    rendere(<ToepfeScreen />);
    expect(await screen.findByText("Urlaubskasse")).toBeInTheDocument();
    // 120000 Minor Units → „1.200,00" in de-DE.
    await waitFor(() => expect(screen.getAllByText(/1\.200,00/).length).toBeGreaterThan(0));
  });

  it("zeigt mehrere Töpfe nebeneinander", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000, sparziel: 60000,
    });
    await sqliteTopfRepository.speichern({
      id: "t2", typ: "puffer", bezeichnung: "Reparaturen", start: "2026-01-01",
      schaetzbetrag: 50000, fristMonate: 12,
    });

    rendere(<ToepfeScreen />);
    expect(await screen.findByText("Urlaub")).toBeInTheDocument();
    expect(await screen.findByText("Reparaturen")).toBeInTheDocument();
  });

  it("berücksichtigt eine reale Entnahme im angezeigten Stand", async () => {
    // Puffer über 12 Monate, Start weit in der Vergangenheit → voll angespart (50.000),
    // minus einer Entnahme von 100,00 → 400,00 müssen sichtbar werden.
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Giro", typ: "Giro", inhaberIds: [], saldo: 100000,
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "puffer", bezeichnung: "Reparaturen", start: "2020-01-01",
      schaetzbetrag: 50000, fristMonate: 12,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-01-05", betrag: -10000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "manuell",
      verwendung: { art: "topf", topfId: "t1" },
    });

    rendere(<ToepfeScreen />);
    expect(await screen.findByText("Reparaturen")).toBeInTheDocument();
    // Steht sowohl in der Kennzahl als auch auf der Karte.
    await waitFor(() => expect(screen.getAllByText(/400,00/).length).toBeGreaterThan(0));
  });

  it("öffnet das Anlegen-Formular über den Knopf", async () => {
    const nutzer = userEvent.setup();
    rendere(<ToepfeScreen />);
    const knopf = await screen.findByRole("button", { name: /anlegen|neu/i });
    await nutzer.click(knopf);
    // Im Formular muss mindestens ein Bezeichnungsfeld erscheinen.
    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0));
  });
});
