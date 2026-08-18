/** @vitest-environment jsdom */
// Der Buchungsdialog in seinen drei Rollen — anlegen, Entwurf prüfen, bearbeiten.
//
// Der wichtigste Test hier ist der erste: das bloße ÖFFNEN eines Entwurfs darf nichts
// schreiben. Vorher lief „bestätigen & bearbeiten" — die Zeile wurde verbucht und danach
// der Bearbeiten-Dialog auf dem Ergebnis geöffnet. Aus Nutzersicht verschwand sie beim
// Hinsehen aus der Liste, und der einzige Ausweg hieß „Löschen", tat aber etwas anderes.
// Genau dieser Weg wird hier festgenagelt.
//
// Gesucht wird nach Daten, die der Test selbst angelegt hat, nicht nach Formulierungen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { KontenScreen } from "./KontenScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function grunddaten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await kontoRepo.speichern({ id: "k2", bezeichnung: "Zweitkonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-le", name: "Lebensmittel", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-so", name: "Sonstiges", defaultCharakter: "Aufwand" });
  // Nur Umsätze aus einem Abruf-Lauf landen im Block „Neu von der Bank".
  await laufRepo.speichern({ id: "l-fints", quelle: "fints", zeitpunkt: "2026-08-18T10:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
}

/** Eine abgerufene, noch nicht übernommene Zeile. */
async function entwurf(over: Record<string, unknown> = {}) {
  await umsatzRepo.speichern({
    id: "e1", laufId: "l-fints", zahlungskontoId: "k1", buchungstag: "2026-08-17",
    betrag: -4990, waehrung: "EUR", gegenpartei: "Testhaendler Nord",
    verwendungszweck: "Einkauf", rohHash: "h-e1", status: "neu",
    vorschlag: { kategorieId: "kat-so", charakter: "Aufwand", quelle: "ki" },
    ...over,
  });
}

/** Öffnet den Entwurfs-Dialog aus dem Block „Neu von der Bank" und liefert ihn zurück. */
async function entwurfOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Testhaendler Nord");
  await nutzer.click(await screen.findByRole("button", { name: /ansehen & bearbeiten/i }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: /übernehmen/i });
  return within(dialog);
}

describe("Entwurf prüfen", () => {
  it("schreibt beim bloßen Öffnen und Abbrechen nichts", async () => {
    // Der gemeldete Fehler: die Zeile verschwand aus der Liste, sobald der Dialog aufging.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /abbrechen/i }));

    const nachher = (await umsatzRepo.alle()).find((u) => u.id === "e1");
    expect(nachher?.status).toBe("neu");
    expect(nachher?.istbuchungId).toBeUndefined();
    expect(await ledgerRepo.alle()).toHaveLength(0);
    // Und sie steht wieder da, wo sie war.
    expect(await screen.findByText("Testhaendler Nord")).toBeInTheDocument();
  });

  it("übernimmt mit dem im Dialog gewählten Konto und der gewählten Kategorie", async () => {
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.selectOptions(dialog.getByRole("combobox", { name: /^Konto$/ }), "k2");
    await nutzer.click(await dialog.findByRole("button", { name: /Sonstiges/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel/ }));
    await nutzer.click(dialog.getByRole("button", { name: /übernehmen/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(1));
    const gebucht = (await ledgerRepo.alle())[0];
    expect(gebucht.kontoId).toBe("k2");
    expect(gebucht.kategorieId).toBe("kat-le");
    // Der Betrag stammt von der Bank und wurde nicht angefasst.
    expect(gebucht.betrag).toBe(-4990);
    const nachher = (await umsatzRepo.alle()).find((u) => u.id === "e1");
    expect(nachher?.status).toBe("verbucht");
    // Der Konto-Match zieht mit, sonst zeigte die Herkunft weiter aufs alte Konto.
    expect(nachher?.zahlungskontoId).toBe("k2");
  });

  it("lässt Tag und Betrag der Bank nicht ändern", async () => {
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await entwurfOeffnen(nutzer);

    // Beides ist die Aussage der Bank — im Entwurf steht sie nur da.
    expect(dialog.getByRole("textbox", { name: /^Betrag$/ })).toBeDisabled();
    expect(dialog.getByRole("combobox", { name: /^Konto$/ })).toBeEnabled();
  });

  it("verwirft, ohne die Zeile zu löschen", async () => {
    // „Verworfen ist verworfen" — die Daten bleiben, markiert, und werden übersprungen.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /^verwerfen$/i }));

    await waitFor(async () =>
      expect((await umsatzRepo.alle()).find((u) => u.id === "e1")?.status).toBe("verworfen"),
    );
    expect(await umsatzRepo.alle()).toHaveLength(1);
    expect(await ledgerRepo.alle()).toHaveLength(0);
  });

  it("meldet einen Dublettenverdacht, bevor irgendetwas gebucht ist", async () => {
    await grunddaten();
    await entwurf();
    // Dieselbe Zahlung liegt schon auf dem Konto — gleicher Betrag, gleicher Tag,
    // gleicher Empfänger.
    await umsatzRepo.speichern({
      id: "alt", laufId: "l-fints", zahlungskontoId: "k1", buchungstag: "2026-08-17",
      betrag: -4990, waehrung: "EUR", gegenpartei: "Testhaendler Nord",
      verwendungszweck: "Einkauf", rohHash: "h-alt", status: "verbucht", istbuchungId: "b-alt",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const dialog = await entwurfOeffnen(nutzer);

    expect(dialog.getByText(/schon vorhanden|Dublette/)).toBeInTheDocument();
  });
});

describe("Buchung von Hand anlegen", () => {
  it("legt sie auf dem im Dialog gewählten Konto an", async () => {
    // Das Konto fehlte in der alten Anlege-Maske ganz — es kam mit der Zusammenführung.
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByRole("button", { name: /^\+?\s*Buchung$/ }))[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByRole("combobox", { name: /^Konto$/ });

    await nutzer.selectOptions(dialog.getByRole("combobox", { name: /^Konto$/ }), "k2");
    await nutzer.type(dialog.getByRole("textbox", { name: /^Betrag$/ }), "12,50");
    await nutzer.click(dialog.getByRole("button", { name: /speichern/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(1));
    const gebucht = (await ledgerRepo.alle())[0];
    expect(gebucht.kontoId).toBe("k2");
    expect(gebucht.betrag).toBe(-1250);
    expect(gebucht.quelle).toBe("manuell");
  });
});
