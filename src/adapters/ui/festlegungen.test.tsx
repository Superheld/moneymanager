/** @vitest-environment jsdom */
// Kategorie-Festlegungen — vom Korrigieren einer Zeile bis in die Tabelle.
//
// Der Weg ist das Interessante, nicht die Formulierung: eine Festlegung entsteht NUR auf
// ausdrückliche Zustimmung, sie zieht die übrigen offenen Zeilen desselben Empfängers mit,
// und sie lässt sich in den Einstellungen wieder aufheben. Gesucht wird nach Daten, die
// der Test selbst angelegt hat.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../test/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { KontenScreen } from "./KontenScreen";
import { ReviewScreen } from "./ReviewScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteKategoriefestlegungRepository as festlegungRepo } from "../persistence/sqliteKategoriefestlegungRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
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
  await kategorieRepo.speichern({ id: "kat-kb", name: "Kinderbetreuung", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-so", name: "Sonstiges", defaultCharakter: "Aufwand" });
}

/** Eine offene Zeile in der Inbox, standardmäßig mit einem Vorschlag der Erkennung. */
async function offeneZeile(id: string, over: { quelle?: "ki" | "manuell"; kategorieId?: string } = {}) {
  await umsatzRepo.speichern({
    id, laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
    betrag: -37500, waehrung: "EUR", gegenpartei: "Britta Musterfrau",
    verwendungszweck: "Betreuung", rohHash: `h-${id}`, status: "neu",
    vorschlag: { kategorieId: over.kategorieId ?? "kat-so", charakter: "Aufwand", quelle: over.quelle ?? "ki" },
  });
}

/**
 * Korrigiert die Kategorie einer Tabellenzeile über den CategoryPicker: Knopf in der
 * Zeile öffnet ein Such-Modal, dort die Zielkategorie anklicken.
 */
async function korrigiere(
  nutzer: { click: (el: Element) => Promise<void> },
  zeile: number,
  ziel: string,
): Promise<void> {
  const zeilen = screen.getAllByRole("row").slice(1); // ohne Kopfzeile
  await nutzer.click(within(zeilen[zeile]).getAllByRole("button")[0]);
  await nutzer.click(await screen.findByRole("button", { name: new RegExp(ziel) }));
}

describe("Festlegung aus der Import-Inbox", () => {
  it("bietet nach einer Korrektur an, den Empfänger festzulegen", async () => {
    await grunddaten();
    await offeneZeile("u1");
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText("Britta Musterfrau")).toBeInTheDocument());

    await korrigiere(nutzer, 0, "Kinderbetreuung");

    // Das Muster ist die normalisierte Form des Empfängers.
    await waitFor(() => expect(document.body.textContent).toMatch(/britta musterfrau/));
  });

  it("legt ohne Zustimmung NICHTS an", async () => {
    // Der Kern der Zusage: die Korrektur ändert diese eine Zeile, sonst nichts.
    await grunddaten();
    await offeneZeile("u1");
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText("Britta Musterfrau")).toBeInTheDocument());

    await korrigiere(nutzer, 0, "Kinderbetreuung");
    await waitFor(() => expect(document.body.textContent).toMatch(/britta musterfrau/));

    expect(await festlegungRepo.alle()).toHaveLength(0);
  });

  it("schreibt die Festlegung erst auf Zustimmung", async () => {
    await grunddaten();
    await offeneZeile("u1");
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText("Britta Musterfrau")).toBeInTheDocument());

    await korrigiere(nutzer, 0, "Kinderbetreuung");
    await waitFor(() => expect(document.body.textContent).toMatch(/britta musterfrau/));
    await nutzer.click(screen.getByRole("button", { name: /immer so/i }));

    await waitFor(async () => {
      const alle = await festlegungRepo.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0]).toMatchObject({ muster: "britta musterfrau", kategorieId: "kat-kb" });
    });
  });

  it("zieht die übrigen offenen Zeilen desselben Empfängers mit", async () => {
    // Wer bei einer von drei Zahlungen „immer so" sagt und danach zwei falsche Zeilen
    // stehen sieht, hat die Zusage nicht eingelöst bekommen.
    await grunddaten();
    await offeneZeile("u1");
    await offeneZeile("u2");
    await offeneZeile("u3");
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await waitFor(() => expect(screen.getAllByText("Britta Musterfrau")).toHaveLength(3));

    await korrigiere(nutzer, 0, "Kinderbetreuung");
    await waitFor(() => expect(document.body.textContent).toMatch(/britta musterfrau/));
    await nutzer.click(screen.getByRole("button", { name: /immer so/i }));

    await waitFor(async () => {
      const offen = await umsatzRepo.offene();
      expect(offen.filter((u) => u.vorschlag?.kategorieId === "kat-kb")).toHaveLength(3);
    });
    const offen = await umsatzRepo.offene();
    expect(offen.find((u) => u.id === "u2")?.vorschlag?.quelle).toBe("festlegung");
  });

  it("überschreibt keine Zeile, an der jemand von Hand entschieden hat", async () => {
    await grunddaten();
    await offeneZeile("u1");
    await offeneZeile("u2", { quelle: "manuell", kategorieId: "kat-so" });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await waitFor(() => expect(screen.getAllByText("Britta Musterfrau")).toHaveLength(2));

    await korrigiere(nutzer, 0, "Kinderbetreuung");
    await waitFor(() => expect(document.body.textContent).toMatch(/britta musterfrau/));
    await nutzer.click(screen.getByRole("button", { name: /immer so/i }));

    await waitFor(async () => expect(await festlegungRepo.alle()).toHaveLength(1));
    const offen = await umsatzRepo.offene();
    expect(offen.find((u) => u.id === "u2")?.vorschlag?.kategorieId).toBe("kat-so");
  });

  it("setzt die Kategorie bei einer neuen Zeile ohne Umweg über das Modell", async () => {
    await grunddaten();
    await festlegungRepo.speichern({ muster: "britta musterfrau", kategorieId: "kat-kb", angelegtAm: "2026-08-17T10:00:00.000Z" });
    await umsatzRepo.speichern({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
      betrag: -37500, waehrung: "EUR", gegenpartei: "Britta Musterfrau",
      verwendungszweck: "Betreuung", rohHash: "h1", status: "neu",
      vorschlag: { kategorieId: "kat-kb", charakter: "Aufwand", quelle: "festlegung" },
    });
    rendere(<ReviewScreen />);

    // Die Herkunfts-Pille zeigt, dass hier nicht geraten wurde.
    await waitFor(() => expect(screen.getAllByText("Festgelegt").length).toBeGreaterThan(0));
  });
});

describe("Festlegung aus dem Buchungsdialog", () => {
  /** Eine verbuchte Zahlung samt ihrem Umsatz — der trägt den Empfänger. */
  async function verbuchteZahlung() {
    await grunddaten();
    await ledgerRepo.speichern({
      id: "b1", datum: "2026-03-01", betrag: -37500, kontoId: "k1",
      kategorieId: "kat-so", charakter: "Aufwand", quelle: "import",
    });
    await umsatzRepo.speichern({
      id: "u-b1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
      betrag: -37500, waehrung: "EUR", gegenpartei: "Britta Musterfrau",
      verwendungszweck: "Betreuung", rohHash: "h-b1", status: "verbucht", istbuchungId: "b1",
    });
  }

  async function dialogOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);
  }

  it("bietet den Haken erst an, wenn die Kategorie geändert wurde", async () => {
    // Ein dauerhaft sichtbarer Haken wäre eine Einladung, beim Durchsehen nebenbei
    // Regeln anzulegen.
    await verbuchteZahlung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await dialogOeffnen(nutzer);

    expect(screen.queryByRole("checkbox")).toBeNull();

    await nutzer.click(await screen.findByRole("button", { name: /Sonstiges/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Kinderbetreuung/ }));

    await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
  });

  it("schreibt die Festlegung nur mit gesetztem Haken", async () => {
    await verbuchteZahlung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await dialogOeffnen(nutzer);

    await nutzer.click(await screen.findByRole("button", { name: /Sonstiges/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Kinderbetreuung/ }));
    await nutzer.click(await screen.findByRole("checkbox"));
    await nutzer.click(screen.getByRole("button", { name: /speichern/i }));

    await waitFor(async () => {
      const alle = await festlegungRepo.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0]).toMatchObject({ muster: "britta musterfrau", kategorieId: "kat-kb" });
    });
    // Die Buchung selbst trägt die neue Kategorie — beides gehört zusammen.
    expect((await ledgerRepo.alle()).find((b) => b.id === "b1")?.kategorieId).toBe("kat-kb");
  });

  it("ändert ohne Haken nur die eine Buchung", async () => {
    await verbuchteZahlung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await dialogOeffnen(nutzer);

    await nutzer.click(await screen.findByRole("button", { name: /Sonstiges/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Kinderbetreuung/ }));
    await nutzer.click(screen.getByRole("button", { name: /speichern/i }));

    await waitFor(async () =>
      expect((await ledgerRepo.alle()).find((b) => b.id === "b1")?.kategorieId).toBe("kat-kb"),
    );
    expect(await festlegungRepo.alle()).toHaveLength(0);
  });
});

describe("Festlegungen in den Einstellungen", () => {
  it("listet die Festlegung mit ihrer Kategorie", async () => {
    await grunddaten();
    await festlegungRepo.speichern({ muster: "britta musterfrau", kategorieId: "kat-kb", angelegtAm: "2026-08-17T10:00:00.000Z" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Festlegungen$/);

    await waitFor(() => expect(screen.getByText("britta musterfrau")).toBeInTheDocument());
    expect(screen.getAllByText("Kinderbetreuung").length).toBeGreaterThan(0);
  });

  it("hebt eine Festlegung wieder auf", async () => {
    // Ohne den Rückweg wäre sie eine Einbahnstraße, die auf jeden künftigen Import wirkt.
    await grunddaten();
    await festlegungRepo.speichern({ muster: "britta musterfrau", kategorieId: "kat-kb", angelegtAm: "2026-08-17T10:00:00.000Z" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Festlegungen$/);
    await waitFor(() => expect(screen.getByText("britta musterfrau")).toBeInTheDocument());

    await nutzer.click(screen.getByRole("button", { name: /aufheben/i }));

    await waitFor(async () => expect(await festlegungRepo.alle()).toHaveLength(0));
  });

  it("benennt eine Festlegung auf eine gelöschte Kategorie, statt sie zu verstecken", async () => {
    // Sie wirkt weiter (die Kette lässt sie dann durchfallen) — genau deshalb muss sie
    // auffindbar sein.
    await grunddaten();
    await festlegungRepo.speichern({ muster: "irgendwer", kategorieId: "gibt-es-nicht", angelegtAm: "2026-08-17T10:00:00.000Z" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Festlegungen$/);

    await waitFor(() => expect(screen.getByText("irgendwer")).toBeInTheDocument());
    expect(document.body.textContent).toMatch(/gelöscht/i);
  });
});
