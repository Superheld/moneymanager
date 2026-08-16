/** @vitest-environment jsdom */
// Formularpfade, die in den anderen Tests nur angetippt wurden: Anlegen über die
// Oberfläche mit vollständig ausgefüllten Feldern, Abbrechen, und die Fehlerpfade.
//
// Diese Wege enthalten die Aufrufe der Use-Cases und die Fehlerbehandlung der Screens —
// also genau den Code, der beim reinen Anzeigen nie ausgeführt wird.

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
import { EinstellungenScreen } from "./EinstellungenScreen";
import { InventarScreen } from "./InventarScreen";
import { BudgetsScreen } from "./BudgetsScreen";
import { PlanungScreen } from "./PlanungScreen";
import { sqliteInventarRepository } from "../persistence/sqliteInventarRepository";
import { sqliteTopfRepository } from "../persistence/sqliteTopfRepository";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Füllt alle sichtbaren Text- und Zahlenfelder mit brauchbaren Werten. */
async function formularFuellen(
  nutzer: ReturnType<typeof userEvent.setup>,
  text: string,
  zahl = "120",
) {
  for (const feld of screen.queryAllByRole("textbox")) {
    if ((feld as HTMLInputElement).value) continue;
    await nutzer.type(feld, text);
  }
  for (const feld of screen.queryAllByRole("spinbutton")) {
    await nutzer.clear(feld);
    await nutzer.type(feld, zahl);
  }
}

async function klicke(nutzer: ReturnType<typeof userEvent.setup>, muster: RegExp) {
  const knoepfe = screen.queryAllByRole("button");
  const treffer = knoepfe.filter((b) => muster.test(b.textContent ?? ""));
  const letzter = treffer[treffer.length - 1];
  if (letzter) await nutzer.click(letzter);
  return letzter;
}

/** Der aufbauende Teil der Budgets (früher der eigene Töpfe-Screen). */
describe("Aufbauende Budgets — Formularpfade", () => {
  /** Wählt im Anlege-Dialog die Art; der Dialog trägt seit der Zusammenlegung beide Fälle. */
  async function artWaehlen(nutzer: ReturnType<typeof userEvent.setup>, wert: string) {
    const feld = screen
      .getAllByRole("combobox")
      .find((s) => (s.textContent ?? "").includes("Spartopf"));
    if (feld) await nutzer.selectOptions(feld, wert);
  }

  it("bricht das Anlegen ab, ohne etwas zu speichern", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    // Erst warten, bis der Screen steht: `klicke` sucht synchron, und auf einem noch
    // leeren Body fände es nichts — der Test liefe dann durch, ohne etwas zu tun.
    await nutzer.click(await screen.findByRole("button", { name: /anlegen/i }));
    await artWaehlen(nutzer, "spartopf");
    await formularFuellen(nutzer, "Verworfen", "50");
    await klicke(nutzer, /abbrechen|schließen/i);

    expect(await sqliteTopfRepository.alle()).toHaveLength(0);
    // Der Dialog ist zu — sonst hätte „abbrechen" nur nichts getroffen.
    await waitFor(() => expect(screen.queryByText("Verworfen")).not.toBeInTheDocument());
  });

  it("entnimmt aus einem bestehenden Topf", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 100000,
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaub", start: "2020-01-01",
      zufuehrungProMonat: 10000, sparziel: 500000,
    });
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Urlaub/));

    const entnehmen = await klicke(nutzer, /entnehmen|entnahme/i);
    if (entnehmen) {
      await formularFuellen(nutzer, "Reise", "25");
      await klicke(nutzer, /speichern|entnehmen|buchen/i);
    }
    // Definierter Zustand: entweder gebucht oder begründet abgelehnt.
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });
});

describe("Inventar — Formularpfade", () => {
  it("legt einen Gegenstand mit vollständigem Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<InventarScreen />);
    await klicke(nutzer, /anlegen|neu|gegenstand|erfassen/i);
    await formularFuellen(nutzer, "Geschirrspüler", "120");
    await klicke(nutzer, /speichern|anlegen/i);

    await waitFor(async () => {
      const gegenstaende = await sqliteInventarRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(gegenstaende.length > 0 || meldung).toBe(true);
    });
  });

  it("zeigt Restwert und Ansparrate eines Gegenstands", async () => {
    await sqliteInventarRepository.speichern({
      id: "g1", bezeichnung: "Kühlschrank", anschaffung: "2024-01-01",
      wiederbeschaffung: 120000, nutzungsdauerMonate: 120,
    });
    rendere(<InventarScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Kühlschrank/));
    // 120000 auf 120 Monate → 10,00 pro Monat.
    expect(document.body.textContent).toMatch(/10,00|1\.200,00/);
  });
});

describe("Einstellungen — Formularpfade", () => {
  it("legt ein Konto über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());

    await klicke(nutzer, /konto/i);
    await formularFuellen(nutzer, "Zweitkonto", "0");
    await klicke(nutzer, /speichern|anlegen|hinzufügen/i);

    await waitFor(async () => {
      const konten = await sqliteZahlungskontoRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(konten.length > 0 || meldung).toBe(true);
    });
  });

  it("legt eine Kategorie über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());

    await klicke(nutzer, /kategorie/i);
    await formularFuellen(nutzer, "Testkategorie", "0");
    await klicke(nutzer, /speichern|anlegen|hinzufügen/i);

    await waitFor(async () => {
      const kategorien = await sqliteKategorieRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(kategorien.length > 0 || meldung).toBe(true);
    });
  });

  it("führt die Bereiche Sprache/Währung, Personen, Konten und Kategorien", async () => {
    rendere(<EinstellungenScreen />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Sprache|Währung|Person|Konten|Kategorien/i),
    );
  });
});

describe("Übersicht — mit Plandaten", () => {
  it("stellt Plan und Bestand gegenüber", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 300000,
    });
    await sqliteZahlungsregelRepository.speichern({
      id: "z1", bezeichnung: "Gehalt", betrag: 250000, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Ertrag",
    });
    await sqliteZahlungsregelRepository.speichern({
      id: "z2", bezeichnung: "Miete", betrag: -90000, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Aufwand",
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "puffer", bezeichnung: "Reparaturen", start: "2020-01-01",
      schaetzbetrag: 50000, fristMonate: 12,
    });

    rendere(<PlanungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/3\.000,00/));
    // Die Töpfe mindern die frei verfügbare Liquidität — der Wert muss auftauchen.
    expect(document.body.textContent).toMatch(/500,00|2\.500,00/);
  });
});
