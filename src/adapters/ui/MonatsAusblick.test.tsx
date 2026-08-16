/** @vitest-environment jsdom */
// Monatsausblick — die drei Karten oben in der Übersicht.
//
// Zwei Ebenen: die Karten selbst gegen übergebene Daten (dort ist `heute` festgenagelt,
// damit die Tests nicht mit der Uhr wandern), und einmal der ganze Weg über den
// HistorieScreen gegen eine echte In-Memory-SQLite — der prüft die Verdrahtung
// (Repositories, Spalten-Mapping), nicht die Rechnung.

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
import { MonatsAusblick } from "./MonatsAusblick";
import { HistorieScreen } from "./HistorieScreen";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import type { Budget, IstBuchung, Kategorie, Zahlungsregel } from "../../core";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const KATEGORIEN: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" },
  { id: "lebenshaltung", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "lebensmittel", name: "Lebensmittel", elternId: "lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

const REGELN: Zahlungsregel[] = [
  { id: "r-miete", bezeichnung: "Vermieter", betrag: -47141, rhythmus: "monatlich", startdatum: "2026-01-04", charakter: "Aufwand", kategorieId: "miete" },
  { id: "r-lohn", bezeichnung: "Arbeitgeber", betrag: 247536, rhythmus: "monatlich", startdatum: "2026-01-28", charakter: "Ertrag", kategorieId: "gehalt" },
];

const BUDGETS: Budget[] = [{ id: "b1", kategorieId: "lebenshaltung", rahmen: 43000, periode: "monatlich" }];

const IST: IstBuchung[] = [
  { id: "i1", datum: "2026-08-05", betrag: -45925, kontoId: "giro", kategorieId: "miete", charakter: "Aufwand", quelle: "import" },
  { id: "i2", datum: "2026-08-11", betrag: -6250, kontoId: "giro", kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "import" },
];

const props = { regeln: REGELN, budgets: BUDGETS, ist: IST, kategorien: KATEGORIEN, heute: "2026-08-16" };

/**
 * Die Karte eines Monats. Der EinstellungenProvider rendert erst nach dem Laden, deshalb
 * asynchron. Der Weg über drei Elternebenen hängt am Aufbau der Card (Titel → Titelblock
 * → Kopfzeile → Karte) — bricht die, bricht dieser Helfer sichtbar und nicht still.
 */
async function karte(titel: string): Promise<HTMLElement> {
  const kopf = await screen.findByText(titel);
  const box = kopf.parentElement?.parentElement?.parentElement;
  if (!box) throw new Error(`Karte „${titel}" nicht gefunden`);
  return box;
}

describe("MonatsAusblick", () => {
  it("zeigt den laufenden Monat und die beiden folgenden", async () => {
    rendere(<MonatsAusblick {...props} />);
    expect(await screen.findByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
  });

  it("rechnet im laufenden Monat Plan und Gebuchtes nebeneinander auf", async () => {
    rendere(<MonatsAusblick {...props} />);
    const august = await karte("August 2026");
    // Unter dem Strich steht im laufenden Monat das Gebuchte: −459,25 − 62,50 = −521,75.
    // Geplant wären 2475,36 − 471,41 − 430,00 = +1573,95 — die Differenz steht darunter.
    expect(within(august).getByText("−521,75 €")).toBeInTheDocument();
    expect(within(august).getByText("−2.095,70 € gegenüber Plan")).toBeInTheDocument();
    // Die Zeilen selbst tragen weiterhin beide Spalten.
    expect(within(august).getByText("gebucht")).toBeInTheDocument();
    expect(within(august).getByText("−471,41")).toBeInTheDocument();
  });

  it("stellt das Gebuchte vor das Geplante", async () => {
    rendere(<MonatsAusblick {...props} />);
    const august = await karte("August 2026");
    const gebucht = within(august).getByText("gebucht");
    const geplant = within(august).getByText("geplant");
    // Das Tatsächliche steht links — beim nächsten Umbau soll das nicht still zurückdrehen.
    expect(gebucht.compareDocumentPosition(geplant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("zeigt für kommende Monate nur die Plan-Spalte", async () => {
    rendere(<MonatsAusblick {...props} />);
    const september = await karte("September 2026");
    expect(within(september).queryByText("gebucht")).not.toBeInTheDocument();
    expect(within(september).getByText("+1.573,95 €")).toBeInTheDocument();
    // Ohne Ist gibt es auch nichts zu vergleichen.
    expect(within(september).queryByText(/gegenüber Plan/)).not.toBeInTheDocument();
  });

  it("klappt die Verträge auf und zeigt, was schon gebucht ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<MonatsAusblick {...props} />);
    const august = await karte("August 2026");

    expect(within(august).queryByText("Vermieter")).not.toBeInTheDocument();
    await nutzer.click(within(august).getByText(/Verträge/));

    expect(within(august).getByText("Vermieter")).toBeInTheDocument();
    expect(within(august).getByText("04.")).toBeInTheDocument();
    // Lange Anbieternamen werden per CSS gekappt — der volle Name bleibt im title.
    expect(within(august).getByTitle("Vermieter")).toBeInTheDocument();
    // Der TATSÄCHLICH gebuchte Betrag steht am Posten, nicht der geplante — einmal in
    // der Zeilensumme, einmal am aufgeklappten Posten.
    expect(within(august).getAllByText("−459,25")).toHaveLength(2);
  });

  it("klappt die Budgets auf und zeigt, wie weit der Rahmen durch ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<MonatsAusblick {...props} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText("Budgets"));
    expect(within(august).getByText("Lebenshaltung")).toBeInTheDocument();
    expect(within(august).getByText("62,50 / 430,00 €")).toBeInTheDocument();
  });

  it("weist darauf hin, wenn gar keine Einnahmen geplant sind", async () => {
    rendere(<MonatsAusblick {...props} regeln={[REGELN[0]]} />);
    expect(await screen.findByText(/Einnahmen kommen aus Verträgen/)).toBeInTheDocument();
  });

  it("zeigt ohne Verträge und Budgets einen Hinweis statt drei leerer Karten", async () => {
    rendere(<MonatsAusblick {...props} regeln={[]} budgets={[]} />);
    expect(await screen.findByText(/Für den Ausblick fehlen die Plan-Daten/)).toBeInTheDocument();
    expect(screen.queryByText("August 2026")).not.toBeInTheDocument();
  });

  it("schweigt über fehlende Einnahmen, sobald ein Ertrags-Vertrag existiert", async () => {
    rendere(<MonatsAusblick {...props} />);
    await screen.findByText("August 2026");
    expect(screen.queryByText(/Einnahmen kommen aus Verträgen/)).not.toBeInTheDocument();
  });
});

describe("Übersicht — Ausblick am echten Schema", () => {
  it("lädt Regeln und Budgets aus der Datenbank und zeigt die drei Karten", async () => {
    for (const k of KATEGORIEN) await sqliteKategorieRepository.speichern(k);
    for (const r of REGELN) await sqliteZahlungsregelRepository.speichern(r);
    for (const b of BUDGETS) await sqliteBudgetRepository.speichern(b);
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Giro", typ: "Giro", inhaberIds: [], saldo: 100000 });
    // Eine Buchung im laufenden Monat — welcher das ist, entscheidet hier die echte Uhr.
    const jetzt = new Date();
    const monatsErster = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-01`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: monatsErster, betrag: -6250, kontoId: "giro",
      kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell",
    });

    rendere(<HistorieScreen />);

    // Drei Karten, und die Miete steht als Vertragsposten drin (Regel korrekt gemappt).
    await waitFor(() => expect(screen.getAllByText("Bleibt")).toHaveLength(3));
    expect(screen.getAllByText(/geplant/).length).toBeGreaterThan(0);
    const nutzer = userEvent.setup();
    await nutzer.click(screen.getAllByText(/Verträge/)[0]);
    expect(screen.getAllByText("Vermieter").length).toBeGreaterThan(0);
  });
});
