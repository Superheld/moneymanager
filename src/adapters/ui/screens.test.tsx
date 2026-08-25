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

import { auswahlWaehlen, frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../testwerkzeug/harness";
import { BudgetsScreen } from "./budgets/BudgetsScreen";
import { EinstellungenScreen } from "./einstellungen/EinstellungenScreen";
import { AnalyseScreen } from "./analyse/AnalyseScreen";
import { UebersichtScreen } from "./uebersicht/UebersichtScreen";
import { ImportScreen } from "./import/ImportScreen";
import { InventarScreen } from "./inventar/InventarScreen";
import { KontenScreen } from "./konten/KontenScreen";
import { ReviewScreen } from "./import/ReviewScreen";
import { sqliteKlassifikatorRepository } from "../persistence/sqliteKlassifikatorRepository";
import { trainieren } from "../../core";
import { VertraegeScreen } from "./vertraege/VertraegeScreen";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import { sqliteDepotRepository } from "../persistence/sqliteDepotRepository";
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
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
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
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 40000 }], art: "monatlich", start: "2026-01-01",
    });
    rendere(<BudgetsScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));
  });

  it("rechnet gebuchte Aufwände als Verbrauch gegen das Budget", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 40000 }], art: "monatlich", start: "2026-01-01",
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
      id: "v1", anbieter: "Petrossen", beginn: "2026-01-01",
      status: "aktiv", verlaengerung: "automatisch", verlaengerungMonate: 12,
      mindestlaufzeitMonate: 12, kuendigungsfristMonate: 3,
    });
    rendere(<VertraegeScreen />);
    expect(await screen.findByText(/Petrossen/)).toBeInTheDocument();
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

describe("UebersichtScreen", () => {
  /** Der Monatsschlüssel `zurueck` Monate vor heute. */
  function monat(zurueck: number): string {
    const n = new Date();
    const d = new Date(n.getFullYear(), n.getMonth() - zurueck, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  it("rendert im Leerzustand", async () => {
    rendere(<UebersichtScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt den Depotwert, nicht den Kontostand des Depot-Kontos", async () => {
    // Der Fall aus der Praxis: ein Depot-Konto hat Saldo 0, weil es keine Buchungen gibt.
    // Der Wert steht in der Wertreihe der Bank — und der gehört in die Karte.
    await grunddaten();
    await sqliteDepotRepository.speichern({
      id: "d1",
      zugangId: "z1",
      schluessel: "1234567800|Depot",
      bezeichnung: "Wertpapierdepot",
      waehrung: "EUR",
    });
    await sqliteDepotRepository.wertSpeichern(
      { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 314159 },
      "2026-08-20T10:00:00.000Z",
    );

    rendere(<UebersichtScreen />);
    expect(await screen.findByText("Wertpapierdepot")).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).toMatch(/3\.141,59/));
  });

  it("zeigt die Budgets des laufenden Monats mit ihrem Rest", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: monat(6), betrag: 40000 }],
      art: "monatlich", start: `${monat(6)}-01`,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: `${monat(0)}-05`, betrag: -15000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    rendere(<UebersichtScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    // 400,00 Rahmen − 150,00 verbraucht = 250,00 Rest.
    await waitFor(() => expect(document.body.textContent).toMatch(/250,00/));
  });

  it("schaltet auf einen vergangenen Monat um und rechnet dessen Verbrauch", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: monat(6), betrag: 40000 }],
      art: "monatlich", start: `${monat(6)}-01`,
    });
    // Nur im VORmonat gebucht — im laufenden ist der Rahmen unangetastet.
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: `${monat(1)}-05`, betrag: -30000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    const nutzer = userEvent.setup();
    rendere(<UebersichtScreen />);
    await screen.findByText(/Lebensmittel/);
    // Laufender Monat: nichts verbraucht, voller Rahmen.
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));

    await auswahlWaehlen(nutzer, "Monat", monat(1));
    // Vormonat: 400,00 − 300,00 = 100,00.
    await waitFor(() => expect(document.body.textContent).toMatch(/100,00/));
  });

  /**
   * Der Punkt, um den es beim Aufbauenden geht: dort stand vorher „x von 300" — der
   * Betrag, der hineingegangen wäre, hätte man nie etwas ausgegeben. Er wächst jeden
   * Monat weiter und sagt über den laufenden nichts. An seiner Stelle steht jetzt die
   * Aufrechnung dieses Monats.
   */
  it("zeigt beim aufbauenden Budget die Fortschreibung statt der Summe seit Start", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: monat(2), betrag: 10000 }],
      art: "aufbauend", start: `${monat(2)}-01`,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: `${monat(1)}-05`, betrag: -3000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    rendere(<UebersichtScreen />);
    await screen.findByText(/Lebensmittel/);
    // Übertrag 170,00 + Rate 100,00, in diesem Monat nichts weg → Rest 270,00.
    await waitFor(() => expect(document.body.textContent).toMatch(/Übertrag 170,00/));
    expect(document.body.textContent).toMatch(/270,00/);
    // Der kumulierte Rahmen (3 × 100,00) steht nicht mehr als Anzeigewert daneben.
    expect(document.body.textContent).not.toMatch(/von 300,00/);
  });

  it("zeigt beim aufgeklappten Budget die Buchungen DIESES Monats, nicht alle seit Start", async () => {
    await grunddaten();
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: monat(2), betrag: 10000 }],
      art: "aufbauend", start: `${monat(2)}-01`,
    });
    await sqliteLedgerRepository.speichern({
      id: "alt", datum: `${monat(1)}-05`, betrag: -3000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Fährticket",
    });
    await sqliteLedgerRepository.speichern({
      id: "neu", datum: `${monat(0)}-05`, betrag: -2000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Zeltplatz",
    });

    const nutzer = userEvent.setup();
    rendere(<UebersichtScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel — Buchungen zeigen/ }));

    await waitFor(() => expect(document.body.textContent).toMatch(/Zeltplatz/));
    // Sonst summierte sich die Liste auf eine andere Zahl als die Zeile darüber.
    expect(document.body.textContent).not.toMatch(/Fährticket/);
  });
});

describe("AnalyseScreen", () => {
  it("rendert im Leerzustand", async () => {
    rendere(<AnalyseScreen />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });

  it("zeigt gebuchte Beträge in der Historie", async () => {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -12345, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    rendere(<AnalyseScreen />);
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
    rendere(<AnalyseScreen />);

    // Ø über die 12 Monate des Zeitraums: 400 € / 12 = 33,33 €.
    await waitFor(() => expect(document.body.textContent).toMatch(/33,33/));

    // Einen Monat wählen — die Kennzahlen zeigen dann diesen Monat.
    const laufend = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}`;
    await auswahlWaehlen(nutzer, "Monat", laufend);

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
    rendere(<AnalyseScreen />);

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
    rendere(<AnalyseScreen />);

    await waitFor(() => expect(document.body.textContent).toMatch(/123,45/));
    await auswahlWaehlen(nutzer, "Gliederung", "Hauptgruppen");

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
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung Beispiel",
      verwendungszweck: "Fachbuch", rohHash: "h1", status: "neu",
    });
    rendere(<ReviewScreen />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Buchhandlung Beispiel|Fachbuch|25,99/),
    );
  });

  it("legt eine Zeile weg, die nie übernommen wird", async () => {
    // Der gemeldete Fall: neun Zeilen aus einem Dateiimport standen dauerhaft in der
    // Inbox — ohne Kategorie, ohne Weg nach vorn und ohne Weg hinaus.
    await grunddaten();
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung Beispiel",
      verwendungszweck: "Fachbuch", rohHash: "h1", status: "neu",
    });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await screen.findByText("Buchhandlung Beispiel");

    await nutzer.click(screen.getByLabelText(/diese zeile weglegen/i));

    await waitFor(() => expect(screen.queryByText("Buchhandlung Beispiel")).not.toBeInTheDocument());
    // Weggelegt heisst nicht gelöscht: die Zeile bleibt und zählt bei der
    // Dublettenprüfung weiter mit.
    const alle = await sqliteUmsatzRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].status).toBe("verworfen");
  });

  it("zeigt bei jedem Vorschlag, woher er kommt", async () => {
    await grunddaten();
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung Beispiel",
      verwendungszweck: "Fachbuch", rohHash: "h1", status: "neu",
      vorschlag: { kategorieId: "kat1", charakter: "Aufwand", quelle: "remapping" },
    });

    rendere(<ReviewScreen />);

    // Ohne die Herkunft ist einem Vorschlag nicht anzusehen, ob ihn ein Vertrag, ein
    // Modell oder die Importdatei gesetzt hat — und damit nicht, wie sehr man ihm traut.
    await waitFor(() => expect(screen.getAllByText("Import").length).toBeGreaterThan(0));
  });

  it("begründet einen Vorschlag des Modells mit seinen Belegen", async () => {
    await grunddaten();
    await sqliteKlassifikatorRepository.speichern({
      modell: trainieren([
        { merkmale: ["emp=buchhandlung beispiel", "vwz:fachbuch", "vz:-"], kategorieId: "kat1" },
        { merkmale: ["emp=ganz anderer"], kategorieId: "kat2" },
      ]),
      trainiertAm: "2026-08-17T10:00:00.000Z",
    });
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung Beispiel",
      verwendungszweck: "Fachbuch", rohHash: "h1", status: "neu",
      vorschlag: { kategorieId: "kat1", charakter: "Aufwand", quelle: "ki" },
    });

    rendere(<ReviewScreen />);

    await waitFor(() => expect(screen.getAllByText("Erkennung").length).toBeGreaterThan(0));
    // Die Belege werden beim Anzeigen neu gerechnet — sie hängen am aktuellen Modell.
    expect(document.body.textContent).toMatch(/emp=buchhandlung beispiel/);
    expect(document.body.textContent).toMatch(/sicher/);
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
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Personen$/);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bruce|Girokonto|Lebensmittel/));
  });
});
