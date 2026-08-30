/** @vitest-environment jsdom */
// Vertragsvorschläge — von der Oberfläche bis ins Schema.
//
// Der Weg ist hier besonders leicht zu brechen, weil er über ZWEI Tabellen läuft: der
// Empfänger steht am `umsatz`, der Betrag an der `ist_buchung`, verbunden über
// `istbuchung_id`. Ein falsches Spalten-Mapping würde die Erkennung nicht knallen
// lassen, sondern still nichts finden — deshalb geht dieser Test durch die echte DB.

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
import { VertraegeScreen } from "./VertraegeScreen";
import { sqliteVertragRepository } from "../../persistence/sqliteVertragRepository";
import {
  sqliteVertragserkennungRepository,
  sqliteVertragszuordnungRepository,
  vertragsAbgleichDeps,
} from "../../persistence/sqliteVertragZuordnungRepositories";
import { zuordnungenAbgleichen } from "../../../application/vertraege/vertragszuordnung";
import { standardErkennung } from "../../../core";
import { sqliteZahlungsregelRepository } from "../../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "../../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";

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
    await sqliteUmsatzRepository.anlegen({
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
    await sqliteUmsatzRepository.anlegen({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
      betrag, waehrung: "EUR", gegenpartei, verwendungszweck: "",
      rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
    });
  }
}

async function konto() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
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
    await vertragMitRegel("b", "Beta", -5544, "quartalsweise", tagNach(10));
    await vertragMitRegel("c", "Gamma", -4700, "monatlich", tagNach(100));
  }

  /** Anbieternamen in der Reihenfolge, in der sie in den Tabellen stehen. */
  function zeilenfolge(): string[] {
    return [...document.querySelectorAll("tbody tr")]
      .map((tr) => tr.querySelector("td")?.textContent?.trim() ?? "")
      .filter((x) => ["Alpha", "Beta", "Gamma"].includes(x));
  }

  /** 120 €/Jahr → 10,00 pro Monat; 55,44 €/Quartal → 18,48; monatlich zählt nicht mit. */
  it("nennt den monatlichen Rücklagenbedarf der nicht-monatlichen Verträge", async () => {
    await bestand();
    rendere(<VertraegeScreen />);
    await screen.findByText("Alpha");
    await waitFor(() => expect(document.body.textContent).toMatch(/28,48/));
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
    expect(document.body.textContent).toMatch(/18,48/);
    expect(document.body.textContent).toMatch(/10,00/);
  });

  /**
   * Der Kopf einer nicht-monatlichen Turnus-Gruppe nennt ZWEI verschiedene Zahlen: was
   * je Fälligkeit abgeht und was das im Monat ausmacht. Vorher standen dort Monatsanteil
   * und Rücklagenbedarf — bei einer reinen Abflussgruppe derselbe Wert, also zweimal
   * dieselbe Aussage. Geprüft an einem BLATTknoten: nur wenn beide Zahlen in einem
   * Element ohne Kinder stehen, ist es wirklich die Kopfzeile und nicht ihr Container.
   */
  it("nennt im Turnus-Kopf Summe je Fälligkeit und Monatsanteil", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Alpha");
    await nutzer.click(screen.getByRole("button", { name: /turnus/i }));

    // Alpha: 120,00 € im Jahr ⇒ 10,00 € pro Monat. Beides im selben Kopf.
    const kopf = await screen.findAllByText(
      (_, el) =>
        !!el &&
        el.children.length === 0 &&
        /120,00/.test(el.textContent ?? "") &&
        /10,00/.test(el.textContent ?? ""),
    );
    expect(kopf.length).toBeGreaterThan(0);
  });
});

describe("VertraegeScreen — Beginn und Fälligkeit", () => {
  it("gruppiert die Verträge nach Kategorie, teuerste Gruppe zuerst", async () => {
    await konto();
    await sqliteKategorieRepository.speichern({ id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "medien", name: "Medien", defaultCharakter: "Aufwand" });
    const vertraege: [string, string, number, string | undefined][] = [
      ["v1", "Vermieter", -90000, "wohnen"],
      ["v2", "Petrossen", -12000, "wohnen"],
      ["v3", "Streamingdienst", -1799, "medien"],
      ["v4", "Ohne Zuordnung", -500, undefined],
    ];
    for (const [id, anbieter, betrag, kategorieId] of vertraege) {
      await sqliteVertragRepository.speichern({
        id, anbieter, beginn: "2025-01-01", verlaengerung: "automatisch", status: "aktiv",
      });
      await sqliteZahlungsregelRepository.speichern({
        id: `r-${id}`, bezeichnung: anbieter, betrag, rhythmus: "monatlich",
        startdatum: "2025-01-01", charakter: "Aufwand", kontoId: "k1", vertragId: id, kategorieId,
      });
    }

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Vermieter");
    await nutzer.click(screen.getByRole("button", { name: "Kategorie" }));

    // Reihenfolge der Gruppen: Monatskosten groß nach klein, „ohne Kategorie" zuletzt.
    // getAllByText liefert in Dokumentreihenfolge — genau das ist hier die Aussage.
    const koepfe = await screen.findAllByText(/^(Wohnen|Medien|Ohne Kategorie)$/);
    expect(koepfe.map((e) => e.textContent)).toEqual(["Wohnen", "Medien", "Ohne Kategorie"]);
    // Die Gruppe trägt ihre Summe: 900 + 120 = 1.020 € pro Monat.
    expect(document.body.textContent).toMatch(/1\.020,00/);
  });

  /**
   * Gebucht wird auf Unterkategorien („Strom", „Gas"), gefragt ist aber die
   * Hauptkategorie: drei Gruppen mit je einem Vertrag beantworten „wofür geht das Geld?"
   * schlechter als eine Gruppe „Wohnen". Geprüft an den Namen, die der Test selbst
   * angelegt hat — die Unterkategorien dürfen NICHT als Gruppenkopf auftauchen.
   */
  it("rollt die Kategorie-Ansicht auf die Hauptkategorie hoch", async () => {
    await konto();
    await sqliteKategorieRepository.speichern({ id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "strom", name: "Strom", elternId: "wohnen", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "gas", name: "Gas", elternId: "wohnen", defaultCharakter: "Aufwand" });
    const vertraege: [string, string, number, string][] = [
      ["v1", "Petrossen Strom", -8000, "strom"],
      ["v2", "Petrossen Gas", -6000, "gas"],
    ];
    for (const [id, anbieter, betrag, kategorieId] of vertraege) {
      await sqliteVertragRepository.speichern({
        id, anbieter, beginn: "2025-01-01", verlaengerung: "automatisch", status: "aktiv",
      });
      await sqliteZahlungsregelRepository.speichern({
        id: `r-${id}`, bezeichnung: anbieter, betrag, rhythmus: "monatlich",
        startdatum: "2025-01-01", charakter: "Aufwand", kontoId: "k1", vertragId: id, kategorieId,
      });
    }

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Petrossen Strom");
    await nutzer.click(screen.getByRole("button", { name: "Kategorie" }));

    // Eine Gruppe „Wohnen" mit beiden Verträgen — 80 + 60 = 140 € pro Monat.
    expect(await screen.findByText("Wohnen")).toBeInTheDocument();
    expect(screen.queryByText("Strom")).toBeNull();
    expect(screen.queryByText("Gas")).toBeNull();
    expect(document.body.textContent).toMatch(/140,00/);
  });

  it("hält die Konditionen zugeklappt und fasst zusammen, was drinsteht", async () => {
    await konto();
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Sportverein", beginn: "2015-03-01", mindestlaufzeitMonate: 24,
      kuendigungsfristMonate: 3, verlaengerung: "automatisch", verlaengerungMonate: 12, status: "aktiv",
    });
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /bearbeiten/i }));

    // Zugeklappt: die Felder sind weg, ihr Inhalt steht trotzdem in der Kopfzeile —
    // sonst müsste man aufklappen, nur um zu sehen, ob es etwas zu sehen gibt.
    const kopf = await screen.findByRole("button", { name: /Vertragsdaten/i });
    expect(kopf).toHaveAttribute("aria-expanded", "false");
    expect(kopf.textContent).toMatch(/24/);
    expect(kopf.textContent).toMatch(/3/);
    // Die Mindestlaufzeit liegt eindeutig im zugeklappten Block (der Vertragsbeginn
    // teilt sein Datum mit der ersten Fälligkeit und taugt nicht als Prüfstein).
    expect(screen.queryByDisplayValue("24")).toBeNull();

    await nutzer.click(kopf);
    expect(await screen.findByDisplayValue("24")).toBeInTheDocument();
  });

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

    // Die Konditionen liegen zugeklappt — der Vertragsbeginn gehört dazu.
    await nutzer.click(await screen.findByRole("button", { name: /Vertragsdaten/i }));

    // Die erste Fälligkeit kommt aus der Regel, nicht aus dem Vertragsbeginn.
    //
    // Beide Felder sind seit 2026-08-25 ein `Datumsfeld` und keine nativen `input[type=date]`
    // mehr: sie zeigen das Datum in der Sprache des Nutzers und übernehmen es beim
    // VERLASSEN, nicht bei jedem Anschlag. Getippt wird hier trotzdem ISO — das erkennt
    // das Feld immer, unabhängig von der Sprache.
    const faelligkeit = await screen.findByRole("textbox", { name: "Erste Fälligkeit" });
    const vertragsbeginn = screen.getByRole("textbox", { name: "Beginn" });
    expect(faelligkeit).toHaveValue("01.04.2026");
    await nutzer.clear(vertragsbeginn);
    await nutzer.type(vertragsbeginn, "2014-01-15{Enter}");
    expect(faelligkeit).toHaveValue("01.04.2026");

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
    await monatsreihe("a", "Vibora GmbH", 1650);

    rendere(<VertraegeScreen />);
    expect(await screen.findByText("Vibora GmbH")).toBeInTheDocument();
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
      await sqliteUmsatzRepository.anlegen({
        id: `ue${i}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
        betrag: -(1000 + i * 800), waehrung: "EUR", gegenpartei: "Nordhoff",
        verwendungszweck: "", rohHash: `he${i}`, status: "verbucht", istbuchungId: `e${i}`,
      });
    }
    rendere(<VertraegeScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Verträge/));
    expect(screen.queryByText("Nordhoff")).not.toBeInTheDocument();
  });

  /**
   * „Woran erkannt?" — die Begründung hinter dem Vorschlag. Geprüft wird, dass die
   * angezeigten Belege aus dem Befund kommen und nicht aus einem festen Text: der Takt
   * und die Zahl der Termine müssen zu den Buchungen passen, die der Test angelegt hat.
   */
  it("legt die Erkennungsregeln zu einem Vorschlag offen", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");

    await nutzer.click(screen.getByRole("button", { name: /woran erkannt/i }));

    // Der Schlüssel: ohne Gläubiger-ID gruppiert der normalisierte Name — die
    // Rechtsform „GmbH" fällt dabei weg.
    await waitFor(() => expect(document.body.textContent).toMatch(/vibora/));
    expect(document.body.textContent).not.toMatch(/vibora gmbh/);
    // Der gemessene Takt und das Fenster, gegen das er geprüft wurde.
    expect(document.body.textContent).toMatch(/30 Tage/);
    expect(document.body.textContent).toMatch(/25 bis 38 Tagen/);
  });

  it("füllt beim Übernehmen die Anlege-Maske vor und legt den Vertrag an", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650);
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    // Anbieter und Betrag stehen vorbelegt im Formular.
    await waitFor(() => expect(screen.getByDisplayValue("Vibora GmbH")).toBeInTheDocument());
    expect(screen.getByDisplayValue("16.5")).toBeInTheDocument();

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      const vertraege = await sqliteVertragRepository.alle();
      expect(vertraege).toHaveLength(1);
      expect(vertraege[0].anbieter).toBe("Vibora GmbH");
    });
    // Die abgeleitete Zahlungsregel trägt Betrag und Rhythmus des Vorschlags.
    const regeln = await sqliteZahlungsregelRepository.alle();
    expect(regeln).toHaveLength(1);
    expect(regeln[0].betrag).toBe(-1650);
    expect(regeln[0].rhythmus).toBe("monatlich");
  });

  /**
   * Der Punkt, an dem aus einem Vorschlag eine echte Verknüpfung wird: der neu erfasste
   * Vertrag muss RÜCKWIRKEND greifen. Seine Zahlungen liegen längst im Bestand — würde
   * die Zuordnung erst ab dem Anlegen wirken, stünde der Vertrag in der Liste, ohne je
   * eine Buchung zu kennen. Geprüft an der gespeicherten Zuordnung, nicht an der Anzeige.
   */
  it("ordnet dem übernommenen Vertrag seine bisherigen Zahlungen zu", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650); // 12 Abbuchungen
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    await waitFor(() => expect(screen.getByDisplayValue("Vibora GmbH")).toBeInTheDocument());
    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      const zuordnungen = await sqliteVertragszuordnungRepository.alle();
      expect(zuordnungen).toHaveLength(12);
    });
    const vertragId = (await sqliteVertragRepository.alle())[0].id;
    const zuordnungen = await sqliteVertragszuordnungRepository.alle();
    expect(zuordnungen.every((z) => z.vertragId === vertragId)).toBe(true);
    expect(zuordnungen.every((z) => z.herkunft === "automatisch")).toBe(true);
  });

  /**
   * Verträge sind älter als die Zuordnung. Ohne das Nachziehen trüge der gesamte Bestand
   * keine Erkennungsregel und damit keine einzige Zuordnung — die Automatik begänne erst
   * beim nächsten neu erfassten Vertrag zu wirken.
   */
  it("zieht die Erkennungsregel für einen Vertrag ohne Regel nach", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650);
    // Direkt ins Repository geschrieben — wie ein Vertrag aus der Zeit vor Migration 19.
    await sqliteVertragRepository.speichern({
      id: "alt", anbieter: "Vibora GmbH", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await sqliteZahlungsregelRepository.speichern({
      id: "r-alt", bezeichnung: "Vibora GmbH", betrag: -1650, rhythmus: "monatlich",
      startdatum: "2025-01-01", charakter: "Aufwand", kontoId: "k1", vertragId: "alt",
    });

    rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");

    await waitFor(async () => {
      expect(await sqliteVertragserkennungRepository.alle()).toHaveLength(1);
      expect(await sqliteVertragszuordnungRepository.alle()).toHaveLength(12);
    });
  });

  /**
   * Der Fall, für den die Regel überhaupt bearbeitbar ist: der Preis ist gestiegen, die
   * neuen Zahlungen fallen aus der Betragsspanne und werden nicht mehr zugeordnet. Der
   * Weg zurück führt über das Nachsteuern der Obergrenze — geprüft am Bestand vorher und
   * nachher, nicht an der Anzeige.
   */
  it("nimmt nach dem Weiten der Betragsspanne die teureren Zahlungen mit auf", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650, 12);
    // Drei spätere Zahlungen zum erhöhten Preis — außerhalb der Standardspanne
    // (60…180 % von 16,50 € = 9,90…29,70 €).
    for (let i = 0; i < 3; i++) {
      const id = `teuer-${i}`;
      const datum = tagVor(400 + i * 30);
      await sqliteLedgerRepository.speichern({
        id, datum, betrag: -4000, kontoId: "k1", charakter: "Aufwand", quelle: "import",
      });
      await sqliteUmsatzRepository.anlegen({
        id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum,
        betrag: -4000, waehrung: "EUR", gegenpartei: "Vibora GmbH", verwendungszweck: "",
        rohHash: `h-${id}`, status: "verbucht", istbuchungId: id,
      });
    }
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Vibora GmbH", beginn: "2024-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await sqliteVertragserkennungRepository.speichern(standardErkennung("v1", "Vibora GmbH", 1650));
    await zuordnungenAbgleichen(vertragsAbgleichDeps);
    expect(await sqliteVertragszuordnungRepository.alle()).toHaveLength(12);

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");
    await nutzer.click(await screen.findByRole("button", { name: /erkennung/i }));

    const obergrenze = await screen.findByRole("textbox", { name: /betrag bis/i });
    await nutzer.clear(obergrenze);
    await nutzer.type(obergrenze, "50");

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      expect(await sqliteVertragszuordnungRepository.alle()).toHaveLength(15);
    });
  });

  /**
   * Der Dialog darf nicht anbieten, was schon dasteht.
   *
   * Die Vorbelegung legt den Anbieternamen seit 2026-08-27 MIT Stern an (`ohlert*`). Der
   * Hinweis „Namen ergänzen" verglich aber auf Gleichheit gegen die sternlose Form, fand
   * ihn nie mehr und stand damit bei JEDEM Vertrag da — ein Klick hätte ein zweites,
   * engeres Muster danebengesetzt. Geprüft wird jetzt, ob ein vorhandenes Muster den
   * Namen ABDECKT.
   */
  it("bietet den Anbieternamen nicht an, wenn ein Muster ihn schon abdeckt", async () => {
    await konto();
    await monatsreihe("a", "Ohlert", 5000, 3);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Ohlert", beginn: "2024-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await sqliteVertragserkennungRepository.speichern(standardErkennung("v1", "Ohlert", 5000));

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Ohlert");
    await nutzer.click(await screen.findByRole("button", { name: /erkennung/i }));

    // Das Feld trägt die Vorbelegung mit Stern …
    const empfaenger = await screen.findByRole("textbox", { name: /^empfänger$/i });
    expect(empfaenger).toHaveValue("ohlert*");
    // … und deshalb gibt es nichts zu ergänzen.
    expect(screen.queryByRole("button", { name: /als Empfänger aufnehmen/i })).toBeNull();
  });

  /** Die Gegenprobe: fehlt der Name wirklich, wird er weiterhin angeboten — mit Stern. */
  it("bietet den Anbieternamen mit Stern an, wenn gar kein Muster ihn abdeckt", async () => {
    await konto();
    await monatsreihe("a", "Ohlert", 5000, 3);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Ohlert", beginn: "2024-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await sqliteVertragserkennungRepository.speichern({
      vertragId: "v1",
      merkmale: [{ art: "empfaenger", muster: "vibora" }],
    });

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Ohlert");
    await nutzer.click(await screen.findByRole("button", { name: /erkennung/i }));

    const angebot = await screen.findByRole("button", { name: /als Empfänger aufnehmen/i });
    await nutzer.click(angebot);
    expect(await screen.findByRole("textbox", { name: /^empfänger$/i })).toHaveValue("vibora\nohlert*");
  });

  /**
   * Wildcards durch die Maske. Der Fall: derselbe Anbieter taucht im Auszug mit
   * angehängter Rechnungs- oder Vertragsangabe auf — ohne Platzhalter bräuchte jede
   * Schreibweise eine eigene Zeile. Zugleich der Beweis, dass das Empfänger-Feld auch
   * wirklich als Empfänger-Merkmal ankommt und nicht als Gläubiger-ID.
   */
  it("nimmt über ein Muster mit * auch abweichende Schreibweisen auf", async () => {
    await konto();
    await monatsreihe("a", "Petrossen Bonn", 5000, 4);
    await monatsreihe("b", "Petrossen Bonn Rg 4711", 5000, 3);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Petrossen Bonn", beginn: "2024-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    // Bewusst OHNE Stern angelegt — nicht über `standardErkennung`, die seit 2026-08-27
    // von sich aus einen anhängt. Gebraucht wird hier die enge Ausgangslage, damit die
    // Änderung durch die Maske überhaupt etwas bewegt; wäre sie aus der Vorbelegung
    // geborgt, prüfte der Test ab dem nächsten Wechsel der Vorbelegung nichts mehr.
    await sqliteVertragserkennungRepository.speichern({
      ...standardErkennung("v1", "Petrossen Bonn", 5000),
      merkmale: [{ art: "empfaenger", muster: "petrossen bonn" }],
    });
    await zuordnungenAbgleichen(vertragsAbgleichDeps);
    // Nur die exakt geschriebenen vier — die drei mit Zusatz fallen durch.
    expect(await sqliteVertragszuordnungRepository.alle()).toHaveLength(4);

    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);
    await screen.findByText("Petrossen Bonn");
    await nutzer.click(await screen.findByRole("button", { name: /erkennung/i }));

    const empfaenger = await screen.findByRole("textbox", { name: /^empfänger$/i });
    await nutzer.clear(empfaenger);
    await nutzer.type(empfaenger, "petrossen bonn*");

    const speichern = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(speichern[speichern.length - 1]);

    await waitFor(async () => {
      expect(await sqliteVertragszuordnungRepository.alle()).toHaveLength(7);
    });
    // Und das Merkmal steht als Empfänger in der Regel, nicht als Gläubiger-ID.
    const [regel] = await sqliteVertragserkennungRepository.alle();
    expect(regel.merkmale).toEqual([{ art: "empfaenger", muster: "petrossen bonn*" }]);
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
    await monatsreihe("a", "Vibora GmbH", 1650);
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "vibora", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });

    rendere(<VertraegeScreen />);
    // Der Vertrag selbst steht in der Tabelle, der Vorschlag nicht mehr.
    expect(await screen.findByText("vibora")).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Aus deinen Buchungen erkannt/));
  });

  it("merkt sich ein weggeklicktes Verwerfen über einen Neustart", async () => {
    await konto();
    await monatsreihe("a", "Vibora GmbH", 1650);
    // Zweiter Kandidat als Anker: nur wenn DER nach dem Neustart wieder dasteht, sind
    // die Vorschläge geladen. Ohne ihn prüfte der Test gegen einen noch leeren Bildschirm
    // und wäre auch dann grün, wenn nichts gespeichert würde.
    await monatsreihe("b", "Octopus Energy", 5135);

    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<VertraegeScreen />);
    await screen.findByText("Vibora GmbH");

    const verwerfen = screen.getAllByRole("button", { name: /kein vertrag/i });
    // Vibora steht wegen der Sortierung nach Jahreskosten hinter Octopus.
    await nutzer.click(verwerfen[verwerfen.length - 1]);
    await waitFor(() => expect(screen.queryByText("Vibora GmbH")).not.toBeInTheDocument());

    // Neu gerendert (wie nach einem App-Start) darf er nicht zurückkommen.
    ersteAnsicht.unmount();
    rendere(<VertraegeScreen />);
    expect(await screen.findByText("Octopus Energy")).toBeInTheDocument();
    expect(screen.queryByText("Vibora GmbH")).not.toBeInTheDocument();
  });
});

describe("VertraegeScreen — die Zahlungen hinter einem Vertrag", () => {
  /**
   * Die Spalte nennt die ANZAHL zugeordneter Zahlungen. Die sagt „die Regel greift" —
   * aber nicht, WAS sie greift. Und genau daran erkennt man den Fehlgriff: eine fremde
   * Zahlung an denselben Empfaenger zaehlt genauso mit und macht aus einer falschen
   * Zuordnung eine gute Kennzahl.
   */
  async function vertragMitZahlung() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Talmberg Energie", beginn: "2026-01-01",
      verlaengerung: "keine", status: "aktiv",
    });
    await sqliteLedgerRepository.speichern({
      id: "b1", datum: "2026-08-11", betrag: -4720, kontoId: "k1",
      charakter: "Aufwand", quelle: "import",
    });
    // VON HAND zugeordnet: `vertraegeLaden` gleicht die Zuordnungen beim Laden ab, und
    // eine automatische ohne passende Erkennungsregel raeumt es dabei weg. Handarbeit
    // bleibt — genau dafuer gibt es die Herkunft.
    await sqliteVertragszuordnungRepository.speichern({
      istbuchungId: "b1", vertragId: "v1", herkunft: "manuell",
    });
  }

  it("klappt die zugeordneten Zahlungen unter der Tabelle auf", async () => {
    await vertragMitZahlung();
    rendere(<VertraegeScreen />);

    const link = await screen.findByRole("button", { name: /Talmberg Energie/ });
    // Vorher steht der Betrag der Zahlung nirgends.
    expect(document.body.textContent ?? "").not.toMatch(/47,20/);

    await userEvent.click(link);

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/47,20/));
  });

  it("klappt beim zweiten Klick wieder zu", async () => {
    await vertragMitZahlung();
    rendere(<VertraegeScreen />);

    const link = await screen.findByRole("button", { name: /Talmberg Energie/ });
    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/47,20/));

    await userEvent.click(link);
    await waitFor(() => expect(document.body.textContent ?? "").not.toMatch(/47,20/));
  });

  /**
   * Eine Null in der Spalte heisst „die Regel findet nichts". Wer dem nachgeht, soll das
   * auch aufgeklappt bestaetigt bekommen und nicht vor einer leeren Flaeche stehen.
   */
  it("sagt es, wenn die Regel auf nichts greift", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Ohlert Seewinkel", beginn: "2026-01-01",
      verlaengerung: "keine", status: "aktiv",
    });
    rendere(<VertraegeScreen />);

    await userEvent.click(await screen.findByRole("button", { name: /Ohlert Seewinkel/ }));
    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/greift noch auf keine/i));
  });
});

/**
 * Löschen — der Weg vom Knopf bis in die Tabelle.
 *
 * Er stand einmal still: die Spalte griff auf `v.vertrag.anbieter` zu, obwohl die
 * Tabelle mit `Vertrag` gefüttert wird und nicht mit `Vertragszeile`. Der Zugriff warf
 * beim KLICK — der Bestätigungsdialog ging nie auf, und der Knopf sah aus wie einer ohne
 * Wirkung. Kein Typecheck konnte das sehen (`render: (row: any)` in `DataTable.d.ts`),
 * und kein Test lief bis zum Klick. Deshalb dieser hier.
 */
describe("VertraegeScreen — Löschen", () => {
  it("löscht einen Vertrag über den Knopf in der Zeile", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Ohlert Seewinkel", beginn: "2026-01-01",
      verlaengerung: "keine", status: "aktiv",
    });

    rendere(<VertraegeScreen />);
    await screen.findByRole("button", { name: /Ohlert Seewinkel/ });

    await userEvent.click(screen.getAllByRole("button", { name: /^löschen$/i })[0]);

    // Die Rückfrage muss überhaupt aufgehen — genau das tat sie nicht — und sie trägt
    // den Anbieternamen: er kommt aus dem Feld, das den Fehler trug.
    const bestaetigen = await screen.findByRole("button", { name: /endgültig löschen/i });
    expect(document.body.textContent ?? "").toMatch(/Ohlert Seewinkel“ wird gelöscht/);

    await userEvent.click(bestaetigen);

    await waitFor(async () => expect(await sqliteVertragRepository.alle()).toHaveLength(0));
  });
});
