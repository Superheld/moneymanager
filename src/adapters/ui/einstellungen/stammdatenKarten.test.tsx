/** @vitest-environment jsdom */
// Personen und Kategorien — die Wege, die `stammdaten.test.tsx` nicht fährt: bearbeiten,
// löschen nach Rückfrage, und was passiert, wenn der Use-Case ablehnt. Jeweils bis in die
// Datenbank geprüft.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KategorienCard, PersonenCard } from "./StammdatenKarten";
import { sqliteKategorieRepository, sqlitePersonRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const k = (key: string, werte?: Record<string, unknown>) => i18n.t(key, werte);

describe("PersonenCard", () => {
  it("übernimmt eine Änderung aus dem Bearbeiten-Dialog in die Datenbank", async () => {
    await sqlitePersonRepository.speichern({ id: "p1", name: "Alma", rolle: "Erwachsen" });
    const geaendert = vi.fn();
    const nutzer = userEvent.setup();
    rendere(<PersonenCard personen={[{ id: "p1", name: "Alma", rolle: "Erwachsen" }]} onChange={geaendert} />);

    await nutzer.click(await screen.findByRole("button", { name: k("einstellungen.bearbeiten") }));
    const dialog = within(await screen.findByRole("dialog"));
    const name = dialog.getByRole("textbox", { name: k("einstellungen.person.feldName") });
    expect(name).toHaveValue("Alma");
    await nutzer.clear(name);
    await nutzer.type(name, "Alma B.");
    await nutzer.click(dialog.getByRole("button", { name: k("einstellungen.speichern") }));

    await waitFor(() => expect(geaendert).toHaveBeenCalled());
    expect((await sqlitePersonRepository.alle()).map((p) => p.name)).toEqual(["Alma B."]);
  });

  it("zeigt die Ablehnung des Use-Cases im Dialog, statt still zu schliessen", async () => {
    const nutzer = userEvent.setup();
    rendere(<PersonenCard personen={[]} onChange={() => {}} />);
    await nutzer.click(await screen.findByRole("button", { name: new RegExp(k("einstellungen.person.anlegen")) }));
    const dialog = within(await screen.findByRole("dialog"));
    // Ohne Namen lehnt `personAnlegen` ab.
    await nutzer.click(dialog.getByRole("button", { name: k("einstellungen.speichern") }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".err")?.textContent).toBeTruthy());
  });

  it("löscht erst nach der Rückfrage", async () => {
    await sqlitePersonRepository.speichern({ id: "p1", name: "Bodo" });
    const geaendert = vi.fn();
    const nutzer = userEvent.setup();
    rendere(<PersonenCard personen={[{ id: "p1", name: "Bodo" }]} onChange={geaendert} />);

    await nutzer.click(await screen.findByRole("button", { name: k("einstellungen.loeschen") }));
    expect(await sqlitePersonRepository.alle()).toHaveLength(1);
    await nutzer.click(await screen.findByRole("button", { name: k("loeschen.bestaetigen") }));

    await waitFor(() => expect(geaendert).toHaveBeenCalled());
    expect(await sqlitePersonRepository.alle()).toHaveLength(0);
  });
});

describe("KategorienCard", () => {
  const wohnen = { id: "kat-w", name: "Wohnen", defaultCharakter: "Aufwand" as const };

  it("benennt eine Kategorie im Bearbeiten-Dialog um", async () => {
    await sqliteKategorieRepository.speichern(wohnen);
    const geaendert = vi.fn();
    const nutzer = userEvent.setup();
    rendere(<KategorienCard kategorien={[wohnen]} onChange={geaendert} />);

    await nutzer.click(await screen.findByRole("button", { name: k("einstellungen.bearbeiten") }));
    const dialog = within(await screen.findByRole("dialog"));
    const name = dialog.getByRole("textbox", { name: k("einstellungen.kategorie.feldName") });
    expect(name).toHaveValue("Wohnen");
    await nutzer.clear(name);
    await nutzer.type(name, "Wohnen & Haus");
    await nutzer.click(dialog.getByRole("button", { name: k("einstellungen.speichern") }));

    await waitFor(() => expect(geaendert).toHaveBeenCalled());
    expect((await sqliteKategorieRepository.alle()).map((x) => x.name)).toEqual(["Wohnen & Haus"]);
  });

  it("löscht eine Kategorie nach der Rückfrage", async () => {
    await sqliteKategorieRepository.speichern(wohnen);
    const geaendert = vi.fn();
    const nutzer = userEvent.setup();
    rendere(<KategorienCard kategorien={[wohnen]} onChange={geaendert} />);

    await nutzer.click(await screen.findByRole("button", { name: k("einstellungen.loeschen") }));
    await nutzer.click(await screen.findByRole("button", { name: k("loeschen.bestaetigen") }));

    await waitFor(() => expect(geaendert).toHaveBeenCalled());
    expect(await sqliteKategorieRepository.alle()).toHaveLength(0);
  });

  it("legt die Standardkategorien auf Knopfdruck an", async () => {
    const geaendert = vi.fn();
    const nutzer = userEvent.setup();
    rendere(<KategorienCard kategorien={[]} onChange={geaendert} />);
    await nutzer.click(await screen.findByRole("button", { name: k("einstellungen.kategorie.standardLaden") }));
    await waitFor(() => expect(geaendert).toHaveBeenCalled());
    expect((await sqliteKategorieRepository.alle()).length).toBeGreaterThan(0);
  });

  it("zeigt die Ablehnung im Dialog", async () => {
    const nutzer = userEvent.setup();
    rendere(<KategorienCard kategorien={[]} onChange={() => {}} />);
    await nutzer.click(await screen.findByRole("button", { name: new RegExp(k("einstellungen.kategorie.anlegen")) }));
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.click(dialog.getByRole("button", { name: k("einstellungen.speichern") }));
    await waitFor(() => expect(document.querySelector(".err")?.textContent).toBeTruthy());
  });
});
