/** @vitest-environment jsdom */
// Screen-Tests — Integration von der Oberfläche bis ins Schema.
//
// Jeder Screen wird zweimal geprüft: im Leerzustand (frische Datenbank) und mit Daten,
// die über die echten Repositories geschrieben wurden. Dazwischen liegt nichts Gefaktes —
// dieselben Use-Cases, derselbe Kern, dieselbe SQL-Engine wie in der App.
//
// Bewusst NICHT auf Layout oder Formulierungen geprüft: die Tests suchen nach Daten, die
// der Test selbst angelegt hat (Bezeichnungen, Beträge). So bleiben sie beim nächsten
// Wording- oder Design-Durchgang stehen, statt reihenweise rot zu werden.

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
import { EinstellungenScreen } from "./EinstellungenScreen";
import { HistorieScreen } from "./HistorieScreen";
import { ImportScreen } from "./ImportScreen";
import { InventarScreen } from "./InventarScreen";
import { KontenScreen } from "./KontenScreen";
import { ReviewScreen } from "./ReviewScreen";
import { VertraegeScreen } from "./VertraegeScreen";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import { sqliteInventarRepository } from "../persistence/sqliteInventarRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import {
  sqliteKategorieRepository,
  sqlitePersonRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Häufig gebrauchtes Grundgerüst: ein Konto und eine Kategorie. */
async function grunddaten() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
  });
  await sqliteKategorieRepository.speichern({
    id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
  });
}

describe("KontenScreen", () => {
  it("rendert im Leerzustand ohne zu scheitern", async () => {
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt ein Konto mit seiner Bezeichnung", async () => {
    await grunddaten();
    rendere(<KontenScreen onNavigate={() => {}} />);
    // Steht mehrfach (Kontoliste und Auszugs-Kopf) — beides gewollt.
    expect((await screen.findAllByText(/Girokonto/)).length).toBeGreaterThan(0);
  });

  it("zeigt gebuchte Umsätze des Kontos im Auszug", async () => {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -4250, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Wocheneinkauf",
    });
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/42,50|Wocheneinkauf/));
  });

  it("öffnet den Buchungsdialog", async () => {
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    const knoepfe = await screen.findAllByRole("button", { name: /buchung|buchen/i });
    await nutzer.click(knoepfe[0]);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(1));
  });
});

describe("BudgetsScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt ein Budget mit Kategorie und Rahmen", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", rahmen: 40000, periode: "monatlich",
    });
    rendere(<BudgetsScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));
  });

  it("rechnet gebuchte Aufwände als Verbrauch gegen das Budget", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", rahmen: 40000, periode: "monatlich",
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: new Date().toISOString().slice(0, 10), betrag: -15000,
      kontoId: "k1", charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/150,00/));
  });
});

describe("VertraegeScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt einen Vertrag mit Anbieter", async () => {
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Stadtwerke Musterstadt", beginn: "2026-01-01",
      status: "aktiv", verlaengerung: "automatisch", verlaengerungMonate: 12,
      mindestlaufzeitMonate: 12, kuendigungsfristMonate: 3,
    });
    rendere(<VertraegeScreen />);
    expect(await screen.findByText(/Stadtwerke Musterstadt/)).toBeInTheDocument();
  });
});

describe("InventarScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<InventarScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt einen Gegenstand mit Bezeichnung", async () => {
    await sqliteInventarRepository.speichern({
      id: "g1", bezeichnung: "Waschmaschine", anschaffung: "2024-01-01",
      wiederbeschaffung: 60000, nutzungsdauerMonate: 120,
    });
    rendere(<InventarScreen />);
    expect(await screen.findByText(/Waschmaschine/)).toBeInTheDocument();
  });
});

describe("HistorieScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<HistorieScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt gebuchte Beträge in der Historie", async () => {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -12345, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    rendere(<HistorieScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/123,45/));
  });

  /**
   * Der Durchschnitt ist der Maßstab, gegen den ein einzelner Monat etwas aussagt.
   * Zwei Monate mit 100 € und 300 € → Ø 200 €; er darf sich nicht mitverschieben,
   * wenn ein Monat gewählt wird, sonst verglichen man den Monat mit sich selbst.
   */
  it("zeigt den Durchschnitt pro Monat und vergleicht einen gewählten Monat damit", async () => {
    await grunddaten();
    const heute = new Date();
    const monat = (rueck: number) => {
      const d = new Date(heute.getFullYear(), heute.getMonth() - rueck, 15);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
    };
    await sqliteLedgerRepository.speichern({
      id: "a", datum: monat(1), betrag: -10000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    await sqliteLedgerRepository.speichern({
      id: "b", datum: monat(0), betrag: -30000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    const nutzer = userEvent.setup();
    rendere(<HistorieScreen />);

    // Ø über die 12 Monate des Zeitraums: 400 € / 12 = 33,33 €.
    await waitFor(() => expect(document.body.textContent).toMatch(/33,33/));

    // Einen Monat wählen — die Kennzahlen zeigen dann diesen Monat.
    const auswahl = await screen.findByLabelText("Monat");
    const laufend = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}`;
    await nutzer.selectOptions(auswahl, screen.getByRole("option", { name: laufend }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/300,00/); // Ausgaben des gewählten Monats
      expect(text).toMatch(/33,33/); // Ø bleibt der des Zeitraums
      expect(text).toMatch(/vs\./); // Abweichung wird ausgewiesen
    });
  });

  /** Der Weg, der vorher nur über den Konto-Auszug ging: Kategorie → Buchung → Details. */
  it("öffnet die Buchungsdetails aus einer aufgeklappten Kategorie", async () => {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -12345, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Sondermüll",
    });
    const nutzer = userEvent.setup();
    rendere(<HistorieScreen />);

    // Kategorie aufklappen …
    await nutzer.click(await screen.findByText(/Lebensmittel/));
    // … dann die Buchung darin.
    await waitFor(() => expect(screen.getAllByTitle(/Buchungsdetails/).length).toBeGreaterThan(0));
    await nutzer.click(screen.getAllByTitle(/Buchungsdetails/)[0]);

    // Der Detaildialog trägt die Notiz der Buchung.
    await waitFor(() => expect(document.body.textContent).toMatch(/Sondermüll/));
  });

  it("bündelt die Auswertung auf Wunsch zu Hauptgruppen", async () => {
    await grunddaten();
    await sqliteKategorieRepository.speichern({
      id: "gruppe1", name: "Lebenshaltung", defaultCharakter: "Aufwand",
    });
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand", elternId: "gruppe1",
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -12345, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    const nutzer = userEvent.setup();
    rendere(<HistorieScreen />);

    await waitFor(() => expect(document.body.textContent).toMatch(/123,45/));
    await nutzer.selectOptions(await screen.findByLabelText("Gliederung"), "gruppe");

    // Jetzt steht die Hauptgruppe da; die Unterkategorie erst nach dem Aufklappen.
    await waitFor(() => expect(screen.getByText(/Lebenshaltung/)).toBeInTheDocument());
    expect(screen.queryByText(/Lebensmittel/)).not.toBeInTheDocument();

    await nutzer.click(screen.getByText(/Lebenshaltung/));
    await waitFor(() => expect(screen.getByText(/Lebensmittel/)).toBeInTheDocument());
  });
});

describe("ReviewScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<ReviewScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("listet offene Umsätze aus dem Import", async () => {
    await grunddaten();
    await sqliteUmsatzRepository.speichern({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung Beispiel",
      verwendungszweck: "Fachbuch", rohHash: "h1", status: "neu",
    });
    rendere(<ReviewScreen />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Buchhandlung Beispiel|Fachbuch|25,99/),
    );
  });
});

describe("ImportScreen", () => {
  it("rendert die Dateiauswahl", async () => {
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });
});

describe("EinstellungenScreen", () => {
  it("rendert die Einstellungen", async () => {
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt angelegte Stammdaten", async () => {
    await grunddaten();
    await sqlitePersonRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    rendere(<EinstellungenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bruce|Girokonto|Lebensmittel/));
  });
});
