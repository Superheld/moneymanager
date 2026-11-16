/** @vitest-environment jsdom */
// Hängen mehrere Rücklagen an einer Kategorie, wartet eine Buchung dort, bis jemand sagt,
// welche es war. Hier wird geprüft, dass das an der Zeile ANKOMMT (die Pille), dass der
// Dialog die Wahl anbietet — nur dort, wo es etwas zu wählen gibt —, und dass die Wahl
// bis ins Schema reicht und die Einordnung danach den neuen Satz sagt.
//
// Gesucht über i18n-Schlüssel und selbst angelegte Namen; alle Werte erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import i18n from "../../../i18n/i18n";
import { KontenScreen } from "./KontenScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../../persistence/sqliteLedgerRepository";
import { sqliteRuecklagenRepository as ruecklagenRepo } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteRuecklagenzuordnungRepository as zuordnungRepo } from "../../persistence/sqliteRuecklagenzuordnungRepository";
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

/** Zwei Rücklagen an derselben Kategorie, eine allein an einer anderen, je eine Buchung. */
async function bestand() {
  await kontoRepo.speichern({ id: "kt", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-fern", name: "Fernweh", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-werk", name: "Werkbank", defaultCharakter: "Aufwand" });
  const ruecklage = (id: string, bezeichnung: string, kategorieId: string) =>
    ruecklagenRepo.speichern({ id, bezeichnung, ziel: 60000, fristMonate: 12, beginn: "2026-01-01", kategorieId, art: "abschliessend", findetAb: "2026-02-01" });
  await ruecklage("r-norden", "Hallgrimsen", "kat-fern");
  await ruecklage("r-sueden", "Tellwick", "kat-fern");
  await ruecklage("r-werk", "Tammerbek", "kat-werk");

  const zeile = (id: string, notiz: string, kategorieId: string) =>
    ledgerRepo.speichern({ id, kontoId: "kt", datum: "2026-08-14", betrag: -4200, charakter: "Aufwand", quelle: "manuell", notiz, kategorieId });
  await zeile("b-fern", "Anzahlung Ulvsund", "kat-fern");
  await zeile("b-werk", "Bestellung Merzdorf", "kat-werk");
}

async function zeileVon(name: string) {
  const zelle = await screen.findByText(name);
  const zeile = zelle.closest("tr");
  if (!zeile) throw new Error(`Keine Tabellenzeile um „${name}“`);
  return within(zeile);
}

describe("Zuordnung zu einer Rücklage", () => {
  it("zeigt an der Zeile, dass die Buchung auf eine Zuordnung wartet — und bei einer Rücklage allein ihren Namen", async () => {
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);
    expect((await zeileVon("Anzahlung Ulvsund")).getByText(i18n.t("einordnung.pille.wartet"))).toBeInTheDocument();
    expect(
      (await zeileVon("Bestellung Merzdorf")).getByText(i18n.t("einordnung.pille.ruecklageBenannt", { budget: "Tammerbek" })),
    ).toBeInTheDocument();
  });

  it("bietet im Dialog die Wahl an, speichert sie und sagt danach, welche Rücklage die Buchung trägt", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click(await screen.findByText("Anzahlung Ulvsund"));
    const dialog = within(await screen.findByRole("dialog"));
    const wahl = within(await dialog.findByRole("group", { name: i18n.t("buchungRuecklage.titel") }));
    expect(wahl.getByText(i18n.t("buchungRuecklage.wartetHinweis"))).toBeInTheDocument();

    await auswahlWaehlen(nutzer, i18n.t("buchungRuecklage.feld"), "Tellwick", wahl);
    await waitFor(async () => {
      expect(await zuordnungRepo.alle()).toEqual([{ istbuchungId: "b-fern", kategorieId: "kat-fern", ruecklageId: "r-sueden" }]);
    });
    const einordnung = within(await dialog.findByRole("group", { name: i18n.t("einordnung.titel") }));
    expect(await einordnung.findByText(i18n.t("einordnung.grund.ruecklageBenannt", { budget: "Tellwick" }))).toBeInTheDocument();

    // Und lösen: danach wartet sie wieder.
    await nutzer.click(wahl.getByRole("button", { name: i18n.t("buchungRuecklage.loesen") }));
    await waitFor(async () => expect(await zuordnungRepo.alle()).toEqual([]));
  });

  it("nimmt die Wahl keine Rücklage beim Wort", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await nutzer.click(await screen.findByText("Anzahlung Ulvsund"));
    const dialog = within(await screen.findByRole("dialog"));
    const wahl = within(await dialog.findByRole("group", { name: i18n.t("buchungRuecklage.titel") }));
    await auswahlWaehlen(nutzer, i18n.t("buchungRuecklage.feld"), i18n.t("buchungRuecklage.keine"), wahl);
    await waitFor(async () => {
      expect(await zuordnungRepo.alle()).toEqual([{ istbuchungId: "b-fern", kategorieId: "kat-fern" }]);
    });
    const einordnung = within(await dialog.findByRole("group", { name: i18n.t("einordnung.titel") }));
    expect(await einordnung.findByText(i18n.t("einordnung.grund.ungeplant"))).toBeInTheDocument();
  });

  it("bietet keine Wahl an, wo nur eine Rücklage an der Kategorie hängt", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await nutzer.click(await screen.findByText("Bestellung Merzdorf"));
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByRole("group", { name: i18n.t("einordnung.titel") });
    expect(dialog.queryByRole("group", { name: i18n.t("buchungRuecklage.titel") })).toBeNull();
  });
});
