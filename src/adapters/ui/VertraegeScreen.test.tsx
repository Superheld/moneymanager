/** @vitest-environment jsdom */
// Vertragsvorschläge — von der Oberfläche bis ins Schema.
//
// Der Weg ist hier besonders leicht zu brechen, weil er über ZWEI Tabellen läuft: der
// Empfänger steht am `umsatz`, der Betrag an der `ist_buchung`, verbunden über
// `istbuchung_id`. Ein falsches Spalten-Mapping würde die Erkennung nicht knallen
// lassen, sondern still nichts finden — deshalb geht dieser Test durch die echte DB.

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
import { VertraegeScreen } from "./VertraegeScreen";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository } from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const heute = new Date();
const tagVor = (n: number) =>
  new Date(heute.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Legt `n` monatliche Abbuchungen samt zugehöriger Umsätze an. */
async function monatsreihe(praefix: string, gegenpartei: string, betrag: number, n = 12) {
  for (let i = 0; i < n; i++) {
    const id = `${praefix}-${i}`;
    const datum = tagVor(i * 30);
    await sqliteLedgerRepository.speichern({
      id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import",
    });
    await sqliteUmsatzRepository.speichern({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
      betrag: -betrag, waehrung: "EUR", gegenpartei, verwendungszweck: "",
      rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
    });
  }
}

async function konto() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
  });
}

describe("VertraegeScreen — Vorschläge", () => {
  it("zeigt ohne Buchungen keine Vorschlagskarte", async () => {
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Verträge/));
    expect(document.body.textContent).not.toMatch(/Aus deinen Buchungen erkannt/);
  });

  it("erkennt eine monatliche Abbuchung und schlägt sie vor", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);

    rendere(<VertraegeScreen />);
    expect(await screen.findByText("[anonymisiert] GmbH")).toBeInTheDocument();
    // 1650 Minor Units → „16,50" in de-DE, dazu die Zahl der Zahlungen.
    await waitFor(() => expect(document.body.textContent).toMatch(/16,50/));
    expect(document.body.textContent).toMatch(/Aus deinen Buchungen erkannt/);
  });

  /** Der teure stille Fehler: Einkäufe beim selben Händler sind kein Vertrag. */
  it("schlägt unregelmäßige Einkäufe nicht vor", async () => {
    await konto();
    const abstaende = [0, 2, 60, 63, 65, 120, 122, 180];
    for (const [i, t] of abstaende.entries()) {
      const datum = tagVor(t);
      await sqliteLedgerRepository.speichern({
        id: `e${i}`, datum, betrag: -(1000 + i * 800), kontoId: "k1",
        charakter: "Aufwand", quelle: "import",
      });
      await sqliteUmsatzRepository.speichern({
        id: `ue${i}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
        betrag: -(1000 + i * 800), waehrung: "EUR", gegenpartei: "[anonymisiert]",
        verwendungszweck: "", rohHash: `he${i}`, status: "verbucht", istbuchungId: `e${i}`,
      });
    }
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Verträge/));
    expect(screen.queryByText("[anonymisiert]")).not.toBeInTheDocument();
  });

  it("füllt beim Übernehmen die Anlege-Maske vor und legt den Vertrag an", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("[anonymisiert] GmbH");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    // Anbieter und Betrag stehen vorbelegt im Formular.
    await waitFor(() => expect(screen.getByDisplayValue("[anonymisiert] GmbH")).toBeInTheDocument());
    expect(screen.getByDisplayValue("16.5")).toBeInTheDocument();

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      const vertraege = await sqliteVertragRepository.alle();
      expect(vertraege).toHaveLength(1);
      expect(vertraege[0].anbieter).toBe("[anonymisiert] GmbH");
    });
    // Die abgeleitete Zahlungsregel trägt Betrag und Rhythmus des Vorschlags.
    const regeln = await sqliteZahlungsregelRepository.alle();
    expect(regeln).toHaveLength(1);
    expect(regeln[0].betrag).toBe(-1650);
    expect(regeln[0].rhythmus).toBe("monatlich");
  });

  /** Ein erfasster Vertrag darf nicht weiter als Vorschlag erscheinen. */
  it("blendet den Vorschlag aus, sobald der Vertrag existiert", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "netcup", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });

    rendere(<VertraegeScreen />);
    // Der Vertrag selbst steht in der Tabelle, der Vorschlag nicht mehr.
    expect(await screen.findByText("netcup")).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Aus deinen Buchungen erkannt/));
  });

  it("merkt sich ein weggeklicktes Verwerfen über einen Neustart", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    // Zweiter Kandidat als Anker: nur wenn DER nach dem Neustart wieder dasteht, sind
    // die Vorschläge geladen. Ohne ihn prüfte der Test gegen einen noch leeren Bildschirm
    // und wäre auch dann grün, wenn nichts gespeichert würde.
    await monatsreihe("b", "Octopus Energy", 5135);

    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<VertraegeScreen />);
    await screen.findByText("[anonymisiert] GmbH");

    const verwerfen = screen.getAllByRole("button", { name: /kein vertrag/i });
    // [anonymisiert] steht wegen der Sortierung nach Jahreskosten hinter Octopus.
    await nutzer.click(verwerfen[verwerfen.length - 1]);
    await waitFor(() => expect(screen.queryByText("[anonymisiert] GmbH")).not.toBeInTheDocument());

    // Neu gerendert (wie nach einem App-Start) darf er nicht zurückkommen.
    ersteAnsicht.unmount();
    rendere(<VertraegeScreen />);
    expect(await screen.findByText("Octopus Energy")).toBeInTheDocument();
    expect(screen.queryByText("[anonymisiert] GmbH")).not.toBeInTheDocument();
  });
});
