/** @vitest-environment jsdom */
// Die Kategorie einer Buchung wird IN der Liste geändert, nicht nur im Dialog.
//
// Sie ist die Angabe, die nach einem Import am häufigsten nicht stimmt, und die Spalte
// zeigte sie bis 2026-08-25 nur an. Wer sie korrigieren wollte, öffnete den Dialog, wählte,
// speicherte und schloss — vier Schritte für eine Entscheidung, die beim Durchsehen der
// Liste längst gefallen ist.
//
// Zwei Zeilen bekommen den Wähler bewusst NICHT: ein Umbuchungs-Bein (trägt gar keine
// Kategorie) und eine aufgeteilte Buchung (trägt mehrere). Bei beiden bliebe unklar, was
// eine Wahl bedeuten soll.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KontenScreen } from "./KontenScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../../persistence/sqliteLedgerRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Ein Konto, zwei Kategorien, eine gebuchte Zahlung in der falschen davon. */
async function bestand() {
  await kontoRepo.speichern({ id: "kt", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-a", name: "Haushalt", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-b", name: "Werkzeug", defaultCharakter: "Aufwand" });
  await ledgerRepo.speichern({
    id: "b1", kontoId: "kt", datum: "2026-08-14", betrag: -4200,
    charakter: "Aufwand", quelle: "import", rohHash: "h1", kategorieId: "kat-a",
    notiz: "Zwischenzahlung Vibora",
  });
}

describe("Kategorie in der Zeile", () => {
  it("ändert die Kategorie einer Buchung direkt aus der Liste", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await screen.findByText("Zwischenzahlung Vibora");
    // Der Wähler trägt den Namen der Spalte, nicht den der Kategorie — in einer Tabelle
    // steht die Beschriftung in der Kopfzeile und nicht am Feld.
    const waehler = await screen.findByRole("button", { name: /^Kategorie$/ });
    expect(within(waehler).getByText("Haushalt")).toBeInTheDocument();

    await nutzer.click(waehler);
    await nutzer.click(await screen.findByRole("button", { name: /Werkzeug/ }));

    await waitFor(async () => {
      const alle = await ledgerRepo.alle();
      expect(alle[0].kategorieId).toBe("kat-b");
      // Die Wahl ist eine Handentscheidung und bleibt vor der Automatik geschützt.
      expect(alle[0].kategorieHerkunft).toBe("manuell");
      // Und sie fasst NICHTS anderes an — allen voran nicht den Betrag.
      expect(alle[0].betrag).toBe(-4200);
      expect(alle[0].datum).toBe("2026-08-14");
    });
  });

  it("bietet an einer aufgeteilten Buchung keinen Wähler an", async () => {
    await bestand();
    await ledgerRepo.speichern({
      id: "b2", kontoId: "kt", datum: "2026-08-15", betrag: -9000,
      charakter: "Aufwand", quelle: "manuell", notiz: "Sammelposten Ohlert",
      aufteilungen: [
        { kategorieId: "kat-a", betrag: -5000 },
        { kategorieId: "kat-b", betrag: -4000 },
      ],
    });
    rendere(<KontenScreen onNavigate={() => {}} />);

    await screen.findByText("Sammelposten Ohlert");
    // Genau einer — der der ungeteilten Buchung aus `bestand()`.
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Kategorie$/ })).toHaveLength(1));
  });
});
