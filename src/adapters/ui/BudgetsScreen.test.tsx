/** @vitest-environment jsdom */
// Budgets-Screen — Integrationstest von der Oberfläche bis ins Schema.
//
// `getDb` zeigt auf eine frische In-Memory-SQLite; alles dazwischen (Repositories,
// Use-Cases, Kern) läuft echt. Ein falsches Spalten-Mapping fällt hier deshalb genauso
// auf wie eine kaputte Anzeige.
//
// Seit der Zusammenlegung zu EINEM Aggregat (2026-08-19) prüft diese Datei beide Arten
// an einem Screen — inklusive der Verrechnung, die dabei neu dazugekommen ist: ein
// Budget, das in einem anderen liegt, wird aus dessen Betrag herausgerechnet.

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
import { BudgetsScreen } from "./BudgetsScreen";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
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

/** Das Auswahlfeld für die Art. */
function artFeld(): HTMLElement {
  const treffer = screen
    .getAllByRole("combobox")
    .find((s) => (s.textContent ?? "").includes("aufbauend"));
  if (!treffer) throw new Error("Art-Auswahl nicht gefunden");
  return treffer;
}

async function stammdatenBasis() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
  });
  await sqliteZahlungskontoRepository.speichern({
    id: "k2", bezeichnung: "Tagesgeldkonto", typ: "Tagesgeld", inhaberIds: [], saldo: 500000,
  });
}

describe("BudgetsScreen", () => {
  it("zeigt im Leerzustand keine leeren Kennzahlen", async () => {
    rendere(<BudgetsScreen />);
    expect((await screen.findAllByText("Budgets")).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Noch keine Budgets/));
    // Leere Kacheln (0,00 € überall) sähen aus wie ein Datenfehler.
    expect(document.body.textContent).not.toMatch(/Auslastung/);
  });

  /** Der Punkt der Zusammenlegung: beide Arten stehen in EINER Liste. */
  it("zeigt monatliche und aufbauende Budgets nebeneinander", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "kat2", name: "Urlaubskasse", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betragProMonat: 40000, art: "monatlich", start: "2026-01-01",
    });
    await sqliteBudgetRepository.speichern({
      id: "b2", kategorieId: "kat2", kontoId: "k2", betragProMonat: 10000, art: "aufbauend", start: "2026-01-01",
    });

    rendere(<BudgetsScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    expect(await screen.findByText("Urlaubskasse")).toBeInTheDocument();
    // Das Konto steht in der Zeile — es ist die Deckung hinter der Zahl.
    expect(screen.getAllByText("Tagesgeldkonto").length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));
  });

  it("rechnet ein eingebettetes Budget aus seinem Dach heraus", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "frei", name: "Freizeit", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "urlaub", name: "Urlaub", elternId: "frei", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "dach", kategorieId: "frei", kontoId: "k1", betragProMonat: 20000, art: "monatlich", start: "2026-01-01",
    });
    await sqliteBudgetRepository.speichern({
      id: "kind", kategorieId: "urlaub", kontoId: "k2", betragProMonat: 8000, art: "aufbauend", start: "2026-01-01",
    });

    rendere(<BudgetsScreen />);
    await screen.findByText("Freizeit");
    // Das Dach zeigt 120,00 statt 200,00 — die 80,00 des Kindes sind abgezogen.
    await waitFor(() => expect(document.body.textContent).toMatch(/120,00/));
    expect(document.body.textContent).toMatch(/gekürzt um die Budgets/);
  });

  it("zählt gebuchte Ausgaben als Verbrauch gegen das Budget", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betragProMonat: 40000, art: "monatlich", start: "2026-01-01",
    });
    const heute = new Date();
    const imMonat = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-05`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: imMonat, betrag: -15000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);
    // 400,00 Rahmen − 150,00 verbraucht = 250,00 Rest.
    await waitFor(() => expect(document.body.textContent).toMatch(/250,00/));
  });

  it("legt über den Dialog ein aufbauendes Budget an", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat2", name: "Urlaub", defaultCharakter: "Aufwand" });

    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));

    // Das Startdatum gibt es nur beim Aufbauenden — beim Monatlichen wäre es ohne Wirkung.
    expect(document.body.textContent).not.toMatch(/Sammelt ab/);
    await nutzer.selectOptions(artFeld(), "aufbauend");
    await waitFor(() => expect(document.body.textContent).toMatch(/Sammelt ab/));

    await nutzer.click(screen.getByRole("button", { name: /Kategorie wählen|—|▾/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Urlaub/ }));
    const betrag = screen.getAllByRole("textbox").find((f) => f.getAttribute("inputmode") === "decimal");
    await nutzer.type(betrag!, "100");

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    await waitFor(async () => {
      const gespeichert = await sqliteBudgetRepository.alle();
      expect(gespeichert).toHaveLength(1);
      expect(gespeichert[0].art).toBe("aufbauend");
      expect(gespeichert[0].betragProMonat).toBe(10000);
    });
  });

  it("zeigt eine Fehlermeldung statt zu speichern, wenn die Kategorie fehlt", async () => {
    await stammdatenBasis();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    // Nichts gespeichert, und der Dialog bleibt offen — ein stilles „nichts passiert"
    // wäre der eigentliche Fehler.
    expect(await sqliteBudgetRepository.alle()).toHaveLength(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Kategorie|wählen/i));
  });
});

/**
 * Vorschläge — der Weg läuft über zwei Tabellen (Betrag an der `ist_buchung`, Empfänger
 * am `umsatz`) und über die Vertragserkennung, die entscheidet, was NICHT steuerbar ist.
 */
describe("BudgetsScreen — Vorschläge", () => {
  const heute = new Date();
  /** Monatsschlüssel `i` Monate vor heute. */
  const monat = (i: number) => {
    const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  async function erfassen(id: string, datum: string, betrag: number, kategorieId: string, gegenpartei: string) {
    await sqliteLedgerRepository.speichern({
      id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId,
    });
    await sqliteUmsatzRepository.speichern({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum, betrag: -betrag,
      waehrung: "EUR", gegenpartei, verwendungszweck: "", rohHash: `h-${id}`,
      status: "verbucht", istbuchungId: id,
    });
  }

  /** Unregelmäßige Einkäufe: kein Vertrag, aber eine stabile Monatssumme. */
  async function einkaufsreihe(praefix: string, kategorieId: string, monatssumme: number, gegenpartei: string) {
    const tage = ["03", "12", "25"];
    for (let i = 0; i < 12; i++) {
      const teile = [Math.round(monatssumme * 0.5), Math.round(monatssumme * 0.2)];
      teile.push(monatssumme - teile[0] - teile[1]);
      for (const [j, betrag] of teile.entries()) {
        await erfassen(`${praefix}-${i}-${j}`, `${monat(i)}-${tage[(i + j) % 3]}`, betrag, kategorieId, gegenpartei);
      }
    }
  }

  async function stammdaten() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
    });
    await sqliteKategorieRepository.speichern({ id: "leben", name: "Lebenshaltung", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "essen", name: "Lebensmittel", elternId: "leben", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" });
  }

  it("zeigt ohne Buchungen keine Vorschlagskarte", async () => {
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Noch keine Budgets/));
    expect(document.body.textContent).not.toMatch(/Aus deinen Ausgaben abgeleitet/);
  });

  it("schlägt eine Hauptkategorie mit ihrem üblichen Monatsbetrag vor", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Lebenshaltung")).toBeInTheDocument();
    // Median 437,00 → Vorschlag 440,00.
    await waitFor(() => expect(document.body.textContent).toMatch(/440,00/));
  });

  /**
   * Die Stelle, an der beide Vorschlagssysteme zusammenhängen: die Miete ist eine
   * erkannte Vertragszahlung. „Wohnen" ist damit nicht steuerbar und darf trotz höchster
   * Summe NICHT als Budget erscheinen.
   */
  it("lässt eine rein vertragliche Kategorie weg", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    for (let i = 0; i < 12; i++) {
      await erfassen(`m-${i}`, `${monat(i)}-15`, 47000, "miete", "SWB Wohnungsvermietung");
    }

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Lebenshaltung")).toBeInTheDocument();
    expect(screen.queryByText("Wohnen")).not.toBeInTheDocument();
  });

  it("füllt beim Übernehmen die Anlege-Maske vor und legt das Budget an", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText("Lebenshaltung");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    await waitFor(() => expect(screen.getByDisplayValue("440")).toBeInTheDocument());

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    await waitFor(async () => {
      const budgets = await sqliteBudgetRepository.alle();
      expect(budgets).toHaveLength(1);
      expect(budgets[0].kategorieId).toBe("leben");
      expect(budgets[0].betragProMonat).toBe(44000);
    });
    // Und der Vorschlag ist weg, weil es das Budget jetzt gibt.
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Aus deinen Ausgaben abgeleitet/));
  });

  it("merkt sich ein weggeklicktes Verwerfen über einen Neustart", async () => {
    await stammdaten();
    await sqliteKategorieRepository.speichern({ id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" });
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    // Zweiter Vorschlag als Anker: nur wenn DER nach dem Neustart wieder dasteht, sind
    // die Vorschläge geladen. Ohne ihn prüfte der Test gegen einen Bildschirm, auf dem
    // die Karte schlicht noch nicht gerendert ist — und wäre auch grün, wenn nichts
    // gespeichert würde.
    await einkaufsreihe("f", "freizeit", 20000, "Kino Muelheim");

    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<BudgetsScreen />);
    await screen.findByText("Lebenshaltung");

    // Sortiert nach Vorschlagshöhe — Lebenshaltung (440) steht vor Freizeit (200).
    await nutzer.click(screen.getAllByRole("button", { name: /kein budget/i })[0]);
    await waitFor(() => expect(screen.queryByText("Lebenshaltung")).not.toBeInTheDocument());
    expect(screen.getByText("Freizeit")).toBeInTheDocument();

    ersteAnsicht.unmount();
    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Freizeit")).toBeInTheDocument();
    expect(screen.queryByText("Lebenshaltung")).not.toBeInTheDocument();
  });
});
