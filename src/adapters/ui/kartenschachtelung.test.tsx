/** @vitest-environment jsdom */
// Keine Karte in einer Karte.
//
// `Card` trägt die Fläche der App — Hintergrund, Haarlinien-Rahmen, Innenabstände. Steckt
// eine in der anderen, liegen zwei Rahmen um dieselbe Sache, der Inhalt rückt zweimal ein,
// und die Trennung, die eine Karte leisten soll, wird zur Verschachtelung.
//
// Der Test steht hier, weil es beim Aufklappen zweimal passiert ist: eine Detailliste
// unter eine Tabelle zu setzen ist naheliegend — und die Tabelle steckt selbst schon in
// einer Karte, was man ihr im Code nicht ansieht. Geprüft wird am gerenderten DOM und
// nicht am Quelltext: die Verschachtelung entsteht erst dort, oft über zwei Dateien
// hinweg.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../testwerkzeug/harness";
import { KontenVerwaltung } from "./konten/KontenVerwaltung";
import { KontenScreen } from "./konten/KontenScreen";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../persistence/sqliteImportRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Karten erkennt man an ihrer Fläche, nicht an einer Klasse: `Card` setzt sie als
 * Inline-Stil. Eine Klassenprüfung ginge daneben, sobald jemand die Karte umbaut — und
 * genau dann soll dieser Test noch stimmen.
 *
 * **Die Fläche allein reicht als Merkmal NICHT.** `var(--surface)` steht auch an Dingen,
 * die keine Karte sind und in einer stehen dürfen — der Segment-Filter über dem Auszug
 * etwa, ein Kasten mit heller Fläche und Rahmen. Der Radius entscheidet: `--r-xl` (18 px)
 * trägt im ganzen Projekt ausschliesslich `Card`, alles andere ist `--r-md` oder kleiner.
 * Mit der Fläche allein meldete dieser Test eine Verschachtelung, die keine war — und ein
 * Wächter, der schon bei richtigem Code rot ist, wird abgeschaltet.
 */
function verschachtelteKarten(): number {
  const karten = [...document.querySelectorAll<HTMLElement>("div")].filter((d) => {
    const stil = d.getAttribute("style") ?? "";
    return stil.includes("var(--surface)") && stil.includes("var(--r-xl)");
  });
  return karten.filter((k) => karten.some((andere) => andere !== k && andere.contains(k))).length;
}

describe("Karten liegen nebeneinander, nicht ineinander", () => {
  it("haelt die aufgeklappte Buchungsliste NEBEN der Kontentabelle", async () => {
    await kontoRepo.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await laufRepo.speichern({
      id: "l1", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z",
      dateiname: "auszug.csv", eingelesen: 1, neu: 1, duplikate: 0,
    });
    await umsatzRepo.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-08-05",
      betrag: -1250, waehrung: "EUR", gegenpartei: "Kesselmann Anlagen",
      verwendungszweck: "Rechnung", rohHash: "h1", status: "neu",
    });

    rendere(
      <KontenVerwaltung
        konten={[{ id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 }]}
        personen={[]}
        personName={new Map()}
        kontostaende={[]}
        hatGebuchtes={false}
        verbindungen={new Map()}
        onTrennen={async () => {}}
        onChange={() => {}}
      />,
    );

    const link = await screen.findByRole("button", { name: /Girokonto/ });
    expect(verschachtelteKarten()).toBe(0);

    await userEvent.click(link);
    await waitFor(() =>
      expect(document.body.textContent ?? "").toContain("Kesselmann Anlagen"),
    );

    expect(verschachtelteKarten()).toBe(0);
  });

  /**
   * Der Auszug: Kopf, Gebuchtes und Geplantes sind DREI Karten nebeneinander.
   *
   * Die Falle ist hier eine andere als oben und deshalb einen eigenen Fall wert: die
   * beiden Tabellen standen bis 2026-08-25 in EINER Karte, und sie in zwei aufzuteilen
   * ist der naheliegende Handgriff — samt dem ebenso naheliegenden Fehler, sie in der
   * bestehenden Karte zu lassen. Im Code sieht man das nicht, weil die Klammer, die sie
   * umschliesst, zweihundert Zeilen weiter oben steht.
   */
  it("stellt Auszugskopf, Gebuchtes und Geplantes NEBENeinander", async () => {
    await kontoRepo.speichern({
      id: "k1", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 50000,
    });
    await ledgerRepo.speichern({
      id: "b1", kontoId: "k1", datum: "2026-08-12", betrag: -1899,
      charakter: "Aufwand", quelle: "manuell", notiz: "Wocheneinkauf",
    });

    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findByText("Wocheneinkauf");

    expect(verschachtelteKarten()).toBe(0);
  });
});
