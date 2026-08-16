/** @vitest-environment jsdom */
// Vertragsvorschläge — von der Oberfläche bis ins Schema.
//
// Der Weg ist hier besonders leicht zu brechen, weil er über ZWEI Tabellen läuft: der
// Empfänger steht am `umsatz`, der Betrag an der `ist_buchung`, verbunden über
// `istbuchung_id`. Ein falsches Spalten-Mapping würde die Erkennung nicht knallen
// lassen, sondern still nichts finden — deshalb geht dieser Test durch die echte DB.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { VertraegeScreen } from "./VertraegeScreen";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository } from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const heute = new Date();
const tagVor = (n: number) =>
  new Date(heute.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const tagNach = (n: number) => tagVor(-n);

/** Legt `n` monatliche Abbuchungen samt zugehöriger Umsätze an. */
async function monatsreihe(praefix: string, gegenpartei: string, betrag: number, n = 12) {
  for (let i = 0; i < n; i++) {
    const id = `${praefix}-${i}`;
    const datum = tagVor(i * 30);
    await sqliteLedgerRepository.speichern({
      id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import",
    });
    await sqliteUmsatzRepository.speichern({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
      betrag: -betrag, waehrung: "EUR", gegenpartei, verwendungszweck: "",
      rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
    });
  }
}

/** Dieselbe Reihe als Eingang: positiver Betrag, Charakter Ertrag (Gehalt). */
async function einnahmereihe(praefix: string, gegenpartei: string, betrag: number, n = 12) {
  for (let i = 0; i < n; i++) {
    const id = `${praefix}-${i}`;
    const datum = tagVor(i * 30);
    await sqliteLedgerRepository.speichern({
      id, datum, betrag, kontoId: "k1", charakter: "Ertrag", quelle: "import",
    });
    await sqliteUmsatzRepository.speichern({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
      betrag, waehrung: "EUR", gegenpartei, verwendungszweck: "",
      rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
    });
  }
}

async function konto() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
  });
}

/**
 * Die Maske trennt Vertragsbeginn und erste Fälligkeit. Solange ein Feld beides war,
 * verschob das Nachtragen des echten Vertragsbeginns (2015 statt „heute") sämtliche
 * geplanten Zahlungen — bei einem Jahresvertrag um bis zu elf Monate.
 */
/**
 * Drei Blicke auf denselben Bestand. Geprüft wird an den Zahlen, die der Test selbst
 * anlegt — Reihenfolge und Rücklagenbetrag —, nicht an Beschriftungen.
 */
describe("VertraegeScreen — Ansichten", () => {
  /** Ein Vertrag samt Regel; künftiger Start ⇒ die nächste Fälligkeit IST der Start. */
  async function vertragMitRegel(id: string, anbieter: string, betrag: number, rhythmus: string, start: string) {
    await sqliteVertragRepository.speichern({
      id, anbieter, beginn: start, verlaengerung: "keine", status: "aktiv",
    });
    await sqliteZahlungsregelRepository.speichern({
      id: `r-${id}`, bezeichnung: anbieter, betrag, rhythmus: rhythmus as "monatlich",
      startdatum: start, charakter: "Aufwand", kontoId: "k1", vertragId: id,
    });
  }

  async function bestand() {
    await konto();
    await vertragMitRegel("a", "Alpha", -12000, "jaehrlich", tagNach(40));
    await vertragMitRegel("b", "Beta", -5508, "quartalsweise", tagNach(10));
    await vertragMitRegel("c", "Gamma", -4500, "monatlich", tagNach(100));
  }

  /** Anbieternamen in der Reihenfolge, in der sie in den Tabellen stehen. */
  function zeilenfolge(): string[] {
    return [...document.querySelectorAll("tbody tr")]
      .map((tr) => tr.querySelector("td")?.textContent?.trim() ?? "")
      .filter((x) => ["Alpha", "Beta", "Gamma"].includes(x));
  }

  /** 120 €/Jahr → 10,00 pro Monat; 55,08 €/Quartal → 18,36; monatlich zählt nicht mit. */
  it("nennt den monatlichen Rücklagenbedarf der nicht-monatlichen Verträge", async () => {
    await bestand();
    rendere(<VertraegeScreen />);
    await screen.findByText("Alpha");
    await waitFor(() => expect(document.body.textContent).toMatch(/28,36/));
  });

  it("sortiert die Fälligkeits-Ansicht nach der nächsten Zahlung", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Alpha");

    await nutzer.click(screen.getByRole("button", { name: /fälligkeit/i }));
    // Beta zahlt in 10 Tagen, Alpha in 40, Gamma in 100.
    await waitFor(() => expect(zeilenfolge()).toEqual(["Beta", "Alpha", "Gamma"]));
  });

  it("gruppiert die Turnus-Ansicht nach Takt und zeigt die Rücklage je Vertrag", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Alpha");

    await nutzer.click(screen.getByRole("button", { name: /turnus/i }));
    // Vom kürzesten zum längsten Takt: monatlich, quartalsweise, jährlich.
    await waitFor(() => expect(zeilenfolge()).toEqual(["Gamma", "Beta", "Alpha"]));
    // Die Rücklagen-Spalte steht nur in den nicht-monatlichen Gruppen.
    expect(document.body.textContent).toMatch(/18,36/);
    expect(document.body.textContent).toMatch(/10,00/);
  });
});

describe("VertraegeScreen — Beginn und Fälligkeit", () => {
  it("lässt den Zahlungstakt stehen, wenn der Vertragsbeginn nachgetragen wird", async () => {
    await konto();
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Sportverein", beginn: "2015-03-01",
      verlaengerung: "automatisch", verlaengerungMonate: 12, status: "aktiv",
    });
    await sqliteZahlungsregelRepository.speichern({
      id: "r1", bezeichnung: "Sportverein", betrag: -18000, rhythmus: "jaehrlich",
      startdatum: "2026-04-01", charakter: "Aufwand", kontoId: "k1", vertragId: "v1",
    });

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /bearbeiten/i }));

    // Die erste Fälligkeit kommt aus der Regel, nicht aus dem Vertragsbeginn.
    const faelligkeit = await screen.findByDisplayValue("2026-04-01");
    const vertragsbeginn = screen.getByDisplayValue("2015-03-01");
    fireEvent.change(vertragsbeginn, { target: { value: "2014-01-15" } });
    expect((faelligkeit as HTMLInputElement).value).toBe("2026-04-01");

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      expect((await sqliteVertragRepository.alle())[0].beginn).toBe("2014-01-15");
    });
    expect((await sqliteZahlungsregelRepository.alle())[0].startdatum).toBe("2026-04-01");
  });
});

describe("VertraegeScreen — Vorschläge", () => {
  it("zeigt ohne Buchungen keine Vorschlagskarte", async () => {
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Verträge/));
    expect(document.body.textContent).not.toMatch(/Aus deinen Buchungen erkannt/);
  });

  it("erkennt eine monatliche Abbuchung und schlägt sie vor", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);

    rendere(<VertraegeScreen />);
    expect(await screen.findByText("[anonymisiert] GmbH")).toBeInTheDocument();
    // 1650 Minor Units → „16,50" in de-DE, dazu die Zahl der Zahlungen.
    await waitFor(() => expect(document.body.textContent).toMatch(/16,50/));
    expect(document.body.textContent).toMatch(/Aus deinen Buchungen erkannt/);
  });

  /** Der teure stille Fehler: Einkäufe beim selben Händler sind kein Vertrag. */
  it("schlägt unregelmäßige Einkäufe nicht vor", async () => {
    await konto();
    const abstaende = [0, 2, 60, 63, 65, 120, 122, 180];
    for (const [i, t] of abstaende.entries()) {
      const datum = tagVor(t);
      await sqliteLedgerRepository.speichern({
        id: `e${i}`, datum, betrag: -(1000 + i * 800), kontoId: "k1",
        charakter: "Aufwand", quelle: "import",
      });
      await sqliteUmsatzRepository.speichern({
        id: `ue${i}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
        betrag: -(1000 + i * 800), waehrung: "EUR", gegenpartei: "[anonymisiert]",
        verwendungszweck: "", rohHash: `he${i}`, status: "verbucht", istbuchungId: `e${i}`,
      });
    }
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Verträge/));
    expect(screen.queryByText("[anonymisiert]")).not.toBeInTheDocument();
  });

  /**
   * „Woran erkannt?" — die Begründung hinter dem Vorschlag. Geprüft wird, dass die
   * angezeigten Belege aus dem Befund kommen und nicht aus einem festen Text: der Takt
   * und die Zahl der Termine müssen zu den Buchungen passen, die der Test angelegt hat.
   */
  it("legt die Erkennungsregeln zu einem Vorschlag offen", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("[anonymisiert] GmbH");

    await nutzer.click(screen.getByRole("button", { name: /woran erkannt/i }));

    // Der Schlüssel: ohne Gläubiger-ID gruppiert der normalisierte Name — die
    // Rechtsform „GmbH" fällt dabei weg.
    await waitFor(() => expect(document.body.textContent).toMatch(/netcup/));
    expect(document.body.textContent).not.toMatch(/netcup gmbh/);
    // Der gemessene Takt und das Fenster, gegen das er geprüft wurde.
    expect(document.body.textContent).toMatch(/30 Tage/);
    expect(document.body.textContent).toMatch(/25 bis 38 Tagen/);
  });

  it("füllt beim Übernehmen die Anlege-Maske vor und legt den Vertrag an", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("[anonymisiert] GmbH");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    // Anbieter und Betrag stehen vorbelegt im Formular.
    await waitFor(() => expect(screen.getByDisplayValue("[anonymisiert] GmbH")).toBeInTheDocument());
    expect(screen.getByDisplayValue("16.5")).toBeInTheDocument();

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      const vertraege = await sqliteVertragRepository.alle();
      expect(vertraege).toHaveLength(1);
      expect(vertraege[0].anbieter).toBe("[anonymisiert] GmbH");
    });
    // Die abgeleitete Zahlungsregel trägt Betrag und Rhythmus des Vorschlags.
    const regeln = await sqliteZahlungsregelRepository.alle();
    expect(regeln).toHaveLength(1);
    expect(regeln[0].betrag).toBe(-1650);
    expect(regeln[0].rhythmus).toBe("monatlich");
  });

  /**
   * Einnahmen laufen durch dieselbe Naht wie Ausgaben, nur mit umgekehrtem Vorzeichen.
   * Der Test geht bis in die Regel, weil erst dort sichtbar wird, ob der Charakter das
   * Vorzeichen richtig dreht: ein Gehalt mit negativem Betrag verschöbe die gesamte
   * Liquiditätsplanung.
   */
  it("erkennt ein Gehalt und legt es als Ertrag mit erkanntem Konto an", async () => {
    await konto();
    await einnahmereihe("g", "Musterfirma AG", 250000);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Musterfirma AG");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma AG")).toBeInTheDocument());
    // Konto und Charakter stehen vorbelegt; geprüft wird das unten an der gespeicherten
    // Regel — die Maske könnte sie sonst anzeigen, ohne sie zu übernehmen.
    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      expect(await sqliteVertragRepository.alle()).toHaveLength(1);
    });
    const regeln = await sqliteZahlungsregelRepository.alle();
    expect(regeln[0].betrag).toBe(250000);
    expect(regeln[0].charakter).toBe("Ertrag");
    expect(regeln[0].kontoId).toBe("k1");
  });

  /** Ein erfasster Vertrag darf nicht weiter als Vorschlag erscheinen. */
  it("blendet den Vorschlag aus, sobald der Vertrag existiert", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "netcup", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });

    rendere(<VertraegeScreen />);
    // Der Vertrag selbst steht in der Tabelle, der Vorschlag nicht mehr.
    expect(await screen.findByText("netcup")).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Aus deinen Buchungen erkannt/));
  });

  it("merkt sich ein weggeklicktes Verwerfen über einen Neustart", async () => {
    await konto();
    await monatsreihe("a", "[anonymisiert] GmbH", 1650);
    // Zweiter Kandidat als Anker: nur wenn DER nach dem Neustart wieder dasteht, sind
    // die Vorschläge geladen. Ohne ihn prüfte der Test gegen einen noch leeren Bildschirm
    // und wäre auch dann grün, wenn nichts gespeichert würde.
    await monatsreihe("b", "Octopus Energy", 5135);

    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<VertraegeScreen />);
    await screen.findByText("[anonymisiert] GmbH");

    const verwerfen = screen.getAllByRole("button", { name: /kein vertrag/i });
    // [anonymisiert] steht wegen der Sortierung nach Jahreskosten hinter Octopus.
    await nutzer.click(verwerfen[verwerfen.length - 1]);
    await waitFor(() => expect(screen.queryByText("[anonymisiert] GmbH")).not.toBeInTheDocument());

    // Neu gerendert (wie nach einem App-Start) darf er nicht zurückkommen.
    ersteAnsicht.unmount();
    rendere(<VertraegeScreen />);
    expect(await screen.findByText("Octopus Energy")).toBeInTheDocument();
    expect(screen.queryByText("[anonymisiert] GmbH")).not.toBeInTheDocument();
  });
});
