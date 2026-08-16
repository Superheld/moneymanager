/** @vitest-environment jsdom */
// Budgets-Screen — Integrationstest von der Oberfläche bis ins Schema.
//
// `getDb` zeigt auf eine frische In-Memory-SQLite; alles dazwischen (Repositories,
// Use-Cases, Kern) läuft echt. Ein falsches Spalten-Mapping fällt hier deshalb genauso
// auf wie eine kaputte Anzeige.
//
// Vorher lag der aufbauende Teil in `ToepfeScreen.test.tsx`. Seit der Zusammenlegung
// (2026-08-16) prüft diese Datei beide Arten AN EINEM Screen — inklusive der Zusage,
// die die Zusammenlegung überhaupt ausmacht: ein Dialog trägt beide Fälle.

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
import { sqliteTopfRepository } from "../persistence/sqliteTopfRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
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

/** Das Auswahlfeld für die Art — daran hängt, welches Aggregat entsteht. */
function artFeld(): HTMLElement {
  const treffer = screen
    .getAllByRole("combobox")
    .find((s) => (s.textContent ?? "").includes("Spartopf"));
  if (!treffer) throw new Error("Art-Auswahl nicht gefunden");
  return treffer;
}

describe("BudgetsScreen", () => {
  it("zeigt im Leerzustand beide Abschnitte statt leerer Kennzahlen", async () => {
    rendere(<BudgetsScreen />);
    expect((await screen.findAllByText("Budgets")).length).toBeGreaterThan(0);
    // Beide Arten sind auch ohne Daten sichtbar — sonst weiß niemand, dass es sie gibt.
    await waitFor(() => expect(document.body.textContent).toMatch(/Jeden Monat neu/));
    expect(document.body.textContent).toMatch(/Baut sich auf/);
    // Ohne Daten bewusst KEINE Kennzahlen: leere Kacheln (0,00 € überall) sähen aus wie
    // ein Datenfehler.
    expect(document.body.textContent).not.toMatch(/Deckungsgrad|Auslastung/);
  });

  /** Der eigentliche Punkt der Zusammenlegung: beides steht auf EINEM Screen. */
  it("zeigt monatliches Budget und aufbauenden Topf nebeneinander", async () => {
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", rahmen: 40000, periode: "monatlich",
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaubskasse", start: "2026-01-01",
      zufuehrungProMonat: 10000, sparziel: 120000,
    });

    rendere(<BudgetsScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    expect(await screen.findByText("Urlaubskasse")).toBeInTheDocument();
    // 40000 → „400,00" (Budget-Rahmen), 120000 → „1.200,00" (Sparziel), beide in de-DE.
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));
    expect(document.body.textContent).toMatch(/1\.200,00/);
  });

  it("zeigt die Kennzahlen des aufbauenden Teils, sobald ein Topf existiert", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000, sparziel: 60000,
    });
    rendere(<BudgetsScreen />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Angespart|Ziel gesamt|Deckungsgrad/),
    );
  });

  it("zeigt mehrere aufbauende Töpfe nebeneinander", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000, sparziel: 60000,
    });
    await sqliteTopfRepository.speichern({
      id: "t2", typ: "puffer", bezeichnung: "Reparaturen", start: "2026-01-01",
      schaetzbetrag: 50000, fristMonate: 12,
    });

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Urlaub")).toBeInTheDocument();
    expect(await screen.findByText("Reparaturen")).toBeInTheDocument();
  });

  /** Ersatz-Töpfe hängen am Inventar und dürfen hier nicht doppelt auftauchen. */
  it("führt Ersatz-Töpfe nicht mit auf", async () => {
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "ersatz", bezeichnung: "Waschmaschine", start: "2026-01-01",
      wiederbeschaffung: 75000, nutzungsdauerMonate: 120,
    });
    // Zweiter Topf als Anker: erst wenn DER sichtbar ist, sind die Daten geladen. Auf den
    // Abschnittstitel zu warten reichte nicht — der steht schon vor dem ersten Ladeergebnis
    // da, und der Test wäre gegen einen entfernten Filter blind.
    await sqliteTopfRepository.speichern({
      id: "t2", typ: "spartopf", bezeichnung: "Urlaub", start: "2026-01-01",
      zufuehrungProMonat: 5000, sparziel: 60000,
    });
    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Urlaub")).toBeInTheDocument();
    expect(screen.queryByText("Waschmaschine")).not.toBeInTheDocument();
  });

  it("berücksichtigt eine reale Entnahme im angezeigten Stand", async () => {
    // Puffer über 12 Monate, Start weit in der Vergangenheit → voll angespart (50.000),
    // minus einer Entnahme von 100,00 → 400,00 müssen sichtbar werden.
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Giro", typ: "Giro", inhaberIds: [], saldo: 100000,
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "puffer", bezeichnung: "Reparaturen", start: "2020-01-01",
      schaetzbetrag: 50000, fristMonate: 12,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-01-05", betrag: -10000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "manuell",
      verwendung: { art: "topf", topfId: "t1" },
    });

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Reparaturen")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/400,00/).length).toBeGreaterThan(0));
  });

  /**
   * Die Zusage der Zusammenlegung: EIN Anlege-Knopf, und der Dialog trägt beide Fälle.
   * Beim Wechsel der Art müssen die Felder wechseln — sonst legte man mit den Feldern
   * der einen Art ein Aggregat der anderen an.
   */
  it("wechselt im Anlege-Dialog zwischen monatlich und aufbauend", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));

    // Voreinstellung: monatlich → Rahmen und Periode, kein Bezeichnungsfeld.
    await waitFor(() => expect(document.body.textContent).toMatch(/Rahmen/));
    expect(document.body.textContent).not.toMatch(/Zuführung pro Monat/);

    await nutzer.selectOptions(artFeld(), "spartopf");
    await waitFor(() => expect(document.body.textContent).toMatch(/Zuführung pro Monat/));
    expect(document.body.textContent).toMatch(/Sparziel/);

    await nutzer.selectOptions(artFeld(), "puffer");
    await waitFor(() => expect(document.body.textContent).toMatch(/Schätzbetrag/));
    expect(document.body.textContent).toMatch(/Zeitfenster/);
  });

  it("legt über denselben Dialog einen Spartopf an", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));
    await nutzer.selectOptions(artFeld(), "spartopf");

    const felder = await screen.findAllByRole("textbox");
    await nutzer.type(felder[0], "Neue Urlaubskasse");
    // Zuführung ist das erste Betragsfeld nach der Bezeichnung.
    const betraege = screen.getAllByRole("textbox").filter((f) => f.getAttribute("inputmode") === "decimal");
    await nutzer.type(betraege[0], "100");

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    await waitFor(async () => {
      const gespeichert = await sqliteTopfRepository.alle();
      expect(gespeichert).toHaveLength(1);
      expect(gespeichert[0].bezeichnung).toBe("Neue Urlaubskasse");
      expect(gespeichert[0].typ).toBe("spartopf");
    });
    // Und der Screen zeigt ihn danach auch an.
    expect(await screen.findByText("Neue Urlaubskasse")).toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung statt zu speichern, wenn die Bezeichnung fehlt", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));
    await nutzer.selectOptions(artFeld(), "spartopf");

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    // Nichts gespeichert, und der Dialog bleibt offen — ein stilles „nichts passiert"
    // wäre der eigentliche Fehler.
    expect(await sqliteTopfRepository.alle()).toHaveLength(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bezeichnung|angeben|fehlt/i));
  });
});
