/** @vitest-environment jsdom */
// Die Herkunftsansicht: was hereinkam, und was daraus wurde.
//
// Der Kern ist die Sichtbarkeit der WEGGELEGTEN Zeilen. Sie liegen seit jeher in der
// Datenbank, waren aber nirgends je Konto zu sehen — die Import-Inbox zeigt nur
// Weggelegtes aus Dateien und filtert nicht nach Konto. Geprüft wird deshalb an den
// Daten, die der Test angelegt hat, nicht an Beschriftungen.

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
import { HerkunftBereich } from "./HerkunftBereich";
import { KontenVerwaltung } from "./KontenVerwaltung";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../../persistence/sqliteImportRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function bestand() {
  await kontoRepo.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
  });
  await laufRepo.speichern({
    id: "l1", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z",
    dateiname: "auszug.csv", eingelesen: 2, neu: 2, duplikate: 0,
  });
  // Ein Abruf, der NICHTS gebracht hat — der Regelfall beim Rückgriff.
  await laufRepo.speichern({
    id: "l2", quelle: "fints", zeitpunkt: "2026-08-20T09:00:00.000Z",
    eingelesen: 9, neu: 0, duplikate: 9,
  });
  await umsatzRepo.anlegen({
    id: "u-gebucht", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-08-05",
    betrag: -1250, waehrung: "EUR", gegenpartei: "Thalberg Vibora", verwendungszweck: "Rechnung",
    rohHash: "h1", status: "verbucht", istbuchungId: "b1",
  });
  await umsatzRepo.anlegen({
    id: "u-weg", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-08-06",
    betrag: -4400, waehrung: "EUR", gegenpartei: "Ohlert Seewinkel", verwendungszweck: "Beitrag",
    rohHash: "h2", status: "verworfen",
  });
}

describe("Herkunft je Konto", () => {
  it("zeigt weggelegte Zeilen, die sonst nirgends sichtbar sind", async () => {
    await bestand();
    rendere(<HerkunftBereich />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Thalberg Vibora");
      expect(text).toContain("Ohlert Seewinkel");
    });
  });

  it("filtert auf die weggelegten", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<HerkunftBereich />);

    await nutzer.click(await screen.findByRole("button", { name: /^weggelegt$/i }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Ohlert Seewinkel");
      expect(text).not.toContain("Thalberg Vibora");
    });
  });

  /**
   * Der Rückweg. Er existierte als Use-Case, war aber für Kontozeilen nirgends
   * erreichbar — „verworfen" heisst nicht „gab es nicht", sondern „ich buche sie nicht",
   * und wer sich dabei vertut, verliert den Betrag aus dem Kontostand.
   */
  it("holt eine weggelegte Zeile zurück in den Stapel", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<HerkunftBereich />);

    await nutzer.click(await screen.findByRole("button", { name: /^weggelegt$/i }));
    await nutzer.click(await screen.findByRole("button", { name: /zurückholen/i }));

    await waitFor(async () => {
      const u = (await umsatzRepo.alle()).find((x) => x.id === "u-weg");
      expect(u?.status).toBe("neu");
    });
  });

  /**
   * Der Rückgriff sorgt dafür, dass die meisten Abrufe nichts Neues bringen. Stünden sie
   * gleichwertig in der Liste, wäre sie überwiegend Rauschen — und die Läufe, bei denen
   * etwas passiert ist, gingen darin unter.
   */
  /**
   * Der Rueckgriff holt bei jedem Abruf einige Tage doppelt, damit nachgetragene
   * Buchungen nicht verlorengehen — die Mehrzahl aller Laeufe bringt deshalb nichts Neues.
   * Sie wegzulassen saehe aus, als waere nie abgerufen worden, und genau das ist die
   * Frage, mit der man hierherkommt. Sie stehen also da und tragen einen Vermerk.
   */
  it("nennt einen Import, der nichts Neues brachte, beim Namen", async () => {
    await bestand();
    await laufRepo.speichern({
      id: "l-leer", quelle: "fints", zugangId: "z1",
      zeitpunkt: "2026-08-21T09:00:00.000Z", eingelesen: 9, neu: 0, duplikate: 9,
    });
    // Ein Umsatz aus dem Abruf, der als Duplikat weggelegt wurde: der Lauf hat also
    // gearbeitet, aber nichts beigetragen.
    await umsatzRepo.anlegen({
      id: "u-dup", laufId: "l-leer", zahlungskontoId: "k1", buchungstag: "2026-08-05",
      betrag: -1250, waehrung: "EUR", gegenpartei: "Thalberg Vibora", verwendungszweck: "Rechnung",
      rohHash: "h3", status: "duplikat",
    });
    rendere(<HerkunftBereich kontoId="k1" zugangId="z1" />);

    await waitFor(() => expect(document.body.textContent ?? "").toContain("21.08.2026"));
    expect(document.body.textContent ?? "").toMatch(/nichts Neues/i);
  });

  it("sagt es, wenn ueber diesen Zugang noch nie etwas abgerufen wurde", async () => {
    await bestand();
    rendere(<HerkunftBereich kontoId="k1" zugangId="z-ohne-abruf" />);

    await waitFor(() => expect(document.body.textContent).toMatch(/noch nichts abgerufen/i));
  });
});

describe("Der Weg dorthin — vom Konto zu dem, was hereinkam", () => {
  async function zweiKonten() {
    await bestand();
    await kontoRepo.speichern({
      id: "k2", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage",
      inhaberIds: [], saldo: 0,
    });
    await umsatzRepo.anlegen({
      id: "u-tg", laufId: "l1", zahlungskontoId: "k2", buchungstag: "2026-08-07",
      betrag: -900, waehrung: "EUR", gegenpartei: "Kesselmann Anlagen",
      verwendungszweck: "Uebertrag", rohHash: "h3", status: "neu",
    });
  }

  const konten = [
    { id: "k1", bezeichnung: "Girokonto", typ: "Giro" as const, klasse: "liquide" as const, inhaberIds: [], saldo: 0 },
    { id: "k2", bezeichnung: "Tagesgeld", typ: "Tagesgeld" as const, klasse: "ruecklage" as const, inhaberIds: [], saldo: 0 },
  ];

  function verwaltung() {
    return rendere(
      <KontenVerwaltung
        konten={konten}
        personen={[]}
        personName={new Map()}
        kontostaende={[]}
        hatGebuchtes={false}
        verbindungen={new Map()}
        onTrennen={async () => {}}
        onChange={() => {}}
      />,
    );
  }

  /**
   * Die Verwaltung stand lange stumm da: Tabellen, in denen nichts zu klicken schien.
   * `DataTable` KANN die ganze Zeile klickbar machen, aber das sieht man ihr nicht an —
   * der Cursor wechselt, sonst nichts, und wer eine Tabelle vor sich hat, probiert nicht
   * jede Zeile durch.
   *
   * Ueber die Rolle gegriffen und nicht ueber den Text: dass der Bezeichner ueberhaupt
   * ein BEDIENELEMENT ist, ist die halbe Zusicherung — sonst findet ihn keine
   * Vorlesehilfe.
   */
  it("klappt die eingelesenen Zeilen unter der Tabelle auf", async () => {
    await zweiKonten();
    verwaltung();

    // Vorher steht dort nichts davon.
    expect(document.body.textContent ?? "").not.toContain("Kesselmann Anlagen");

    await userEvent.click(await screen.findByRole("button", { name: /Tagesgeld/ }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Kesselmann Anlagen");
      // Und NUR dieses Konto — nicht die Zeilen des anderen.
      expect(text).not.toContain("Thalberg Vibora");
    });
  });

  /**
   * Aufklappen heisst auch zuklappen. Ein Bedienelement, das nur in eine Richtung geht,
   * zwingt zum Neuladen, um wieder zur Uebersicht zu kommen.
   */
  it("klappt beim zweiten Klick wieder zu", async () => {
    await zweiKonten();
    verwaltung();

    const link = await screen.findByRole("button", { name: /Tagesgeld/ });
    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").toContain("Kesselmann Anlagen"));

    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").not.toContain("Kesselmann Anlagen"));
  });

  /**
   * Eingebettet fuehrt der Bereich KEINE eigene Kontowahl mehr: er steht unter einer
   * Tabelle, in der schon gewaehlt wurde, und eine zweite Auswahl daneben fragte dasselbe
   * noch einmal.
   */
  it("zeigt eingebettet keine zweite Kontowahl", async () => {
    await zweiKonten();
    rendere(<HerkunftBereich kontoId="k2" />);

    await waitFor(() => expect(document.body.textContent ?? "").toContain("Kesselmann Anlagen"));
    expect(screen.queryByRole("button", { name: /^Girokonto/ })).toBeNull();
  });
});

describe("Zwei Fragen, zwei Antworten — Konto gegen Zugang", () => {
  /**
   * Der Unterschied, um den es geht:
   *
   *   Unter der KONTENLISTE lautet die Frage „was steht fuer dieses Konto ueberhaupt in
   *   der Datenbank" — darauf waere eine nach Quellen getrennte Antwort keine Antwort.
   *
   *   Unter einem BANKZUGANG lautet sie „was hat DIESER Abruf gebracht". Dort gehoert
   *   eine Zeile aus einer Datei nicht hin, auch wenn sie zum selben Konto gehoert.
   */
  async function ausZweiQuellen() {
    await kontoRepo.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    // Ein Datei-Import — ohne Zugang.
    await laufRepo.speichern({
      id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z",
      dateiname: "auszug.csv", eingelesen: 1, neu: 1, duplikate: 0,
    });
    // Zwei Abrufe ueber denselben Zugang.
    await laufRepo.speichern({
      id: "l-abruf-1", quelle: "fints", zugangId: "z1",
      zeitpunkt: "2026-08-11T09:00:00.000Z", eingelesen: 1, neu: 1, duplikate: 0,
    });
    await laufRepo.speichern({
      id: "l-abruf-2", quelle: "fints", zugangId: "z1",
      zeitpunkt: "2026-08-12T09:00:00.000Z", eingelesen: 1, neu: 1, duplikate: 0,
    });
    // Und einer ueber einen ANDEREN Zugang.
    await laufRepo.speichern({
      id: "l-fremd", quelle: "fints", zugangId: "z2",
      zeitpunkt: "2026-08-13T09:00:00.000Z", eingelesen: 1, neu: 1, duplikate: 0,
    });

    const zeile = (id: string, laufId: string, wer: string) =>
      umsatzRepo.anlegen({
        id, laufId, zahlungskontoId: "k1", buchungstag: "2026-08-05", betrag: -1250,
        waehrung: "EUR", gegenpartei: wer, verwendungszweck: "Rechnung",
        rohHash: `h-${id}`, status: "neu",
      });
    await zeile("u-datei", "l-datei", "Aus Datei Vibora");
    await zeile("u-abruf-1", "l-abruf-1", "Aus Abruf Eins");
    await zeile("u-abruf-2", "l-abruf-2", "Aus Abruf Zwei");
    await zeile("u-fremd", "l-fremd", "Aus fremdem Zugang");
  }

  it("zeigt unter dem Konto ALLE Zeilen, egal aus welcher Quelle", async () => {
    await ausZweiQuellen();
    rendere(<HerkunftBereich kontoId="k1" />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Aus Datei Vibora");
      expect(text).toContain("Aus Abruf Eins");
      expect(text).toContain("Aus fremdem Zugang");
    });
  });

  /**
   * Unter dem Zugang steht ZUERST die Importliste — nicht der Stapel Zeilen. Ein Stapel
   * beantwortet die Frage nicht, sondern verdeckt sie.
   */
  it("zeigt unter dem Zugang erst die Importe und noch keine Zeilen", async () => {
    await ausZweiQuellen();
    rendere(<HerkunftBereich kontoId="k1" zugangId="z1" />);

    await waitFor(() => expect(document.body.textContent ?? "").toContain("11.08.2026"));
    const text = document.body.textContent ?? "";
    // Beide Abrufe DIESES Zugangs stehen da …
    expect(text).toContain("12.08.2026");
    // … der fremde Zugang und der Datei-Import nicht.
    expect(text).not.toContain("13.08.2026");
    expect(text).not.toContain("10.08.2026");
    // Und noch keine einzige Zeile.
    expect(text).not.toContain("Aus Abruf Eins");
    expect(text).not.toContain("Aus Datei Vibora");
  });

  it("zeigt nach dem Klick auf einen Import nur dessen Zeilen", async () => {
    await ausZweiQuellen();
    rendere(<HerkunftBereich kontoId="k1" zugangId="z1" />);

    await userEvent.click(await screen.findByRole("button", { name: /11\.08\.2026/ }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Aus Abruf Eins");
      // NUR dieser eine Import — nicht der zweite Abruf desselben Zugangs.
      expect(text).not.toContain("Aus Abruf Zwei");
    });
  });

  it("klappt den gewaehlten Import beim zweiten Klick wieder zu", async () => {
    await ausZweiQuellen();
    rendere(<HerkunftBereich kontoId="k1" zugangId="z1" />);

    const link = await screen.findByRole("button", { name: /11\.08\.2026/ });
    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").toContain("Aus Abruf Eins"));

    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").not.toContain("Aus Abruf Eins"));
  });
});
