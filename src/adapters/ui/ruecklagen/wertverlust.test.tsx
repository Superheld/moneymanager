/** @vitest-environment jsdom */
// Der Wertverlust neben einer Rücklage (Migration 82): eintragen im Dialog, anzeigen in der
// Liste und als zweite Linie im Verlauf. Nur Anzeige — der Stand bleibt, was er ist.
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

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import i18n from "../../../i18n/i18n";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteKategorieRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(async () => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
  await sqliteKategorieRepository.speichern({ id: "kat-hasloh", name: "Hasloh", defaultCharakter: "Aufwand" });
});

/** Der Teil eines Textes vor seinem Platzhalter — die Zahl daneben hängt an Tag und Sprache. */
const vor = (schluessel: string) => i18n.t(schluessel, { betrag: "§" }).split("§")[0];

async function mitRuecklage(kauf?: { datum: string; preis: number; nutzungsdauerMonate: number }) {
  await sqliteRuecklagenRepository.speichern({
    id: "rue-ostmann", bezeichnung: "Ostmann", beginn: "2024-03-01", ziel: 60000, fristMonate: 120,
    kategorieId: "kat-hasloh", art: "abschliessend", findetAb: "2024-03-01", kauf,
  });
  rendere(<RuecklagenScreen />);
  await waitFor(() => expect(document.body.textContent).toMatch("Ostmann"));
}

describe("Wertverlust neben einer Rücklage", () => {
  it("steht klein neben dem Stand, mit dem, was fehlt — der Stand bleibt die Zahl der Zeile", async () => {
    // Lange vor dem Beginn gekauft und längst abgeschrieben: der Wertverlust ist der ganze
    // Kaufpreis, gleich an welchem Tag der Test läuft.
    await mitRuecklage({ datum: "2015-01-10", preis: 120000, nutzungsdauerMonate: 60 });
    const text = document.body.textContent ?? "";
    expect(text).toContain(`${vor("ruecklagen.wertverlust.bisHeute")}1.200,00`);
    expect(text).toContain(vor("ruecklagen.wertverlust.fehlt"));
    expect(text).toContain(i18n.t("ruecklagen.standHeute"));
  });

  it("steht ohne Kauf und Nutzungsdauer nicht da", async () => {
    await mitRuecklage();
    expect(document.body.textContent).not.toContain(vor("ruecklagen.wertverlust.bisHeute"));
  });

  it("zeichnet im Verlauf eine zweite Linie mit eigenem Namen in der Legende", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage({ datum: "2015-01-10", preis: 120000, nutzungsdauerMonate: 60 });
    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.verlaufAuf", { name: "Ostmann" }) }));
    await screen.findByText(i18n.t("ruecklagen.wertverlust.legende"));
    expect(document.querySelector("[data-zweite-linie]")).not.toBeNull();
  });

  it("wird im Dialog eingetragen und landet im Schema", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage();
    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.bearbeiten") }));
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.click(dialog.getByRole("button", { name: new RegExp(i18n.t("ruecklagen.wertverlust.titel")) }));
    const datum = dialog.getByRole("textbox", { name: i18n.t("ruecklagen.wertverlust.feldKaufdatum") });
    await nutzer.type(datum, "2024-03-15{Enter}");
    await nutzer.type(dialog.getByRole("textbox", { name: new RegExp(`^${i18n.t("ruecklagen.wertverlust.feldKaufpreis")}`) }), "1200");
    await nutzer.type(dialog.getByRole("textbox", { name: i18n.t("ruecklagen.wertverlust.feldNutzungsdauer") }), "60");
    await nutzer.click(dialog.getByRole("button", { name: i18n.t("ruecklagen.speichern") }));
    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r.kauf).toEqual({ datum: "2024-03-15", preis: 120000, nutzungsdauerMonate: 60 });
      // Ziel und Beginn bleiben, wie sie waren.
      expect(r).toMatchObject({ ziel: 60000, fristMonate: 120, beginn: "2024-03-01" });
    });
  });
});
