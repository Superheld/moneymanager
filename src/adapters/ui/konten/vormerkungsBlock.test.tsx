/** @vitest-environment jsdom */
// Der Block über den gebuchten Zeilen: was die Bank kennt und noch nicht gebucht hat.
//
// Alle Werte sind erfunden. Echt sind die Konstellationen: eine Vormerkung ohne Termin
// (manche Banken melden ihre so) und eine, die die Bank ausdrücklich nicht buchen wird.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Vormerkung } from "../../../application";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { VormerkungsBlock } from "./VormerkungsBlock";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function zeige(element: Parameters<typeof rendere>[0]) {
  rendere(element);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

const v = (over: Partial<Vormerkung> = {}): Vormerkung => ({
  id: "vm1",
  zahlungskontoId: "k1",
  datum: "2026-09-06",
  betrag: -2500,
  waehrung: "EUR",
  gegenpartei: "Kesselmann",
  verwendungszweck: "Kartenzahlung",
  erfasstAm: "2026-09-05T20:00:00.000Z",
  ...over,
});

describe("VormerkungsBlock", () => {
  it("zeigt jede Vormerkung mit Empfaenger und Betrag", async () => {
    await zeige(<VormerkungsBlock vormerkungen={[v(), v({ id: "vm2", gegenpartei: "Ohlert" })]} />);
    expect(screen.getByText("Kesselmann")).toBeInTheDocument();
    expect(screen.getByText("Ohlert")).toBeInTheDocument();
  });

  /**
   * Der Block VERSCHWINDET, wenn nichts offen ist — dieselbe Ueberlegung wie bei der
   * Handlungsbedarf-Karte der Uebersicht: eine dauerhafte Zeile „keine Vormerkungen"
   * waere nach zwei Wochen unsichtbar, und dann fiele auch der Fall nicht mehr auf, in
   * dem wirklich etwas ansteht.
   */
  it("verschwindet ganz, wenn nichts offen ist", () => {
    rendere(<VormerkungsBlock vormerkungen={[]} />);
    expect(screen.queryByText("Vorgemerkt")).not.toBeInTheDocument();
  });

  it("nennt eine Vormerkung ohne Termin als solche, statt ein Datum zu erfinden", async () => {
    await zeige(<VormerkungsBlock vormerkungen={[v({ datum: undefined })]} />);
    expect(screen.getByText("ohne Termin")).toBeInTheDocument();
  });

  it("kennzeichnet, was die Bank gar nicht buchen wird", async () => {
    await zeige(<VormerkungsBlock vormerkungen={[v({ buchungsstand: "INFO" })]} />);
    expect(screen.getByText("wird nicht gebucht")).toBeInTheDocument();
  });

  it("nennt einen leeren Empfaenger als solchen", async () => {
    // Eine leere Zelle saehe aus wie ein Anzeigefehler; „ohne Empfaenger" ist die
    // Auskunft, die die Bank tatsaechlich gegeben hat.
    await zeige(<VormerkungsBlock vormerkungen={[v({ gegenpartei: "" })]} />);
    expect(screen.getByText("ohne Empfänger")).toBeInTheDocument();
  });
});
