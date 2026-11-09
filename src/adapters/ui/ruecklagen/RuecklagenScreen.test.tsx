/** @vitest-environment jsdom */
// Die Bedienpfade der Rücklagen: bearbeiten, ausbuchen, löschen.
//
// Das reine Anzeigen war abgedeckt, die Wege dahin nicht — und dort sitzt die Fachlogik,
// die bei einem Fehler still das Falsche tut: „bearbeiten" darf keine ZWEITE Rücklage
// anlegen, und „ausgebucht" startet den Zyklus neu, statt nur ein Datum zu ändern.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Legt eine Rücklage mit Ziel und Frist an und wartet, bis der Screen sie zeigt. */
async function mitRuecklage(bezeichnung: string, ziel: number, frist: number) {
  await sqliteRuecklagenRepository.speichern({
    id: `rue-${bezeichnung}`,
    bezeichnung,
    beginn: "2024-03-01",
    ziel,
    fristMonate: frist,
  });
  rendere(<RuecklagenScreen />);
  await waitFor(() => expect(document.body.textContent).toMatch(bezeichnung));
}

describe("Rücklagen — bearbeiten", () => {
  it("übernimmt die Änderung am selben Gegenstand, statt einen zweiten anzulegen", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Trockner", 60000, 120);

    await nutzer.click(screen.getByRole("button", { name: "bearbeiten" }));

    // Der Dialog kommt vorbelegt — sonst überschriebe ein Speichern die Felder mit Leere.
    const felder = await screen.findAllByRole("textbox");
    expect((felder[0] as HTMLInputElement).value).toBe("Trockner");

    await nutzer.clear(felder[0]);
    await nutzer.type(felder[0], "Trockner (Ersatzgerät)");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const alle = await sqliteRuecklagenRepository.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0].bezeichnung).toBe("Trockner (Ersatzgerät)");
      expect(alle[0].id).toBe("rue-Trockner");
    });
  });
});

describe("Rücklagen — ausbuchen", () => {
  it("startet den Zyklus neu und zieht das Ziel nach", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Rasenmaeher", 40000, 96);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));

    // Der Dialog schlägt das bisherige Ziel vor; hier wird es erhöht (Preise steigen).
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "520");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r.ziel).toBe(52000);
      // Der Zyklus beginnt neu: der Beginn ist nicht mehr der alte Tag.
      expect(r.beginn).not.toBe("2024-03-01");
    });
  });

  it("meldet ein unbrauchbares Ziel, statt es zu speichern", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Werkbank", 30000, 60);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "0");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    // Der Fehler steht am Dialog, und der Bestand ist unangetastet.
    await waitFor(() => expect(document.querySelector(".err")).not.toBeNull());
    const [r] = await sqliteRuecklagenRepository.alle();
    expect(r.ziel).toBe(30000);
    expect(r.beginn).toBe("2024-03-01");
  });

  /**
   * Die freie Rücklage ist der andere Ausgang derselben Handlung — und der Grund,
   * warum es kein Feld „wiederkehrend" gibt: die Form entscheidet.
   */
  it("beendet eine freie Rücklage, statt sie neu zu starten", async () => {
    const nutzer = userEvent.setup();
    await sqliteRuecklagenRepository.speichern({
      id: "rue-frei", bezeichnung: "Urlaubskasse", beginn: "2024-03-01", rate: 5000,
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Urlaubskasse"));

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    // Ohne Ziel gibt es auch kein Zielfeld im Dialog.
    expect(screen.queryByLabelText(/^Ziel/)).toBeNull();
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
    // Was sie gekostet hat, bleibt trotzdem festgehalten.
    expect(await sqliteRuecklagenRepository.ausbuchungen()).toHaveLength(1);
  });
});

describe("Rücklagen — löschen", () => {
  /**
   * Die eigentliche Zusage der Rückfrage — und die einzige, die man testen muss: dass
   * Abbrechen NICHTS tut. Ein Dialog, der aufgeht und trotzdem löscht, wäre schlimmer
   * als gar keiner, weil er Sicherheit vortäuscht.
   */
  it("löscht nicht, wenn die Rückfrage abgebrochen wird", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    await nutzer.click(await screen.findByRole("button", { name: "Abbrechen" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Endgültig löschen" })).toBeNull();
    });
    expect(await sqliteRuecklagenRepository.alle()).toHaveLength(1);
  });

  it("entfernt die Rücklage aus dem Bestand", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    // Seit 2026-08-27 fragt jeder Löschweg nach — bestätigen gehört jetzt dazu.
    await nutzer.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
  });
});

/**
 * „Diesen Monat" zählt, was auf den Rücklagenkonten EINGEHT, und zeigt die Buchungen
 * dazu — bis 2026-11-08 stand dort „geflossen", und woraus die Zahl bestand, stand
 * nirgends. Daneben misst der Tacho den Stand der Rücklagenkonten an der Faustformel.
 */
describe("Rücklagen — diesen Monat und die Faustformel", () => {
  it("zählt Umbuchung und Zinsen als eingegangen und misst den Stand an der Faustformel", async () => {
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    const { sqliteLedgerRepository } = await import("../../persistence/sqliteLedgerRepository");
    const { sqliteVertragRepository } = await import("../../persistence/sqliteVertragRepository");
    const { sqliteZahlungsregelRepository } = await import("../../persistence/sqliteZahlungsregelRepository");
    const n = new Date();
    const tag = (d: number) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 100000 });
    // Die Faustformel braucht Vertragseinnahmen: 1.000,00 im Monat → 3.000,00.
    await sqliteVertragRepository.speichern({ id: "v1", anbieter: "Arbeitgeber", beginn: "2024-01-01", verlaengerung: "keine", status: "aktiv" });
    await sqliteZahlungsregelRepository.speichern({
      id: "r1", bezeichnung: "Gehalt", betrag: 100000, rhythmus: "monatlich", startdatum: "2024-01-01",
      charakter: "Ertrag", kontoId: "giro", vertragId: "v1",
    });
    await sqliteLedgerRepository.speichern({
      id: "ab", datum: tag(1), betrag: -20000, kontoId: "giro", charakter: "Umschichtung", quelle: "manuell",
      transferId: "t1", gegenkontoId: "tg",
    });
    await sqliteLedgerRepository.speichern({
      id: "zu", datum: tag(1), betrag: 20000, kontoId: "tg", charakter: "Umschichtung", quelle: "manuell",
      transferId: "t1", gegenkontoId: "giro",
    });
    await sqliteLedgerRepository.speichern({
      id: "zins", datum: tag(1), betrag: 312, kontoId: "tg", charakter: "Ertrag", quelle: "manuell",
    });

    await mitRuecklage("Waschmaschine", 60000, 12);

    // 200,00 Umbuchung + 3,12 Zinsen — das Paar zählt einmal, die Zinsen zählen mit.
    await waitFor(() => expect(document.body.textContent).toMatch(/203,12/));
    expect(document.body.textContent).toMatch(/eingegangen/);
    expect(document.body.textContent).toMatch(/von Girokonto/);
    expect(document.body.textContent).toMatch(/Zinsen oder Gutschrift/);
    // Stand 1.000,00 + 203,12 = 1.203,12 gegen 3.000,00 → 40 %, es fehlen 1.796,88.
    expect(document.body.textContent).toMatch(/40 %/);
    expect(document.body.textContent).toMatch(/1\.796,88/);
  });

  it("misst den Stand eines Kontos, auf dem eine Rücklage liegt, auch wenn es nicht als Rücklage eingestuft ist", async () => {
    // Der Tacho stand bis 2026-11-09 auf null, sobald die Rücklagen auf einem Konto der
    // Klasse „Sparen" lagen — die Zuordnung an der Rücklage zählte nicht.
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    const { sqliteVertragRepository } = await import("../../persistence/sqliteVertragRepository");
    const { sqliteZahlungsregelRepository } = await import("../../persistence/sqliteZahlungsregelRepository");
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await sqliteZahlungskontoRepository.speichern({ id: "spar", bezeichnung: "Sparkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 150000 });
    await sqliteVertragRepository.speichern({ id: "v1", anbieter: "Arbeitgeber", beginn: "2024-01-01", verlaengerung: "keine", status: "aktiv" });
    await sqliteZahlungsregelRepository.speichern({
      id: "r1", bezeichnung: "Gehalt", betrag: 100000, rhythmus: "monatlich", startdatum: "2024-01-01",
      charakter: "Ertrag", kontoId: "giro", vertragId: "v1",
    });
    await sqliteRuecklagenRepository.speichern({ id: "rk", bezeichnung: "Puffer", rate: 5000, beginn: "2026-01-01", kontoId: "spar" });
    rendere(<RuecklagenScreen />);
    // 1.500,00 gegen 3.000,00 → 50 %.
    await waitFor(() => expect(document.body.textContent).toMatch(/50 %/));
    expect(document.body.textContent).toMatch(/1\.500,00/);
  });
});
