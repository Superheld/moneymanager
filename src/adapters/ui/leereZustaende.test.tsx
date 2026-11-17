/** @vitest-environment jsdom */
// Die leeren Zustände der Bereiche — und der nächste Schritt am Ende des Imports.
//
// Bereichsübergreifend, weil die Regel eine ist (`bausteine/LeererZustand`): ist nichts
// da, sagt der Bereich, was hierher gehört, wozu es gut ist und was als Nächstes dran ist
// — mit dem Knopf, der es tut. Sobald etwas da ist, verschwindet das wieder. Beide
// Hälften stehen je Bereich hier, gegen die echte In-Memory-SQLite.
//
// Gesucht wird nach i18n-Schlüsseln, nicht nach Wortlaut. Namen und Beträge sind
// erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import { sqliteRuecklagenRepository } from "../persistence/sqliteRuecklagenRepository";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
import {
  sqliteImportLaufRepository,
  sqliteUmsatzRepository,
} from "../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import { VertraegeScreen } from "./vertraege/VertraegeScreen";
import { BudgetsScreen } from "./budgets/BudgetsScreen";
import { RuecklagenScreen } from "./ruecklagen/RuecklagenScreen";
import { KontenScreen } from "./konten/KontenScreen";
import { KontenVerwaltungScreen } from "./konten/KontenVerwaltungScreen";
import { AnalyseScreen } from "./analyse/AnalyseScreen";
import { UebersichtScreen } from "./uebersicht/UebersichtScreen";
import { ReviewScreen } from "./review/ReviewScreen";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte) as string;

/** Der Absatz eines leeren Zustands — er setzt mehrere Sätze zusammen, gesucht wird einer. */
const absatzMit = (schluessel: string) =>
  screen.findByText((_, el) => el?.tagName === "P" && !!el.textContent?.includes(t(schluessel)));
const absatzFehlt = (schluessel: string) =>
  expect(
    screen.queryByText((_, el) => el?.tagName === "P" && !!el.textContent?.includes(t(schluessel))),
  ).not.toBeInTheDocument();

const zuImport = () => ({ name: t("einrichtung.zuBereich", { bereich: t("shell.navImport") }) });
/** Ein Anlege-Knopf trägt ein führendes „+" vor seinem Wort. */
const anlegeKnopf = (schluessel: string) => ({ name: new RegExp(`^\\+?\\s*${t(schluessel)}$`) });

function heute(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

async function konto(id = "k-ohlert") {
  await sqliteZahlungskontoRepository.speichern({
    id, bezeichnung: "Ohlert Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
  });
}

async function buchung(id = "b-1", kontoId = "k-ohlert") {
  await sqliteLedgerRepository.speichern({
    id, datum: heute(), betrag: -4200, kontoId, kategorieId: "kat-frei", charakter: "Aufwand", quelle: "manuell",
  });
}

describe("Verträge — leer", () => {
  it("führt ohne Buchungen zuerst in den Import", async () => {
    const wohin = vi.fn();
    rendere(<VertraegeScreen onNavigate={wohin} />);

    expect(await absatzMit("vertraege.leerErklaerung")).toBeInTheDocument();
    expect(await absatzMit("vertraege.leerOhneBuchungen")).toBeInTheDocument();
    expect(screen.getByText(t("vertraege.leer"))).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", zuImport()));
    expect(wohin).toHaveBeenCalledWith("import");
  });

  it("sagt mit Buchungen, aber ohne Erkanntes, dass man selbst anlegt — und kein Weg in den Import", async () => {
    await konto();
    await buchung();
    rendere(<VertraegeScreen onNavigate={vi.fn()} />);

    expect(await absatzMit("vertraege.leerOhneVorschlaege")).toBeInTheDocument();
    expect(screen.queryByRole("button", zuImport())).not.toBeInTheDocument();
  });

  it("verschwindet, sobald es einen Vertrag gibt", async () => {
    await sqliteVertragRepository.speichern({
      id: "v-kesselmann", anbieter: "Kesselmann", beginn: "2026-01-01", verlaengerung: "keine", status: "aktiv",
    });
    await sqliteZahlungsregelRepository.speichern({
      id: "r-kesselmann", bezeichnung: "Kesselmann", betrag: -1999, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Aufwand", vertragId: "v-kesselmann",
    });
    rendere(<VertraegeScreen onNavigate={vi.fn()} />);

    expect((await screen.findAllByText("Kesselmann")).length).toBeGreaterThan(0);
    absatzFehlt("vertraege.leerErklaerung");
  });
});

describe("Budgets — leer", () => {
  it("führt ohne Buchungen in den Import und bietet das Anlegen an", async () => {
    const wohin = vi.fn();
    rendere(<BudgetsScreen onNavigate={wohin} />);

    expect(await absatzMit("budgets.leerOhneBuchungen")).toBeInTheDocument();
    expect(screen.getAllByRole("button", anlegeKnopf("budgets.anlegen")).length).toBeGreaterThan(1);
    await userEvent.setup().click(screen.getByRole("button", zuImport()));
    expect(wohin).toHaveBeenCalledWith("import");
  });

  it("verschwindet, sobald es ein Budget gibt", async () => {
    await konto();
    await sqliteKategorieRepository.speichern({ id: "kat-frei", name: "Vibora-Topf", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b-vibora", kategorieId: "kat-frei", kontoId: "k-ohlert", art: "monatlich", start: "2026-01-01",
      betraege: [{ abMonat: "2026-01", betrag: 25000 }],
    });
    rendere(<BudgetsScreen onNavigate={vi.fn()} />);

    expect((await screen.findAllByText("Vibora-Topf")).length).toBeGreaterThan(0);
    absatzFehlt("budgets.leerErklaerung");
  });
});

describe("Rücklagen — leer", () => {
  it("sagt, was hierher gehört, und legt von dort aus an", async () => {
    rendere(<RuecklagenScreen />);

    expect(await absatzMit("ruecklagen.leerErklaerung")).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByRole("button", anlegeKnopf("ruecklagen.ruecklage"))[1]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("verschwindet, sobald es eine Rücklage gibt", async () => {
    await sqliteRuecklagenRepository.speichern({ id: "r-hasselbrink", bezeichnung: "Hasselbrink", ziel: 120000, fristMonate: 12, beginn: "2026-01-01" });
    rendere(<RuecklagenScreen />);

    expect((await screen.findAllByText("Hasselbrink")).length).toBeGreaterThan(0);
    absatzFehlt("ruecklagen.leerErklaerung");
  });
});

describe("Buchungen — leer", () => {
  it("zeigt ohne Konto den Weg über den Import", async () => {
    const wohin = vi.fn();
    rendere(<KontenScreen onNavigate={wohin} />);

    expect(await absatzMit("konten.leerOhneKonto")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", zuImport()));
    expect(wohin).toHaveBeenCalledWith("import");
  });

  it("sagt bei einem Konto ohne Buchung, wie sie hereinkommen", async () => {
    await konto();
    rendere(<KontenScreen onNavigate={vi.fn()} />);

    expect(await absatzMit("konten.leerOhneBuchungen")).toBeInTheDocument();
    absatzFehlt("konten.leerOhneKonto");
  });

  it("verschwindet, sobald das Konto eine Buchung hat", async () => {
    await konto();
    await buchung();
    rendere(<KontenScreen onNavigate={vi.fn()} />);

    await waitFor(() => expect(document.querySelectorAll("table").length).toBeGreaterThan(1));
    absatzFehlt("konten.leerOhneBuchungen");
  });
});

describe("Konten verwalten — leer", () => {
  it("nennt beide Wege zum ersten Konto", async () => {
    const wohin = vi.fn();
    rendere(<KontenVerwaltungScreen onNavigate={wohin} />);

    expect(await absatzMit("einstellungen.konto.leerErklaerung")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", zuImport()));
    expect(wohin).toHaveBeenCalledWith("import");
  });

  it("verschwindet, sobald es ein Konto gibt", async () => {
    await konto();
    rendere(<KontenVerwaltungScreen onNavigate={vi.fn()} />);

    expect((await screen.findAllByText("Ohlert Giro")).length).toBeGreaterThan(0);
    absatzFehlt("einstellungen.konto.leerErklaerung");
  });
});

describe("Analyse — leer", () => {
  it("sagt ohne Buchungen, was hier stehen wird, und führt in den Import", async () => {
    const wohin = vi.fn();
    rendere(<AnalyseScreen onNavigate={wohin} />);

    expect(await absatzMit("analyse.leerErklaerung")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", zuImport()));
    expect(wohin).toHaveBeenCalledWith("import");
  });

  it("verschwindet, sobald es eine Buchung gibt", async () => {
    await konto();
    await buchung();
    rendere(<AnalyseScreen onNavigate={vi.fn()} />);

    expect(await screen.findByRole("tab", { name: t("analyse.register.verlauf") })).toBeInTheDocument();
    absatzFehlt("analyse.leerErklaerung");
  });
});

describe("Übersicht — ganz am Anfang", () => {
  it("sagt ohne Buchung und Plan, woraus die Monatskarten rechnen", async () => {
    rendere(<UebersichtScreen />);

    expect(await absatzMit("uebersicht.leerOhneBuchungen")).toBeInTheDocument();
    // Der Hinweis auf die Plan-Daten wäre hier der zweite Schritt vor dem ersten.
    expect(screen.queryByText(t("ergebnis.leer"))).not.toBeInTheDocument();
  });

  it("verschwindet mit der ersten Buchung", async () => {
    await konto();
    await buchung();
    rendere(<UebersichtScreen />);

    expect(await screen.findByText(t("ergebnis.leer"))).toBeInTheDocument();
    absatzFehlt("uebersicht.leerOhneBuchungen");
  });
});

describe("Import — am Ende", () => {
  /** Eine Datei-Zeile mit Kategorie, bereit zum Verbuchen. */
  async function eineZeile() {
    await konto();
    await sqliteKategorieRepository.speichern({ id: "kat-frei", name: "Freizeit", defaultCharakter: "Aufwand" });
    await sqliteImportLaufRepository.speichern({ id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-19T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
    await sqliteUmsatzRepository.anlegen({
      id: "u-1", laufId: "l-datei", rohHash: "h-1", status: "neu",
      zahlungskontoId: "k-ohlert", buchungstag: heute(), betrag: -3100, waehrung: "EUR",
      gegenpartei: "Nordhoff", verwendungszweck: "Rechnung 4711",
      vorschlag: { kategorieId: "kat-frei", charakter: "Aufwand", quelle: "manuell" },
    });
  }
  const verbuchen = async () =>
    userEvent.setup().click(await screen.findByRole("button", { name: t("review.verbuchen", { n: 1 }) }));

  it("zeigt nach dem Verbuchen den nächsten offenen Schritt mit Knopf dorthin", async () => {
    await eineZeile();
    const wohin = vi.fn();
    rendere(<ReviewScreen onNavigate={wohin} />);

    // Vor dem Verbuchen ist der Import nicht zu Ende — noch kein nächster Schritt.
    await screen.findByText("Nordhoff");
    expect(screen.queryByText(t("review.naechsterSchritt"))).not.toBeInTheDocument();

    await verbuchen();
    expect(await screen.findByText(t("review.naechsterSchritt"))).toBeInTheDocument();
    // Konto, Buchung und Kategorie sind da — als Nächstes die Verträge.
    expect(screen.getByText(t("einrichtung.schritt.vertraege.frage"))).toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole("button", { name: t("einrichtung.zuBereich", { bereich: t("shell.navVertraege") }) }),
    );
    expect(wohin).toHaveBeenCalledWith("vertraege");
  });

  it("zeigt nichts Zusätzliches, wenn die Einrichtung fertig ist", async () => {
    await eineZeile();
    await sqliteZahlungsregelRepository.speichern({
      id: "r-vibora", bezeichnung: "Vibora", betrag: -1500, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Aufwand",
    });
    await sqliteBudgetRepository.speichern({
      id: "b-frei", kategorieId: "kat-frei", kontoId: "k-ohlert", art: "monatlich", start: "2026-01-01",
      betraege: [{ abMonat: "2026-01", betrag: 10000 }],
    });
    rendere(<ReviewScreen onNavigate={vi.fn()} />);

    await verbuchen();
    // Verbucht ist, wenn die Inbox leer dasteht.
    expect(await screen.findByText(t("review.leer"))).toBeInTheDocument();
    expect(screen.queryByText(t("review.naechsterSchritt"))).not.toBeInTheDocument();
  });
});
