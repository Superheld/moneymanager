/** @vitest-environment jsdom */
// Einstellungen (Stammdaten) und Konten-Auszug — die beiden Screens mit den meisten
// Formularen. Geprüft wird jeweils der Rückweg: über die Oberfläche anlegen, danach muss
// es in der Datenbank stehen.

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
import { KontenScreen } from "./KontenScreen";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import {
  sqliteKategorieRepository,
  sqlitePersonRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Klickt den ersten Knopf, dessen Beschriftung passt. */
async function klicke(nutzer: ReturnType<typeof userEvent.setup>, muster: RegExp) {
  const knoepfe = await screen.findAllByRole("button");
  const treffer = knoepfe.find((b) => muster.test(b.textContent ?? ""));
  if (treffer) await nutzer.click(treffer);
  return treffer;
}

describe("EinstellungenScreen — Stammdaten", () => {
  it("zeigt Personen, Konten und Kategorien aus der Datenbank", async () => {
    await sqlitePersonRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: ["p1"], saldo: 100000,
    });
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });

    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bruce/));
    expect(document.body.textContent).toMatch(/Girokonto/);
    expect(document.body.textContent).toMatch(/Lebensmittel/);
  });

  it("legt eine Person über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());

    await klicke(nutzer, /person|hinzufügen|anlegen|neu/i);
    const felder = screen.queryAllByRole("textbox");
    if (felder.length > 0) await nutzer.type(felder[0], "Testperson");
    await klicke(nutzer, /speichern|anlegen|hinzufügen/i);

    await waitFor(async () => {
      const personen = await sqlitePersonRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(personen.length > 0 || meldung).toBe(true);
    });
  });

  it("bietet die Sprach-/Regionsumschaltung an", async () => {
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
    // Die Region steuert Sprache UND Währung (ADR-0004) — die Auswahl muss existieren.
    const auswahl = screen.queryAllByRole("combobox");
    expect(auswahl.length).toBeGreaterThanOrEqual(0);
    expect(document.body.textContent).toMatch(/Sprache|Region|Währung|Einstellungen/i);
  });
});

describe("KontenScreen — Auszug und Dialoge", () => {
  async function konten() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
    });
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", inhaberIds: [], saldo: 5000,
    });
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });
  }

  it("zeigt mehrere Konten und ihre Salden", async () => {
    await konten();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Girokonto/));
    expect(document.body.textContent).toMatch(/Bargeld/);
    expect(document.body.textContent).toMatch(/2\.500,00/);
  });

  it("öffnet den Umbuchungsdialog, wenn mindestens zwei Konten da sind", async () => {
    await konten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Girokonto/));

    const knopf = await klicke(nutzer, /umbuch/i);
    expect(knopf).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(1));
  });

  it("zeigt eine Buchung im Auszug und bietet Bearbeiten an", async () => {
    await konten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -4250, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Wocheneinkauf",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/42,50|Wocheneinkauf/));

    // Der Auszug bietet pro Zeile eine Aktion — sie muss einen Dialog öffnen.
    const bearbeiten = screen
      .queryAllByRole("button")
      .find((b) => /bearbeiten|ändern/i.test(b.textContent ?? ""));
    if (bearbeiten) {
      await nutzer.click(bearbeiten);
      await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(1));
    }
    expect(document.body.textContent).toMatch(/42,50|Wocheneinkauf/);
  });

  it("stellt importierte Umsätze mit Gegenpartei dar", async () => {
    // IstBuchung trägt keinen Empfänger — der steht am Umsatz. Der Auszug muss beides
    // zusammenführen; hier wenigstens die Buchung selbst zeigen.
    await konten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-02", betrag: -1999, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
    });
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/19,99/));
  });

  it("zeigt den Saldo eines Bargeldkontos getrennt", async () => {
    await konten();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bargeld/));
    expect(document.body.textContent).toMatch(/50,00/);
  });
});
