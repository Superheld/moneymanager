/** @vitest-environment jsdom */
// Die Karte „Wartet auf Zuordnung" im Bereich Rücklagen (Paket 5, ADR-0006): sie zeigt die
// Buchungen, bei denen offen ist, welche Rücklage sie trägt, und lässt direkt wählen. Von
// der Oberfläche bis ins Schema; alle Werte erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";
import i18n from "../../../i18n/i18n";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteRuecklagenzuordnungRepository } from "../../persistence/sqliteRuecklagenzuordnungRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Zwei Rücklagen an derselben Kategorie, eine Buchung dort — sie wartet. */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
  await sqliteKategorieRepository.speichern({ id: "kat-orvl", name: "Orvelisk", defaultCharakter: "Aufwand" });
  for (const [id, name] of [["r-selv", "Selvarik"], ["r-kopr", "Kopranu"]]) {
    await sqliteRuecklagenRepository.speichern({
      id, bezeichnung: name, kategorieId: "kat-orvl", art: "abschliessend", beginn: "2026-01-01", findetAb: "2026-01-01", ziel: 60000, fristMonate: 12,
    });
  }
  await sqliteLedgerRepository.speichern({
    id: "b-orvl", datum: "2026-03-04", betrag: -12345, kontoId: "giro", charakter: "Aufwand", quelle: "manuell",
    kategorieId: "kat-orvl", notiz: "Trevulan",
  });
}

describe("Rücklagen — Wartet auf Zuordnung", () => {
  it("zeigt die wartende Buchung mit Datum, Empfänger, Kategorie und Betrag", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    const titel = await screen.findByText(i18n.t("ruecklagen.wartend.titel"));
    const karte = titel.closest(".card") as HTMLElement ?? document.body;
    expect(karte.textContent).toContain("Trevulan");
    expect(karte.textContent).toContain("Orvelisk");
    expect(karte.textContent).toMatch(/123,45/);
    const wahl = within(karte).getByRole("combobox", { name: i18n.t("ruecklagen.wartend.spalteWahl") });
    // Beide Rücklagen und „keine" stehen zur Wahl, vorbelegt ist nichts.
    expect(wahl.textContent).toContain("Selvarik");
    expect(wahl.textContent).toContain("Kopranu");
    expect(wahl.textContent).toContain(i18n.t("buchungRuecklage.keine"));
    expect((wahl as HTMLSelectElement).value).toBe("");
  });

  it("ordnet zu, und die Zeile verschwindet — samt der Karte, wenn nichts mehr wartet", async () => {
    const nutzer = userEvent.setup();
    await bestand();
    rendere(<RuecklagenScreen />);
    const wahl = await screen.findByRole("combobox", { name: i18n.t("ruecklagen.wartend.spalteWahl") });
    await nutzer.selectOptions(wahl, "r-kopr");

    await waitFor(async () => {
      const [z] = await sqliteRuecklagenzuordnungRepository.alle();
      expect(z).toMatchObject({ istbuchungId: "b-orvl", kategorieId: "kat-orvl", ruecklageId: "r-kopr" });
    });
    await waitFor(() => expect(screen.queryByText(i18n.t("ruecklagen.wartend.titel"))).toBeNull());
  });

  it("nimmt auch ausdrücklich keine Rücklage an", async () => {
    const nutzer = userEvent.setup();
    await bestand();
    rendere(<RuecklagenScreen />);
    const wahl = await screen.findByRole("combobox", { name: i18n.t("ruecklagen.wartend.spalteWahl") });
    await nutzer.selectOptions(wahl, i18n.t("buchungRuecklage.keine"));
    await waitFor(async () => {
      const [z] = await sqliteRuecklagenzuordnungRepository.alle();
      expect(z).toMatchObject({ istbuchungId: "b-orvl", kategorieId: "kat-orvl" });
      expect(z.ruecklageId).toBeUndefined();
    });
    await waitFor(() => expect(screen.queryByText(i18n.t("ruecklagen.wartend.titel"))).toBeNull());
  });

  it("steht nicht da, wenn nichts wartet", async () => {
    await sqliteRuecklagenRepository.speichern({ id: "r-allein", bezeichnung: "Hulvaren", kategorieId: "kat-x", art: "abschliessend", beginn: "2026-01-01", ziel: 1000, fristMonate: 2 });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Hulvaren"));
    expect(screen.queryByText(i18n.t("ruecklagen.wartend.titel"))).toBeNull();
  });
});
