/** @vitest-environment jsdom */
// Die Karte „Was da ist" — der Stand je Kontoklasse, und was davon gebunden ist.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { Database } from "sql.js";
import i18n from "../../../i18n/i18n";

// Die Karte braucht keine Daten aus der Datenbank, der Einstellungs-Kontext um sie herum
// schon (Währung, Zahlenformat).
const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { VermoegenKarte } from "./VermoegenKarte";
import type { Klassenbilanz } from "../../../core";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const text = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte);

const LIQUIDE: Klassenbilanz = { klasse: "liquide", stand: 250000, kontenAnzahl: 1, gebunden: 0, frei: 250000, fehlt: 0, posten: [] };
const RUECKLAGE: Klassenbilanz = {
  klasse: "ruecklage", stand: 500000, kontenAnzahl: 1, gebunden: 300000, frei: 200000, fehlt: 0,
  posten: [{ id: "r1", kontoId: "tg", betrag: 300000, gedeckt: 300000 }],
};
const NAMEN = new Map([["r1", "Gerät"]]);

describe("VermoegenKarte", () => {
  it("zeigt unter einer Klasse, wofür ihr Geld bestimmt ist und was frei bleibt", async () => {
    rendere(<VermoegenKarte klassen={[LIQUIDE, RUECKLAGE]} namen={NAMEN} />);
    expect(await screen.findByText("Gerät")).toBeInTheDocument();
    // Der Anspruch steht an seiner Zeile und noch einmal als „davon gebunden" in der Summe.
    expect(screen.getAllByText("3.000,00")).toHaveLength(2);
    // Frei in der Klasse und frei insgesamt (2.000 + 2.500).
    expect(screen.getByText("2.000,00")).toBeInTheDocument();
    expect(screen.getByText("4.500,00")).toBeInTheDocument();
    expect(screen.getByText(text("uebersicht.vermoegenGebunden"))).toBeInTheDocument();
  });

  it("teilt nichts auf, wo nichts gebunden ist", async () => {
    rendere(<VermoegenKarte klassen={[LIQUIDE]} namen={new Map()} />);
    await screen.findByText(text("uebersicht.vermoegenTitel"));
    expect(screen.queryByText(text("uebersicht.vermoegenFrei"))).not.toBeInTheDocument();
  });

  it("sagt in Worten, wenn auf den Konten weniger liegt als beansprucht", async () => {
    const knapp: Klassenbilanz = { ...RUECKLAGE, stand: 100000, gebunden: 100000, frei: 0, fehlt: 200000 };
    rendere(<VermoegenKarte klassen={[knapp]} namen={NAMEN} />);
    expect(await screen.findByText(/2\.000,00/)).toHaveTextContent(text("uebersicht.vermoegenFehlt", { betrag: "2.000,00 €" }));
  });
});
