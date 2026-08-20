/** @vitest-environment jsdom */
// Dubletten im Kontoauszug — die drei Fälle, die gemeldet wurden.
//
//   1. Der Zwilling ist gelöscht, der Dialog mahnt trotzdem weiter (zwei Rechenwege).
//   2. „Kein Duplikat" fehlte ganz — eine Fehleinschätzung des Finders war nicht abzulegen.
//   3. Der Filter „könnten doppelt sein" blieb an, wenn der letzte Verdacht erledigt war:
//      der Knopf verschwand, der Filter nicht, und die Tabelle stand leer da.
//
// Namen und Beträge sind erfunden; nachgebaut ist nur die FORM, in der sich zwei Quellen
// unterscheiden (die eine hängt den Kartennummern-Block an) — das Repo ist öffentlich.

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
  sqliteDublettenfreigabeRepository as freigabeRepo,
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Dieselbe Zahlung, zweimal im Ledger — einmal aus einer Datei, einmal von der Bank.
 *
 * Zwei LÄUFE, das ist tragend: innerhalb eines Laufs hat die Prüfung beim Import schon
 * entschieden und beide durchgelassen, dort wird nicht nachgetreten.
 */
async function doppelteBuchung({ zweiteImLedger = true } = {}) {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await laufRepo.speichern({ id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-18T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
  await laufRepo.speichern({ id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-19T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });

  await ledgerRepo.speichern({
    id: "b-datei", datum: "2026-08-11", betrag: -5700, kontoId: "k1",
    charakter: "Aufwand", quelle: "import", notiz: "Zeile aus der Datei",
  });
  if (zweiteImLedger) {
    await ledgerRepo.speichern({
      id: "b-bank", datum: "2026-08-11", betrag: -5700, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", notiz: "Zeile von der Bank",
    });
  }

  const gemeinsam = {
    zahlungskontoId: "k1", buchungstag: "2026-08-11", betrag: -5700, waehrung: "EUR",
    gegenpartei: "Musterladen", status: "verbucht" as const,
  };
  await umsatzRepo.speichern({
    ...gemeinsam, id: "u-datei", laufId: "l-datei", istbuchungId: "b-datei",
    verwendungszweck: "Musterladen, Musterstadt", rohHash: "h1",
  });
  await umsatzRepo.speichern({
    ...gemeinsam, id: "u-bank", laufId: "l-bank", istbuchungId: "b-bank",
    verwendungszweck: "Musterladen, Musterstadt DEKarte Nr 1", rohHash: "h2",
  });
}

/** Öffnet die Buchung aus der Datei im Bearbeiten-Dialog. */
async function dialogZurDatei(nutzer: ReturnType<typeof userEvent.setup>) {
  const zeile = (await screen.findByText("Zeile aus der Datei")).closest("tr")!;
  await nutzer.click(within(zeile).getByRole("button", { name: /^bearbeiten$/i }));
  return within(await screen.findByRole("dialog"));
}

describe("Dublettenmarkierung im Auszug", () => {
  it("zeigt im Dialog KEINEN Verdacht, wenn der Zwilling gelöscht wurde", async () => {
    // Der gemeldete Fall. Die Umsatz-Zeile bleibt bewusst so stehen, wie sie ein
    // Altbestand hinterlässt: „verbucht", mit einer istbuchung_id ins Leere.
    await doppelteBuchung({ zweiteImLedger: false });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const dialog = await dialogZurDatei(nutzer);
    await dialog.findByRole("button", { name: /^speichern$/i });
    expect(dialog.queryByText(/könnte doppelt sein|steht schon drin|schon vorhanden/i)).not.toBeInTheDocument();
  });

  it("hält „kein Duplikat“ fest und nimmt danach beide Markierungen zurück", async () => {
    await doppelteBuchung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    // Vorher: beide Zeilen tragen den Verdacht, der Filterknopf zählt sie.
    expect(await screen.findByRole("button", { name: /2 könnten doppelt sein/ })).toBeInTheDocument();

    const dialog = await dialogZurDatei(nutzer);
    await nutzer.click(await dialog.findByRole("button", { name: /kein duplikat/i }));

    await waitFor(async () => expect(await freigabeRepo.alle()).toHaveLength(1));
    const [freigabe] = await freigabeRepo.alle();
    expect([freigabe.umsatzA, freigabe.umsatzB]).toEqual(["u-bank", "u-datei"]);

    // Der Verdachtsblock ist weg, an seiner Stelle steht der Rückweg.
    expect(await dialog.findByRole("button", { name: /wieder prüfen/i })).toBeInTheDocument();

    // Und im Auszug ist der Knopf verschwunden — es gibt nichts mehr zu filtern.
    await nutzer.click(dialog.getByRole("button", { name: /abbrechen/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /könnten doppelt sein/ })).not.toBeInTheDocument(),
    );
  });

  it("lässt den Filter nicht angeschaltet zurück, wenn der letzte Verdacht erledigt ist", async () => {
    // Sonst steht eine leere Tabelle da — und der Knopf, mit dem man den Filter wieder
    // ausschaltet, ist im selben Moment verschwunden.
    await doppelteBuchung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click(await screen.findByRole("button", { name: /2 könnten doppelt sein/ }));
    expect(await screen.findByText("Zeile von der Bank")).toBeInTheDocument();

    const dialog = await dialogZurDatei(nutzer);
    await nutzer.click(await dialog.findByRole("button", { name: /kein duplikat/i }));
    await nutzer.click(dialog.getByRole("button", { name: /abbrechen/i }));

    // Beide Zeilen stehen wieder da — nicht die leere Tabelle des hängenden Filters.
    await waitFor(async () => {
      expect(await screen.findByText("Zeile aus der Datei")).toBeInTheDocument();
      expect(await screen.findByText("Zeile von der Bank")).toBeInTheDocument();
    });
  });
});
