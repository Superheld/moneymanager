/** @vitest-environment jsdom */
// Eine Buchung auf mehrere Kategorien aufteilen — und wieder auflösen.
//
// Der Weg war ungetestet, und er trägt eine Regel, die still danebengehen kann: die
// Teilbeträge müssen den Betrag der Buchung GENAU treffen. Geht das durch, stünde in der
// Analyse mehr oder weniger Geld, als tatsächlich geflossen ist — und zwar unauffällig,
// weil jede einzelne Zeile für sich plausibel aussieht.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KontenScreen } from "../konten/KontenScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../../persistence/sqliteLedgerRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Ein Konto, zwei Kategorien und eine gebuchte Zahlung über 90,00. */
async function bestand() {
  await kontoRepo.speichern({ id: "kt", bezeichnung: "Alltagskonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-a", name: "Haushalt", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-b", name: "Werkzeug", defaultCharakter: "Aufwand" });
  await ledgerRepo.speichern({
    id: "b-split", kontoId: "kt", datum: "2026-08-14", betrag: -9000,
    charakter: "Aufwand", quelle: "manuell", kategorieId: "kat-a",
    notiz: "Sammelposten Ohlert",
  });
}

/** Öffnet den Bearbeiten-Dialog der Buchung und startet die Aufteilung. */
async function aufteilenOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Sammelposten Ohlert");
  await nutzer.click((await screen.findAllByRole("button", { name: /bearbeiten/i }))[0]);
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: /übernehmen|speichern/i });
  await nutzer.click(await within(dialog).findByRole("button", { name: /auf kategorien aufteilen/i }));
  return within(await screen.findByRole("dialog"));
}

/**
 * Füllt eine Zeile der Aufteilung. Die Kategorie steckt hinter dem CategoryPicker — einem
 * Knopf mit Auswahlliste, keinem `select` —, deshalb der Weg über die Zeile des Betragsfelds.
 */
async function zeileFuellen(
  nutzer: ReturnType<typeof userEvent.setup>,
  nr: number,
  kategorie: string,
  betrag: string,
) {
  const feld = await screen.findByLabelText(`Betrag ${nr}`);
  const zeile = feld.closest("div")!;
  await nutzer.click(within(zeile).getAllByRole("button")[0]);
  const treffer = await screen.findAllByText(kategorie);
  await nutzer.click(treffer[treffer.length - 1]);
  await nutzer.clear(feld);
  await nutzer.type(feld, betrag);
}

describe("Buchung aufteilen", () => {
  it("legt die Teile an, wenn sie den Betrag genau treffen", async () => {
    const nutzer = userEvent.setup();
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await aufteilenOeffnen(nutzer);

    await zeileFuellen(nutzer, 1, "Haushalt", "55");
    await zeileFuellen(nutzer, 2, "Werkzeug", "35");
    await nutzer.click(dialog.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const b = (await ledgerRepo.alle()).find((x) => x.id === "b-split");
      expect(b?.aufteilungen).toHaveLength(2);
      // Die Summe der Teile ist der Betrag der Buchung — nichts entsteht, nichts verschwindet.
      expect(b!.aufteilungen!.reduce((s, a) => s + a.betrag, 0)).toBe(-9000);
    });
  });

  it("weist eine Aufteilung zurück, die den Betrag verfehlt", async () => {
    const nutzer = userEvent.setup();
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await aufteilenOeffnen(nutzer);

    // 55 + 20 = 75, die Buchung lautet aber auf 90.
    await zeileFuellen(nutzer, 1, "Haushalt", "55");
    await zeileFuellen(nutzer, 2, "Werkzeug", "20");
    await nutzer.click(dialog.getByRole("button", { name: /^speichern$/i }));

    await waitFor(() => expect(document.body.textContent).toMatch(/genau treffen/i));
    const b = (await ledgerRepo.alle()).find((x) => x.id === "b-split");
    expect(b?.aufteilungen ?? []).toHaveLength(0);
  });
});
