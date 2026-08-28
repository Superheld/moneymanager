/** @vitest-environment jsdom */
// Änderungen zurücknehmen — über die ganze Naht: Ledger schreibt das Journal, der Auszug
// markiert die Zeile, der Dialog zeigt den Unterschied, der Rückweg schreibt zurück.
//
// Warum als DURCHGÄNGIGER Test und nicht je Schicht: das Journal ist an einem Textformat
// verklebt, das nirgends deklariert ist, und die Sicht darauf reicht vom Repository bis in
// die Maske. Ein Feld, das unterwegs verlorengeht, fällt in keinem Einzeltest auf.
//
// Gesucht wird nach Daten, die der Test selbst angelegt hat. Alle Werte sind erfunden.

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
import { KontenScreen } from "../konten/KontenScreen";
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

const URSPRUNG = {
  id: "b-verlauf",
  kontoId: "kt",
  datum: "2026-08-14",
  betrag: -1717,
  charakter: "Aufwand",
  quelle: "manuell",
  kategorieId: "kat-a",
  notiz: "Reifenflicken",
} as const;

async function grunddaten() {
  await kontoRepo.speichern({ id: "kt", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-a", name: "Haushalt", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-b", name: "Werkzeug", defaultCharakter: "Aufwand" });
}

/** Eine Buchung, die einmal angelegt und danach verstellt wurde. */
async function verstellteBuchung() {
  await grunddaten();
  await ledgerRepo.speichern({ ...URSPRUNG });
  await ledgerRepo.speichern({ ...URSPRUNG, betrag: -8383, kategorieId: "kat-b", notiz: "Vertippt" });
}

/** Öffnet den Bearbeiten-Dialog und klappt den Verlauf auf. */
async function verlaufOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Vertippt");
  await nutzer.click((await screen.findAllByRole("button", { name: /bearbeiten/i }))[0]);
  const dialog = within(await screen.findByRole("dialog"));
  await nutzer.click(await dialog.findByRole("button", { name: /verlauf/i }));
  return dialog;
}

describe("Verlauf im Auszug", () => {
  it("markiert die Zeile mit der Zahl der Einträge", async () => {
    await verstellteBuchung();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const zeile = (await screen.findByText("Vertippt")).closest("tr")!;
    // Angelegt und einmal geändert — zwei Einträge.
    expect(within(zeile).getByText(/Verlauf 2/)).toBeInTheDocument();
  });

  it("markiert nichts, wo nichts protokolliert ist", async () => {
    // Der Bestand vor Einführung des Journals: eine Buchung, die an der Schicht vorbei
    // in die Tabelle kam, hat keinen Eintrag — und darf auch keine Markierung tragen.
    await grunddaten();
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle, notiz)
       VALUES ('b-alt','2026-08-10',-2929,'kt','kat-a','Aufwand','manuell','Altbestand')`,
    );
    rendere(<KontenScreen onNavigate={() => {}} />);

    const zeile = (await screen.findByText("Altbestand")).closest("tr")!;
    expect(within(zeile).queryByText(/Verlauf/)).toBeNull();
  });
});

describe("Änderungen zurücknehmen", () => {
  it("zeigt, was sich seit der Entstehung geändert hat", async () => {
    const nutzer = userEvent.setup();
    await verstellteBuchung();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const dialog = await verlaufOeffnen(nutzer);

    // Der Unterschied, nicht bloss eine Liste von Zeitpunkten: alter und neuer Wert.
    // Gesucht wird IN der Unterschieds-Gruppe: „Werkzeug" steht auch in der Kategorieliste
    // des Formulars, und ein Treffer dort wäre keine Aussage über den Verlauf.
    const gruppe = within(await dialog.findByRole("group", { name: /geändert/i }));
    expect(gruppe.getByText("Reifenflicken")).toBeInTheDocument();
    expect(gruppe.getByText("Vertippt")).toBeInTheDocument();
    expect(gruppe.getByText("Haushalt")).toBeInTheDocument();
    expect(gruppe.getByText("Werkzeug")).toBeInTheDocument();
  });

  it("schreibt den Stand von damals zurück", async () => {
    const nutzer = userEvent.setup();
    await verstellteBuchung();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const dialog = await verlaufOeffnen(nutzer);
    await nutzer.click(await dialog.findByRole("button", { name: /änderungen zurücknehmen/i }));
    // Erst die Rückfrage, dann die Tat — der Knopf allein tut nichts.
    await nutzer.click(await dialog.findByRole("button", { name: /^zurücknehmen$/i }));

    await waitFor(async () => {
      const b = (await ledgerRepo.alle()).find((x) => x.id === "b-verlauf");
      expect(b?.betrag).toBe(-1717);
      expect(b?.kategorieId).toBe("kat-a");
      expect(b?.notiz).toBe("Reifenflicken");
    });
  });

  it("bietet den Rückweg nicht an, solange die Buchung unverändert dasteht", async () => {
    const nutzer = userEvent.setup();
    await grunddaten();
    await ledgerRepo.speichern({ ...URSPRUNG, notiz: "Unberuehrt" });
    rendere(<KontenScreen onNavigate={() => {}} />);

    await screen.findByText("Unberuehrt");
    await nutzer.click((await screen.findAllByRole("button", { name: /bearbeiten/i }))[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.click(await dialog.findByRole("button", { name: /verlauf/i }));

    // Kein Knopf, dafür der Grund — ein fehlender Knopf ohne Erklärung wäre die
    // schlechtere Antwort.
    await waitFor(() => expect(dialog.getByText(/steht noch so da/i)).toBeInTheDocument());
    expect(dialog.queryByRole("button", { name: /änderungen zurücknehmen/i })).toBeNull();
  });
});
