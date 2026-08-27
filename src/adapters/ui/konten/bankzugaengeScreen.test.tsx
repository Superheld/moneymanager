/** @vitest-environment jsdom */
// Die Übersicht der Bankzugänge — was hinterlegt ist und was daran hängt.
//
// Geprüft wird der Teil, der OHNE Bank auskommt. „Prüfen" meldet sich an und ist deshalb
// hier ausgespart; es steckt in `application/fints` und ist dort geprüft. Was bleibt, ist
// mehr als eine Tabelle:
//
//  • Der Leerzustand. Ein Zugang entsteht beim Anlegen eines Online-Kontos, nicht hier —
//    das muss dastehen, sonst sucht man den Anlegen-Knopf, den es nie gab.
//  • Die Zahl der Konten je Zugang. Sie kommt aus den Zuordnungen, nicht aus dem Zugang,
//    und zwei Zugänge dürfen sich dabei nicht ins Gehege kommen.
//  • Der Weg zu den Konten: ein Klick auf den Banknamen klappt sie darunter auf. Ohne
//    ihn wäre die Zuordnung unsichtbar — sie steht in keiner anderen Ansicht.
//  • Was das Profil angeht: es gibt eines oder es gibt keins, und beides sagt etwas.
//    „Noch kein Profil" heisst „noch nie geprüft", nicht „kann nichts".
//
// Alle Werte sind erfunden, die Bankleitzahlen liegen im Bereich 999999xx — den gibt es
// nicht, eine Verwechslung mit einem echten Institut ist damit ausgeschlossen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Bankprofil, Bankzugang } from "../../../application";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { BankzugaengeScreen } from "./BankzugaengeScreen";
import {
  sqliteBankzugangRepository,
  sqliteKontozuordnungRepository,
} from "../../persistence/sqliteBankzugangRepositories";
import { sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const PROFIL: Bankprofil = {
  standAm: "2026-08-20",
  tanVerfahren: [{ id: 900, name: "Bildfreigabe", decoupled: false, mediumPflicht: false, medien: [] }],
  vorfaelle: [{ segment: "HKKAZ", version: 7, speicherzeitraumTage: 90 }],
  kontoVorfaelle: {},
  nationaleFelderErlaubt: false,
};

function zugang(over: Partial<Bankzugang> = {}): Bankzugang {
  return {
    id: "z1",
    bezeichnung: "Kesselmann Bank",
    art: "fints",
    url: "https://fints.example/fints",
    blz: "99999901",
    benutzer: "10203040",
    ...over,
  };
}

async function zeige() {
  rendere(<BankzugaengeScreen />);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

describe("Bankzugänge", () => {
  it("sagt im Leerzustand, wo ein Zugang entsteht", async () => {
    await zeige();
    // Nicht bloss „nichts da": hier gibt es keinen Anlegen-Knopf, und ohne den Satz
    // sucht man ihn.
    await waitFor(() => expect(document.body.textContent).toMatch(/Online-Kontos/));
  });

  it("zeigt Bank, Bankleitzahl und Anmeldenamen jedes Zugangs", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    await zeige();

    expect(await screen.findByText("Kesselmann Bank")).toBeInTheDocument();
    expect(screen.getByText("99999901")).toBeInTheDocument();
    expect(screen.getByText("10203040")).toBeInTheDocument();
  });

  /**
   * Die Zahl kommt aus den ZUORDNUNGEN, nicht aus dem Zugang. Zwei Zugänge nebeneinander
   * sind deshalb der Test, der etwas beweist: eine Zählung ohne Filter gäbe beiden
   * dieselbe Zahl, und das fiele bei einem einzelnen Zugang nie auf.
   */
  it("zählt je Zugang nur dessen eigene Konten", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Zweitkonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteBankzugangRepository.speichern(zugang());
    await sqliteBankzugangRepository.speichern(zugang({ id: "z2", bezeichnung: "Ohlert Bank", blz: "99999902" }));
    await sqliteKontozuordnungRepository.speichern({ zugangId: "z1", schluessel: "s1", zahlungskontoId: "k1" });
    await sqliteKontozuordnungRepository.speichern({ zugangId: "z1", schluessel: "s2", zahlungskontoId: "k2" });

    await zeige();
    await screen.findByText("Kesselmann Bank");

    const zeilen = [...document.querySelectorAll("tbody tr")];
    const kesselmann = zeilen.find((z) => z.textContent?.includes("Kesselmann"));
    const ohlert = zeilen.find((z) => z.textContent?.includes("Ohlert"));
    expect([...kesselmann!.querySelectorAll("td")].some((c) => c.textContent === "2")).toBe(true);
    expect([...ohlert!.querySelectorAll("td")].some((c) => c.textContent === "0")).toBe(true);
  });

  it("klappt über den Banknamen die Konten des Zugangs auf", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteBankzugangRepository.speichern(zugang());
    await sqliteKontozuordnungRepository.speichern({
      zugangId: "z1", schluessel: "DE00999999010000000001", zahlungskontoId: "k1",
    });

    const nutzer = userEvent.setup();
    await zeige();

    // Vorher unsichtbar — die Zuordnung steht in keiner anderen Ansicht.
    expect(screen.queryByText("DE00999999010000000001")).toBeNull();
    await nutzer.click(await screen.findByRole("button", { name: /Zeigt die Konten/ }));

    expect(await screen.findByText("DE00999999010000000001")).toBeInTheDocument();
  });

  it("unterscheidet ein noch nie geprüftes von einem vorhandenen Profil", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    await sqliteBankzugangRepository.speichern(
      zugang({ id: "z2", bezeichnung: "Ohlert Bank", blz: "99999902", profil: JSON.stringify(PROFIL) }),
    );
    await zeige();
    await screen.findByText("Kesselmann Bank");

    // Ohne Profil steht der Hinweis da, mit Profil ein Knopf, der es aufschlägt.
    expect(screen.getByText(/Noch kein Profil/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Was diese Bank kann/ })).toBeInTheDocument();
  });

  it("löscht einen Zugang und lädt die Liste neu", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    const nutzer = userEvent.setup();
    await zeige();
    await screen.findByText("Kesselmann Bank");

    await nutzer.click(screen.getByRole("button", { name: /löschen/i }));
    // Seit 2026-08-27 fragt jeder Löschweg nach — bestätigen gehört jetzt dazu.
    await nutzer.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    await waitFor(async () => expect(await sqliteBankzugangRepository.alle()).toHaveLength(0));
    await waitFor(() => expect(screen.queryByText("Kesselmann Bank")).toBeNull());
  });
});
