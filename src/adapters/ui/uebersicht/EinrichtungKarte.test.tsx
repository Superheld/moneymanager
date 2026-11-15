/** @vitest-environment jsdom */
// Die Karte „Damit die Zahlen stimmen" — sie zeigt den Weg und führt in den Bereich.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { Database } from "sql.js";
import i18n from "../../../i18n/i18n";

// Die Karte liest nichts aus der Datenbank, der Einstellungs-Kontext um sie herum schon.
const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { EinrichtungKarte } from "./EinrichtungKarte";
import type { Einrichtungsstand } from "../../../core";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const text = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte);

const UNTERWEGS: Einrichtungsstand = {
  fertig: false,
  schritte: [
    { id: "konto", status: "erledigt", freiwillig: false },
    { id: "buchungen", status: "erledigt", freiwillig: false },
    { id: "kategorien", status: "offen", anzahl: 4, freiwillig: false },
    { id: "vertraege", status: "offen", freiwillig: false },
    { id: "budgets", status: "erledigt", freiwillig: false },
    { id: "ruecklagen", status: "offen", freiwillig: true },
  ],
};

describe("EinrichtungKarte", () => {
  it("nennt je offenem Schritt die Frage, den Grund und den Bereich", async () => {
    const wohin = vi.fn();
    rendere(<EinrichtungKarte stand={UNTERWEGS} onNavigate={wohin} />);
    expect(await screen.findByText(text("einrichtung.schritt.vertraege.frage"))).toBeInTheDocument();
    expect(screen.getByText(text("einrichtung.schritt.vertraege.warum"))).toBeInTheDocument();
    expect(screen.getByText(text("einrichtung.schritt.kategorien.warumAnzahl", { count: 4 }))).toBeInTheDocument();
    // Ein erledigter Schritt bleibt als Frage stehen, aber ohne Erklärung und ohne Knopf.
    expect(screen.getByText(text("einrichtung.schritt.konto.frage"))).toBeInTheDocument();
    expect(screen.queryByText(text("einrichtung.schritt.konto.warum"))).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(text("einrichtung.zuBereich", { bereich: text("shell.navVertraege") })));
    expect(wohin).toHaveBeenCalledWith("vertraege");
  });

  it("verschwindet, sobald nur noch Freiwilliges offen ist", async () => {
    const fertig: Einrichtungsstand = {
      fertig: true,
      schritte: UNTERWEGS.schritte.map((s) => (s.freiwillig ? s : { ...s, status: "erledigt" as const })),
    };
    rendere(<><span>anker</span><EinrichtungKarte stand={fertig} /></>);
    await screen.findByText("anker");
    expect(screen.queryByText(text("einrichtung.titel"))).not.toBeInTheDocument();
  });
});
