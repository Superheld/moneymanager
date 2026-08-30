/** @vitest-environment jsdom */
// Die Import-Inbox als einzige Vorstufe — was der Dateiimport bringt, wird vorher geprüft.
//
// Der Dublettenverdacht hing bis 2026-08-20 nur am Konto-Block „Neu von der Bank". Den
// gibt es nicht mehr; die Prüfung, die den Dateiimport absichert, muss also hier stehen.
//
// Namen und Beträge sind erfunden — das Repo ist öffentlich.

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
import { ReviewScreen } from "./ReviewScreen";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../../persistence/sqliteStammdatenRepositories";
import i18n from "../../../i18n/i18n";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const GEMEINSAM = {
  zahlungskontoId: "k1", buchungstag: "2026-08-11", betrag: -5700, waehrung: "EUR",
  gegenpartei: "Musterladen", verwendungszweck: "Musterladen, Musterstadt",
};

async function grunddaten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await laufRepo.speichern({ id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-19T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
  await laufRepo.speichern({ id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-18T09:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
}

describe("Import-Inbox", () => {
  it("meldet an der Zeile, dass es sie womöglich schon gibt", async () => {
    await grunddaten();
    // Die Bank hat dieselbe Zahlung schon gebracht und sie ist längst gebucht.
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-bank", laufId: "l-bank", rohHash: "h-bank",
      status: "verbucht", istbuchungId: "b-bank",
    });
    // Und jetzt kommt sie aus einer Datei noch einmal herein.
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-datei", laufId: "l-datei", rohHash: "h-datei", status: "neu",
    });

    rendere(<ReviewScreen />);

    await waitFor(async () => {
      expect(await screen.findByText(/steht schon drin|könnte doppelt sein/)).toBeInTheDocument();
    });
    // Mit Begründung — eine Markierung ohne Grund ist nicht überprüfbar.
    expect(await screen.findByText(/Gründe:/)).toBeInTheDocument();
    // Und der Hinweis nennt den Zustand des Gegenstücks.
    expect(await screen.findByText(/bereits gebucht/)).toBeInTheDocument();
  });

  it("schweigt bei einer Zeile ohne Gegenstück", async () => {
    await grunddaten();
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-datei", laufId: "l-datei", rohHash: "h-datei", status: "neu",
    });

    rendere(<ReviewScreen />);

    await screen.findByText("Musterladen");
    expect(screen.queryByText(/steht schon drin|könnte doppelt sein/)).not.toBeInTheDocument();
  });
});

describe("Mehrere Zeilen auf einmal", () => {
  /** Zwei offene Zeilen und ein Katalog, aus dem gewählt werden kann. */
  async function stapel() {
    await grunddaten();
    await kategorieRepo.speichern({ id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-1", laufId: "l-datei", rohHash: "h-1", status: "neu",
      gegenpartei: "Kesselmann",
    });
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-2", laufId: "l-datei", rohHash: "h-2", status: "neu",
      gegenpartei: "Vibora",
    });
  }

  /** Schaltet den Sammelmodus ein und markiert alles, was gerade dasteht. */
  async function alleMarkieren(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click(await screen.findByLabelText(i18n.t("review.sammel.modus")));
    await nutzer.click(await screen.findByLabelText(i18n.t("review.sammel.alleWaehlen")));
  }

  it("zeigt die Kästchen erst, wenn man den Modus einschaltet", async () => {
    // Sonst trüge jede Zeile für immer ein Kästchen, das man in den meisten Sitzungen
    // nicht braucht — die Inbox ist die Ansicht, in der man ZEILENWEISE arbeitet.
    await stapel();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);

    await screen.findByText("Kesselmann");
    expect(screen.queryByLabelText(i18n.t("review.sammel.zeileWaehlen"))).not.toBeInTheDocument();

    await nutzer.click(await screen.findByLabelText(i18n.t("review.sammel.modus")));
    expect(await screen.findAllByLabelText(i18n.t("review.sammel.zeileWaehlen"))).toHaveLength(2);
  });

  it("setzt die Kategorie an allen markierten Zeilen", async () => {
    // **Der Kern der Sammelbearbeitung.** Was die Übersetzung der Quelle nicht abdeckt,
    // bliebe sonst Zeile für Zeile liegen — und was Zeile für Zeile zu tun ist, bleibt
    // bei einem Jahresexport einfach liegen.
    await stapel();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await screen.findByText("Kesselmann");
    await alleMarkieren(nutzer);

    await nutzer.click(await screen.findByLabelText(i18n.t("review.sammel.kategorieSetzen")));
    const treffer = await screen.findAllByText("Lebensmittel");
    await nutzer.click(treffer[treffer.length - 1]);

    await waitFor(async () => {
      const alle = await umsatzRepo.alle();
      expect(alle.map((u) => u.vorschlag?.kategorieId)).toEqual(["k-le", "k-le"]);
    });
    // Von Hand gesetzt — daran hängt, dass ein Training das als Korrektur lesen darf.
    expect((await umsatzRepo.alle())[0].vorschlag?.quelle).toBe("manuell");
  });

  it("legt alle markierten Zeilen auf einmal weg", async () => {
    await stapel();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await screen.findByText("Kesselmann");
    await alleMarkieren(nutzer);

    await nutzer.click(await screen.findByText(i18n.t("review.sammel.weglegen", { n: 2 })));

    // Weggelegt heisst NICHT gelöscht: die Zeilen stehen weiter in der Datenbank und
    // zählen bei der nächsten Dublettenprüfung mit.
    await waitFor(async () => {
      const alle = await umsatzRepo.alle();
      expect(alle.filter((u) => u.status === "verworfen")).toHaveLength(2);
    });
  });

  it("lässt eine Umbuchung in Ruhe und sagt das vorher", async () => {
    // **Die Regel, die der Sammelweg nicht aushebeln darf.** Die Einzelansicht bietet bei
    // einer Umbuchung gar keine Kategoriewahl an.
    await grunddaten();
    await kategorieRepo.speichern({ id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await umsatzRepo.anlegen({
      ...GEMEINSAM, id: "u-um", laufId: "l-datei", rohHash: "h-um", status: "neu",
      gegenpartei: "Eigenes Konto",
      vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" },
    });

    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    await screen.findByText("Eigenes Konto");
    await alleMarkieren(nutzer);

    expect(
      await screen.findByText(i18n.t("review.sammel.umbuchungHinweis", { n: 1 })),
    ).toBeInTheDocument();
  });
});
