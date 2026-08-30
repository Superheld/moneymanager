/** @vitest-environment jsdom */
// Kontogruppen von der Oberfläche bis ins Schema.
//
// Der Fall, der hier zählt, ist der, den die feste `Kontoklasse` NICHT abbilden kann:
// dasselbe Konto in zwei Gruppen. Geht er verloren, ist die Gruppe nur eine zweite,
// schlechtere Klasse.

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
import { GruppenBereich } from "./GruppenBereich";
import { sqliteKontogruppeRepository as gruppeRepo } from "../../persistence/sqliteKontogruppeRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";
import i18n from "../../../i18n/i18n";

/**
 * Die Beschriftung über den SCHLÜSSEL suchen, nicht über den Wortlaut.
 *
 * In diesem Test ist i18n aufgesetzt — `src/i18n/i18n.ts` initialisiert sich beim
 * Importieren, und die Komponente zieht es über `dienste` herein. `t()` gibt hier also
 * deutschen Text zurück, nicht den Schlüssel. Ihn abzuschreiben machte den Test beim
 * nächsten Wording-Durchgang rot, ohne dass etwas kaputt wäre.
 */
const text = (schluessel: string) => i18n.t(schluessel);

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function konten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Gemeinschaftskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 120000 });
  await kontoRepo.speichern({ id: "k2", bezeichnung: "Portemonnaie", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 4500 });
  await kontoRepo.speichern({ id: "k3", bezeichnung: "Notgroschen", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 300000 });
}

describe("Kontogruppen in der Verwaltung", () => {
  it("legt eine Gruppe mit Konten an und zeigt sie danach", async () => {
    await konten();
    rendere(<GruppenBereich />);
    await screen.findByText(text("konten.gruppen.keine"));

    await userEvent.click(screen.getByText(text("konten.gruppen.anlegen")));
    await userEvent.type(
      screen.getByLabelText(text("konten.gruppen.feldBezeichnung")),
      "Lebenshaltung",
    );
    await userEvent.click(screen.getByLabelText("Gemeinschaftskonto"));
    await userEvent.click(screen.getByLabelText("Portemonnaie"));
    await userEvent.click(screen.getByText(text("konten.speichern")));

    await screen.findByText("Lebenshaltung");
    // Bis ins Schema: die Mitglieder stehen in der eigenen Tabelle, nicht als Textfeld
    // an der Gruppe.
    const [gespeichert] = await gruppeRepo.alle();
    expect([...gespeichert.kontoIds].sort()).toEqual(["k1", "k2"]);
  });

  it("weist eine Gruppe ohne Bezeichnung ab, statt eine namenlose anzulegen", async () => {
    await konten();
    rendere(<GruppenBereich />);
    await screen.findByText(text("konten.gruppen.keine"));

    await userEvent.click(screen.getByText(text("konten.gruppen.anlegen")));
    await userEvent.click(screen.getByLabelText("Gemeinschaftskonto"));
    await userEvent.click(screen.getByText(text("konten.speichern")));

    await waitFor(async () => expect(await gruppeRepo.alle()).toHaveLength(0));
  });

  // Der Kern der Sache: eine Klasse hat ein Konto genau einmal, eine Gruppe beliebig oft.
  it("lässt dasselbe Konto in zwei Gruppen liegen", async () => {
    await konten();
    await gruppeRepo.speichern({ id: "g1", bezeichnung: "Lebenshaltung", kontoIds: ["k1", "k2"] });
    await gruppeRepo.speichern({ id: "g2", bezeichnung: "Urlaubskasse", kontoIds: ["k2", "k3"] });

    rendere(<GruppenBereich />);
    await screen.findByText("Lebenshaltung");
    await screen.findByText("Urlaubskasse");
    expect(screen.getAllByText("Portemonnaie")).toHaveLength(2);
  });

  // Beim Ändern wird die Mitgliederliste ERSETZT. Ohne das Räumen im Repository wüchse
  // sie mit jeder Bearbeitung, und ein entferntes Konto käme nie wieder heraus.
  it("nimmt ein Konto wieder aus der Gruppe heraus", async () => {
    await konten();
    await gruppeRepo.speichern({ id: "g1", bezeichnung: "Lebenshaltung", kontoIds: ["k1", "k2"] });

    rendere(<GruppenBereich />);
    await screen.findByText("Lebenshaltung");
    await userEvent.click(screen.getByText(text("konten.gruppen.bearbeiten")));
    await userEvent.click(screen.getByLabelText("Portemonnaie"));
    await userEvent.click(screen.getByText(text("konten.speichern")));

    await waitFor(async () => {
      const [g] = await gruppeRepo.alle();
      expect(g.kontoIds).toEqual(["k1"]);
    });
  });

  // Eine Gruppe zu löschen sieht danach aus, als nähme sie ihre Konten mit — deshalb
  // steht das Gegenteil in der Rückfrage, und hier ist es festgehalten.
  it("löscht die Gruppe und lässt die Konten stehen", async () => {
    await konten();
    await gruppeRepo.speichern({ id: "g1", bezeichnung: "Lebenshaltung", kontoIds: ["k1", "k2"] });

    rendere(<GruppenBereich />);
    await screen.findByText("Lebenshaltung");
    await userEvent.click(screen.getByText(text("konten.gruppen.loeschen")));
    await screen.findByText(text("konten.gruppen.loeschFolgen"));
    await userEvent.click(screen.getByText(text("loeschen.bestaetigen")));

    await waitFor(async () => expect(await gruppeRepo.alle()).toHaveLength(0));
    expect(await kontoRepo.alle()).toHaveLength(3);
  });
});
