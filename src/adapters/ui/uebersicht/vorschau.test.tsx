/** @vitest-environment jsdom */
// „Was noch kommt" — die kontoübergreifende Vorschau in der Übersicht.
//
// Alle Werte erfunden. Echt sind die Konstellationen: zwei Konten mit Fälligkeiten am
// selben Tag, und eine Fälligkeit weit hinten, die vom Zeitraum-Wähler abgeschnitten wird.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Vorschauzeile } from "../../../application";
import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { VorschauKarte } from "./VorschauKarte";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Ein ISO-Datum `n` Tage ab heute — die Karte schneidet gegen die echte Uhr. */
function inTagen(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const kontoNamen = new Map([
  ["k1", "Girokonto"],
  ["k2", "Zweitkonto"],
]);

const zeile = (over: Partial<Vorschauzeile> & { datum: string }): Vorschauzeile => ({
  bezeichnung: "Ohlert Beitrag",
  betrag: -2500,
  charakter: "Aufwand",
  kontoId: "k1",
  planRef: { quelleId: "r1", faelligkeit: over.datum },
  ...over,
});

async function zeige(zeilen: readonly Vorschauzeile[]) {
  rendere(<VorschauKarte zeilen={zeilen} kontoNamen={kontoNamen} />);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

describe("VorschauKarte", () => {
  it("zeigt Fälligkeiten mehrerer Konten in einer Liste, mit dem Konto als Spalte", async () => {
    await zeige([
      zeile({ datum: inTagen(3), bezeichnung: "Kesselmann Rate", kontoId: "k1" }),
      zeile({ datum: inTagen(4), bezeichnung: "Vibora Beitrag", kontoId: "k2", betrag: -1800 }),
    ]);

    expect(await screen.findByText("Kesselmann Rate")).toBeInTheDocument();
    expect(screen.getByText("Vibora Beitrag")).toBeInTheDocument();
    // Genau das, was im Kontoauszug nicht ging: beide Konten nebeneinander benannt.
    expect(screen.getByText("Girokonto")).toBeInTheDocument();
    expect(screen.getByText("Zweitkonto")).toBeInTheDocument();
  });

  /**
   * Der Grund, warum die Vorschau aus dem Kontoauszug ausgezogen ist: die Summe über
   * alle Konten war dort gar nicht zu haben, weil jede Liste nur ihr eigenes Konto kannte.
   */
  it("summiert über alle Konten", async () => {
    await zeige([
      zeile({ datum: inTagen(3), betrag: -2500, kontoId: "k1" }),
      zeile({ datum: inTagen(4), betrag: -1800, kontoId: "k2" }),
    ]);
    // Nach dem WERT suchen, nicht nach der Formulierung: 25,00 + 18,00 = 43,00 Abfluss.
    await waitFor(() => {
      expect(screen.getByText(/43,00/)).toBeInTheDocument();
    });
  });

  it("blendet mit dem Konto-Filter alles andere aus", async () => {
    const nutzer = userEvent.setup();
    await zeige([
      zeile({ datum: inTagen(3), bezeichnung: "Kesselmann Rate", kontoId: "k1" }),
      zeile({ datum: inTagen(4), bezeichnung: "Vibora Beitrag", kontoId: "k2" }),
    ]);
    await screen.findByText("Kesselmann Rate");

    // Eine `Auswahl` ist ein Knopf mit Liste im Portal, kein natives <select> — deshalb
    // über `auswahlWaehlen` und nicht über `selectOptions` (siehe ui/CLAUDE.md).
    await auswahlWaehlen(nutzer, "Konto", "Zweitkonto");

    await waitFor(() => {
      expect(screen.queryByText("Kesselmann Rate")).toBeNull();
    });
    expect(screen.getByText("Vibora Beitrag")).toBeInTheDocument();
  });

  it("schneidet mit dem Zeitraum ab, ohne neu zu laden", async () => {
    await zeige([
      zeile({ datum: inTagen(3), bezeichnung: "Kesselmann Rate" }),
      zeile({ datum: inTagen(75), bezeichnung: "Vibora Jahresbeitrag" }),
    ]);
    // Vorgabe ist 30 Tage — die Fälligkeit in 75 Tagen liegt dahinter.
    expect(await screen.findByText("Kesselmann Rate")).toBeInTheDocument();
    expect(screen.queryByText("Vibora Jahresbeitrag")).toBeNull();
  });

  /**
   * Die Vorschau ZEIGT, was kommt — sie bucht es nicht.
   *
   * Bis 2026-08-25 hing an jeder geplanten Zeile ein Kästchen „als bezahlt markieren", und
   * ein Klick legte daraus eine Ist-Buchung an. Damit stand im Konto eine Zahlung, die
   * niemand belegt hatte: die Bank kannte sie nicht, ein Beleg existierte nicht, und beim
   * nächsten Abruf kam die echte Zeile dazu. Was im Konto steht, kommt aus dem Abruf oder
   * von Hand — nicht aus einer Hochrechnung.
   *
   * Der Test stand bis zum Umzug der Vorschau in `interaktion.test.tsx` am Kontoauszug.
   * Er ist mitgewandert und nicht entfallen: die Zusage gilt der Vorschau, nicht dem Ort.
   */
  it("hängt kein Kästchen an eine geplante Zeile", async () => {
    await zeige([zeile({ datum: inTagen(5), bezeichnung: "Ohlert Beitrag" })]);
    const treffer = await screen.findByText("Ohlert Beitrag");
    expect(within(treffer.closest("tr")!).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("zeigt ohne Fälligkeiten gar keine Tabelle", async () => {
    await zeige([]);
    expect(screen.queryByRole("table")).toBeNull();
    // Und auch keine Kopfzeile einer Tabelle, die ohne Zeilen dastünde.
    expect(screen.queryByRole("columnheader")).toBeNull();
  });
});
