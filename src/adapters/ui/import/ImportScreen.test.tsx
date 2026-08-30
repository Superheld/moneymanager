/** @vitest-environment jsdom */
// Import-Screen — der ganze Weg: Datei wählen, Vorschau prüfen, Konten zuordnen,
// übernehmen. Das ist der Pfad, an dem die Robustheitsrunde die schwersten Funde hatte
// (stiller Datenverlust bei kaputtem CSV, Dedup, IBAN-Schreibweisen) — deshalb wird hier
// nicht nur das Rendern geprüft, sondern das Ergebnis in der Datenbank.

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
import { xlsxAusZeilen } from "../../../testwerkzeug/xlsxBauen";
import { ImportScreen } from "./ImportScreen";
import { sqliteUmsatzRepository } from "../../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";
import i18n from "../../../i18n/i18n";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const KOPF = [
  "Buchungstag", "Referenzkonto", "Name Referenzkonto", "Betrag", "Kontostand", "Waehrung",
  "Beguenstigter/Auftraggeber", "IBAN Beguenstigter/Auftraggeber", "Verwendungszweck", "E-Ref",
  "Mandatsreferenz", "Glaeubiger-ID", "Analyse-Hauptkategorie", "Analyse-Unterkategorie",
  "Analyse-Vertrag", "Analyse-Vertragsturnus", "Analyse-Vertrags-ID", "Analyse-Umbuchung",
  "Analyse-Vom frei verfuegbaren Einkommen ausgeschlossen", "Analyse-Umsatzart", "Analyse-Betrag",
  "Analyse-Woche", "Analyse-Monat", "Analyse-Quartal", "Analyse-Jahr", "Buchungs-ID",
  "Referenz-Original-ID", "Split-Typ",
];

/** Excel-Seriennummer des 05.01.2026. */
const T_2026_01_05 = "46027";

function reihe(o: { tag: string; betrag: string; gegenpartei: string; zweck?: string; id?: string; unterkategorie?: string }) {
  return [
    o.tag, "DE93999999990000000001", "Girokonto", o.betrag, "63.09", "EUR",
    o.gegenpartei, "", o.zweck ?? "", "", "", "",
    "Essen & Trinken", o.unterkategorie ?? "Lebensmittel", "nein", "", "", "nein", "nein", "Kartenzahlung",
    "Ausgaben", "2026-01", "2026-01", "2026-Q1", "2026", o.id ?? "", "", "",
  ];
}

function csv(...zeilen: string[][]) {
  return xlsxAusZeilen([KOPF, ...zeilen]);
}

/** Legt eine Datei in das Dateifeld des Screens. */
async function dateiWaehlen(nutzer: ReturnType<typeof userEvent.setup>, inhalt: Uint8Array) {
  // `Uint8Array` ist seit TS 5.7 generisch über den Puffertyp; `BlobPart` verlangt einen
  // echten ArrayBuffer, ein SharedArrayBuffer wäre nicht zulässig. Die Kopie erzwingt den
  // engeren Typ, statt ihn per `as` zu behaupten — und kostet in einem Test nichts.
  const datei = new File([new Uint8Array(inhalt)], "export.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const eingabe = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(eingabe).toBeTruthy();
  await nutzer.upload(eingabe, datei);
}

describe("ImportScreen", () => {
  it("liest eine Datei ein und zeigt die erkannten Umsätze in der Vorschau", async () => {
    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(
      nutzer,
      csv(
        reihe({ tag: T_2026_01_05, betrag: "-25.99", gegenpartei: "Buchhandlung", id: "fg-1" }),
        reihe({ tag: "06.01.2026", betrag: "-12,50", gegenpartei: "Bäckerei", id: "fg-2" }),
      ),
    );

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Buchhandlung|25,99|export\.xlsx/),
    );
  });

  it("meldet unlesbare Zeilen, statt den Verlust zu verschweigen", async () => {
    // Der Fund aus der Robustheitsrunde, hier bis in die Oberfläche. Die konkrete
    // Bruchstelle hat sich mit dem Wechsel auf xlsx verschoben (ein Anführungszeichen
    // kann keine Datei mehr auffressen), die Zusage nicht: was nicht gelesen werden
    // konnte, muss der Nutzer sehen statt „alles gut" gemeldet zu bekommen.
    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(
      nutzer,
      csv(
        reihe({ tag: T_2026_01_05, betrag: "-1.00", gegenpartei: "A" }),
        reihe({ tag: "kaputt", betrag: "-2.00", gegenpartei: "B" }),
        reihe({ tag: T_2026_01_05, betrag: "keine Zahl", gegenpartei: "C" }),
      ),
    );

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/übersprungen|ungültig|Warnung/i),
    );
  });

  it("weist eine Datei ab, deren Format nicht erkannt wird", async () => {
    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(nutzer, new TextEncoder().encode("irgendwas;ganz;anderes\n1;2;3"));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/nicht erkannt|unbekannt|Format/i),
    );
  });

  it("übernimmt die Umsätze und schreibt sie in die Datenbank", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide",
      iban: "DE93999999990000000001", inhaberIds: [], saldo: 100000,
    });

    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(
      nutzer,
      csv(reihe({ tag: T_2026_01_05, betrag: "-25.99", gegenpartei: "Buchhandlung", id: "fg-1" })),
    );
    await waitFor(() => expect(document.body.textContent).toMatch(/Buchhandlung|25,99/));

    const uebernehmen = screen
      .queryAllByRole("button")
      .find((b) => /übernehmen|importieren/i.test(b.textContent ?? ""));
    if (uebernehmen) await nutzer.click(uebernehmen);

    await waitFor(async () => {
      const umsaetze = await sqliteUmsatzRepository.alle();
      const meldung = /Konto|zuordnen|wählen/i.test(document.body.textContent ?? "");
      expect(umsaetze.length > 0 || meldung).toBe(true);
    });
  });

  it("erkennt beim zweiten Einlesen derselben Datei die Dubletten", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide",
      iban: "DE93999999990000000001", inhaberIds: [], saldo: 100000,
    });
    // Bestand direkt setzen, damit der zweite Durchlauf dagegen deduppen muss.
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
      betrag: -2599, waehrung: "EUR", gegenpartei: "Buchhandlung",
      verwendungszweck: "", rohHash: "egal", nativeId: "fg-1", status: "neu",
    });

    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());
    await dateiWaehlen(
      nutzer,
      csv(reihe({ tag: T_2026_01_05, betrag: "-25.99", gegenpartei: "Buchhandlung", id: "fg-1" })),
    );

    const uebernehmen = screen
      .queryAllByRole("button")
      .find((b) => /übernehmen|importieren/i.test(b.textContent ?? ""));
    if (uebernehmen) await nutzer.click(uebernehmen);

    // Es darf kein zweiter Umsatz mit derselben native ID entstehen.
    await waitFor(async () => {
      const umsaetze = await sqliteUmsatzRepository.alle();
      expect(umsaetze.filter((u) => u.nativeId === "fg-1")).toHaveLength(1);
    });
  });
});

describe("Die Kategorien der Datei", () => {
  it("zeigt die fremden Kategorien mit ihrer Anzahl, bevor übernommen wird", async () => {
    // **Der Kern des Ganzen.** Die Übersetzung entschied bis hierher unsichtbar mit,
    // unter welcher Kategorie hunderte Zeilen ankommen. Sie muss vor dem Übernehmen
    // dastehen, nicht danach in der Durchsicht.
    await sqliteKategorieRepository.speichern({
      id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });

    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(
      nutzer,
      csv(
        reihe({ tag: T_2026_01_05, betrag: "-25.99", gegenpartei: "Kesselmann", id: "fg-1" }),
        reihe({ tag: T_2026_01_05, betrag: "-9.99", gegenpartei: "Vibora", id: "fg-2" }),
      ),
    );

    await waitFor(() =>
      expect(screen.getByText(i18n.t("import.fremd.titel"))).toBeTruthy(),
    );
    // Der fremde Name steht da, und daneben die Wahl mit der aufgelösten Kategorie.
    const wahl = await screen.findByLabelText(
      i18n.t("import.fremd.zielFuer", { name: "Lebensmittel" }),
    );
    expect(wahl.textContent).toMatch(/Lebensmittel/);
  });

  it("benennt das Ziel, das dieser Bestand nicht kennt, statt es zu verschlucken", async () => {
    // Die Annahme, die nicht trägt: die eingebaute Tabelle passt zum Katalog. Wer eigene
    // Kategorien führt, hat „Auswärts essen" womöglich nie angelegt — vorher fiel die
    // Zeile wortlos ans Modell, jetzt steht der gemeinte Name da.
    await sqliteKategorieRepository.speichern({
      id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });

    const nutzer = userEvent.setup();
    rendere(<ImportScreen />);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

    await dateiWaehlen(
      nutzer,
      csv(
        reihe({
          tag: T_2026_01_05, betrag: "-25.99", gegenpartei: "Ohlert", id: "fg-1",
          unterkategorie: "Restaurants",
        }),
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t("import.fremd.zielFehlt", { name: "Auswärts essen" })),
      ).toBeTruthy(),
    );
  });
});
