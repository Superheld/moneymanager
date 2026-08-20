/** @vitest-environment jsdom */
// Der Kontoauszug mit Anker: stimmt der Stand, und seit wann nicht mehr?
//
// Die Beträge sind erfunden, die Konstellation ist echt: ein Konto, dessen Anfangsbestand
// nur die Zeit vor dem ersten Import überbrückt, und Bankmeldungen, die nicht dazu passen.

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
import { sqliteKontostandsankerRepository as ankerRepo } from "../../persistence/sqliteKontostandRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function konto(saldo: number) {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo });
}

async function buchung(id: string, datum: string, betrag: number) {
  await ledgerRepo.speichern({ id, datum, betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import" });
}

async function anker(datum: string, betrag: number) {
  await ankerRepo.speichern({ kontoId: "k1", datum, herkunft: "bank", betrag, erfasstAm: `${datum}T22:00:00.000Z` });
}

describe("Kontostand gegen den Anker", () => {
  it("nennt die Differenz, wenn der gemeldete Stand nicht zur Rechnung passt", async () => {
    await konto(10000);
    await buchung("b1", "2026-07-10", -3000);
    await anker("2026-07-31", 5000); // die Bank meldet 50,00 statt 70,00

    rendere(<KontenScreen onNavigate={() => {}} />);

    expect(await screen.findByText(/könnte was fehlen|Differenz|−20,00|20,00/)).toBeInTheDocument();
  });

  it("grenzt die Lücke auf den Zeitraum zwischen zwei Ankern ein", async () => {
    // Das ist der eigentliche Gewinn: nicht „irgendwo fehlen 600 €", sondern „im August".
    await konto(10000);
    await buchung("b1", "2026-07-10", -3000);
    await buchung("b2", "2026-08-05", -1000);
    await anker("2026-07-31", 7000); // bis hierhin passt alles
    await anker("2026-08-31", 66000); // danach fehlen 600,00 €

    rendere(<KontenScreen onNavigate={() => {}} />);

    // Der Zeitraum steht da, mit beiden Stichtagen.
    expect(await screen.findByText(/31\.07\.2026.*31\.08\.2026/)).toBeInTheDocument();
  });

  it("gleicht den Anfangsbestand auf Zuruf ab — und dann stimmt es", async () => {
    await konto(10000);
    await buchung("b1", "2026-07-10", -3000);
    await anker("2026-07-31", 5000);
    const nutzer = userEvent.setup();

    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click(await screen.findByRole("button", { name: /anfangsbestand abgleichen/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.click(dialog.getByRole("button", { name: /anfangsbestand setzen/i }));

    // 50,00 gemeldet − (−30,00) gebucht = 80,00 Anfangsbestand.
    await waitFor(async () => {
      expect((await kontoRepo.alle())[0].saldo).toBe(8000);
    });
    // Und der Abgleich-Knopf ist weg, weil es nichts mehr abzugleichen gibt.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /anfangsbestand abgleichen/i })).not.toBeInTheDocument(),
    );
  });

  it("bietet für ein Konto ohne Bankverbindung den Kassensturz an", async () => {
    await konto(4750);
    const nutzer = userEvent.setup();

    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click(await screen.findByRole("button", { name: /stand festhalten/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.clear(dialog.getByLabelText(/stichtag/i));
    await nutzer.type(dialog.getByLabelText(/stichtag/i), "2026-08-20");
    await nutzer.type(dialog.getByLabelText(/^stand$/i), "40,00");
    await nutzer.click(dialog.getByRole("button", { name: /stand festhalten/i }));

    await waitFor(async () => {
      expect(await ankerRepo.alle()).toEqual([
        { kontoId: "k1", datum: "2026-08-20", herkunft: "hand", betrag: 4000, erfasstAm: expect.any(String) },
      ]);
    });
  });
});
