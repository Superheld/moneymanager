/** @vitest-environment jsdom */
// Die Erkennung gegen echtes SQL: die Gegen-IBAN steht am Beleg, die Buchung im Ledger, und
// die Verbindung läuft über `umsatz_verarbeitung.istbuchung_id`. Mit Attrappen fiele nicht
// auf, wenn eine dieser Spalten beim Lesen fehlt, und die Erkennung träfe dann still nie.
//
// Namen und Beträge sind erfunden — das Repo ist öffentlich.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, sqlLaden } from "../../testwerkzeug/harness";
import { umbuchungenErkennen } from "../../application/buchung/umbuchungenErkennen";
import type { IstBuchung } from "../../core";
import { sqliteImportLaufRepository as laufRepo, sqliteUmsatzRepository as umsatzRepo } from "./sqliteImportRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "./sqliteLedgerRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "./sqliteStammdatenRepositories";
import { sqliteJournalRepository as journalRepo } from "./sqliteJournalRepository";

const IBAN_ERSTES = "DE02999999010000001002";
const IBAN_ZWEITES = "DE02999999120000000001";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function bein(id: string, kontoId: string, betrag: number, datum: string, gegenparteiIban?: string) {
  const buchung: IstBuchung = {
    id: `b-${id}`, datum, betrag, kontoId, charakter: betrag < 0 ? "Aufwand" : "Ertrag",
    quelle: "import", rohHash: `h-${id}`,
  };
  await ledgerRepo.speichern(buchung);
  await umsatzRepo.anlegen({
    id: `u-${id}`, laufId: "l1", zahlungskontoId: kontoId, buchungstag: datum, betrag,
    waehrung: "EUR", gegenpartei: "Kesselmann", verwendungszweck: "Uebertrag", gegenparteiIban,
    rohHash: `h-${id}`, status: "verbucht", istbuchungId: buchung.id,
  });
}

const deps = { ledgerRepo, umsatzRepo, kontoRepo };

describe("umbuchungenErkennen gegen echtes SQL", () => {
  beforeEach(async () => {
    await kontoRepo.speichern({ id: "k1", bezeichnung: "Erstes", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0, iban: IBAN_ERSTES });
    await kontoRepo.speichern({ id: "k2", bezeichnung: "Zweites", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0, iban: IBAN_ZWEITES });
    await laufRepo.speichern({ id: "l1", quelle: "fints", zeitpunkt: "2026-03-05T09:00:00Z", eingelesen: 2, neu: 2, duplikate: 0 });
  });

  it("findet die IBAN am Beleg und schreibt beide Beine samt Journal", async () => {
    await bein("ab", "k1", -7300, "2026-03-02", IBAN_ZWEITES);
    await bein("zu", "k2", 7300, "2026-03-04");

    expect(await umbuchungenErkennen(["u-zu"], deps)).toBe(1);

    const [ab, zu] = (await ledgerRepo.alle()).sort((a, b) => a.betrag - b.betrag);
    expect(ab).toMatchObject({ charakter: "Umschichtung", gegenkontoId: "k2", zuPruefen: true });
    expect(zu).toMatchObject({ charakter: "Umschichtung", gegenkontoId: "k1", transferId: ab.transferId });
    expect(ab.transferId).toBeTruthy();
    expect((await journalRepo.zuBuchung("b-ab")).length).toBeGreaterThan(0);
  });

  it("lässt die Beine stehen, wenn das Konto keine IBAN trägt", async () => {
    await kontoRepo.speichern({ id: "k3", bezeichnung: "Drittes", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await bein("ab", "k1", -7300, "2026-03-02", "DE04999999980000000003");
    await bein("zu", "k3", 7300, "2026-03-04");

    expect(await umbuchungenErkennen(["u-zu"], deps)).toBe(0);
    expect((await ledgerRepo.alle()).every((b) => b.transferId === undefined)).toBe(true);
  });
});
