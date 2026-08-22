/** @vitest-environment jsdom */
// Die Herkunftsansicht: was hereinkam, und was daraus wurde.
//
// Der Kern ist die Sichtbarkeit der WEGGELEGTEN Zeilen. Sie liegen seit jeher in der
// Datenbank, waren aber nirgends je Konto zu sehen — die Import-Inbox zeigt nur
// Weggelegtes aus Dateien und filtert nicht nach Konto. Geprüft wird deshalb an den
// Daten, die der Test angelegt hat, nicht an Beschriftungen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { HerkunftBereich } from "./HerkunftBereich";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../../persistence/sqliteImportRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function bestand() {
  await kontoRepo.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
  });
  await laufRepo.speichern({
    id: "l1", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z",
    dateiname: "auszug.csv", eingelesen: 2, neu: 2, duplikate: 0,
  });
  // Ein Abruf, der NICHTS gebracht hat — der Regelfall beim Rückgriff.
  await laufRepo.speichern({
    id: "l2", quelle: "fints", zeitpunkt: "2026-08-20T09:00:00.000Z",
    eingelesen: 9, neu: 0, duplikate: 9,
  });
  await umsatzRepo.speichern({
    id: "u-gebucht", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-08-05",
    betrag: -1250, waehrung: "EUR", gegenpartei: "Thalberg Vibora", verwendungszweck: "Rechnung",
    rohHash: "h1", status: "verbucht", istbuchungId: "b1",
  });
  await umsatzRepo.speichern({
    id: "u-weg", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-08-06",
    betrag: -4400, waehrung: "EUR", gegenpartei: "Ohlert Seewinkel", verwendungszweck: "Beitrag",
    rohHash: "h2", status: "verworfen",
  });
}

describe("Herkunft je Konto", () => {
  it("zeigt weggelegte Zeilen, die sonst nirgends sichtbar sind", async () => {
    await bestand();
    rendere(<HerkunftBereich />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Thalberg Vibora");
      expect(text).toContain("Ohlert Seewinkel");
    });
  });

  it("filtert auf die weggelegten", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<HerkunftBereich />);

    await nutzer.click(await screen.findByRole("button", { name: /^weggelegt$/i }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Ohlert Seewinkel");
      expect(text).not.toContain("Thalberg Vibora");
    });
  });

  /**
   * Der Rückweg. Er existierte als Use-Case, war aber für Kontozeilen nirgends
   * erreichbar — „verworfen" heisst nicht „gab es nicht", sondern „ich buche sie nicht",
   * und wer sich dabei vertut, verliert den Betrag aus dem Kontostand.
   */
  it("holt eine weggelegte Zeile zurück in den Stapel", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<HerkunftBereich />);

    await nutzer.click(await screen.findByRole("button", { name: /^weggelegt$/i }));
    await nutzer.click(await screen.findByRole("button", { name: /zurückholen/i }));

    await waitFor(async () => {
      const u = (await umsatzRepo.alle()).find((x) => x.id === "u-weg");
      expect(u?.status).toBe("neu");
    });
  });

  /**
   * Der Rückgriff sorgt dafür, dass die meisten Abrufe nichts Neues bringen. Stünden sie
   * gleichwertig in der Liste, wäre sie überwiegend Rauschen — und die Läufe, bei denen
   * etwas passiert ist, gingen darin unter.
   */
  it("fasst Läufe ohne neue Zeilen zusammen, statt sie einzeln zu zeigen", async () => {
    await bestand();
    // Ein Umsatz aus dem Abruf, der als Duplikat weggelegt wurde: der Lauf hat also
    // gearbeitet, aber nichts beigetragen.
    await umsatzRepo.speichern({
      id: "u-dup", laufId: "l2", zahlungskontoId: "k1", buchungstag: "2026-08-05",
      betrag: -1250, waehrung: "EUR", gegenpartei: "Thalberg Vibora", verwendungszweck: "Rechnung",
      rohHash: "h3", status: "duplikat",
    });
    rendere(<HerkunftBereich />);

    expect(await screen.findByRole("button", { name: /1 weitere/i })).toBeInTheDocument();
  });

  it("sagt es, wenn für ein Konto noch nie etwas eingelesen wurde", async () => {
    await kontoRepo.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    rendere(<HerkunftBereich />);

    await waitFor(() => expect(document.body.textContent).toMatch(/noch nie etwas eingelesen/i));
  });
});
