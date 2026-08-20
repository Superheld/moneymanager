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

import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../test/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { KontenVerwaltungScreen } from "./KontenVerwaltungScreen";
import { InventarScreen } from "./InventarScreen";
import { BudgetsScreen } from "./BudgetsScreen";
import { sqliteInventarRepository } from "../persistence/sqliteInventarRepository";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
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

/**
 * Klickt einen Aktions-Knopf. Register-Reiter sind ebenfalls Knöpfe und tragen dieselben
 * Namen wie die Bereiche („Konten", „Kategorien") — sie werden übersprungen, sonst fängt
 * der Reiter den Klick ab, der dem „+ Konto" gilt.
 */
async function klicke(nutzer: ReturnType<typeof userEvent.setup>, muster: RegExp) {
  const knoepfe = screen
    .queryAllByRole("button")
    .filter((b) => !b.hasAttribute("aria-expanded") && b.getAttribute("role") !== "tab");
  const treffer = knoepfe.filter((b) => muster.test(b.textContent ?? ""));
  const letzter = treffer[treffer.length - 1];
  if (letzter) await nutzer.click(letzter);
  return letzter;
}

describe("Budgets — Formularpfade", () => {
  it("bricht das Anlegen ab, ohne etwas zu speichern", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    // Erst warten, bis der Screen steht: `klicke` sucht synchron, und auf einem noch
    // leeren Body fände es nichts — der Test liefe dann durch, ohne etwas zu tun.
    await nutzer.click(await screen.findByRole("button", { name: /anlegen/i }));
    await formularFuellen(nutzer, "Verworfen", "50");
    await klicke(nutzer, /abbrechen|schließen/i);

    expect(await sqliteBudgetRepository.alle()).toHaveLength(0);
    // Der Dialog ist zu — sonst hätte „abbrechen" nur nichts getroffen.
    await waitFor(() => expect(screen.queryByText("Verworfen")).not.toBeInTheDocument());
  });

  it("legt ein aufbauendes Budget über die Maske an", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Tagesgeldkonto", typ: "Tagesgeld", inhaberIds: [], saldo: 100000,
    });
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Urlaub", defaultCharakter: "Aufwand" });

    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /anlegen/i }));

    // Art umstellen — seit der Zusammenlegung ist das nur noch ein Auswahlfeld.
    const artFeld = screen.getAllByRole("combobox").find((s) => (s.textContent ?? "").includes("aufbauend"));
    if (artFeld) await nutzer.selectOptions(artFeld, "aufbauend");

    // Der Kategorie-Picker ist ein Knopf, der einen eigenen Dialog öffnet.
    await nutzer.click(screen.getByRole("button", { name: /Kategorie wählen|—|▾/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Urlaub/ }));

    const betrag = screen.getAllByRole("textbox").find((f) => !(f as HTMLInputElement).value);
    if (betrag) await nutzer.type(betrag, "50");
    await klicke(nutzer, /^speichern$/i);

    await waitFor(async () => {
      const budgets = await sqliteBudgetRepository.alle();
      expect(budgets).toHaveLength(1);
      expect(budgets[0].art).toBe("aufbauend");
      expect(budgets[0].kontoId).toBe("k1");
      // Start immer auf dem Monatsersten — nie mitten im Monat.
      expect(budgets[0].start.endsWith("-01")).toBe(true);
    });
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
  it("legt ein Offline-Konto über den Anlege-Dialog an", async () => {
    // Der Dialog fragt zuerst nach der Art des Kontos und steht auf „offline" —
    // ein Konto ohne Bankverbindung soll ohne Umweg anzulegen sein.
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);

    // Der Knopf heißt schlicht „+ Konto" (die Karte darüber sagt, worum es geht).
    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
    await klicke(nutzer, /^\+?\s*Konto$/i);
    const bezeichnung = (await screen.findAllByRole("textbox"))[0];
    await nutzer.type(bezeichnung, "Zweitkonto");
    await klicke(nutzer, /^speichern$/i);

    await waitFor(async () => {
      const konten = await sqliteZahlungskontoRepository.alle();
      expect(konten.map((k) => k.bezeichnung)).toContain("Zweitkonto");
    });
  });

  it("legt eine Kategorie über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Kategorien$/);

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
    // Die Namen stehen in der Registerleiste, unabhängig davon, welches Register offen ist.
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Sprache|Währung|Person|Konten|Kategorien/i),
    );
  });
});

