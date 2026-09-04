/** @vitest-environment jsdom */
// Monatsausblick — die drei Karten oben in der Übersicht.
//
// Zwei Ebenen: die Karten selbst gegen übergebene Daten (dort ist `heute` festgenagelt,
// damit die Tests nicht mit der Uhr wandern), und einmal der ganze Weg über den
// UebersichtScreen gegen eine echte In-Memory-SQLite — der prüft die Verdrahtung
// (Repositories, Spalten-Mapping), nicht die Rechnung.

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
import { MonatsAusblick } from "./MonatsAusblick";
import { UebersichtScreen } from "./UebersichtScreen";
import { sqliteBudgetRepository } from "../../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteZahlungsregelRepository } from "../../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { monatsAusblicke } from "../../../core";
import type { Budget, Ruecklage, IstBuchung, Kategorie, Zahlungsregel } from "../../../core";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const KATEGORIEN: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" },
  { id: "lebenshaltung", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "lebensmittel", name: "Lebensmittel", elternId: "lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

const REGELN: Zahlungsregel[] = [
  { id: "r-miete", bezeichnung: "Vermieter", betrag: -53000, rhythmus: "monatlich", startdatum: "2026-01-04", charakter: "Aufwand", kategorieId: "miete" },
  { id: "r-lohn", bezeichnung: "Arbeitgeber", betrag: 280000, rhythmus: "monatlich", startdatum: "2026-01-28", charakter: "Ertrag", kategorieId: "gehalt" },
];

const BUDGETS: Budget[] = [{ id: "b1", kategorieId: "lebenshaltung", kontoId: "giro", betraege: [{ abMonat: "2026-01", betrag: 43000 }], art: "monatlich", start: "2026-01-01" }];

const IST: IstBuchung[] = [
  { id: "i1", datum: "2026-08-05", betrag: -51800, kontoId: "giro", kategorieId: "miete", charakter: "Aufwand", quelle: "import" },
  { id: "i2", datum: "2026-08-11", betrag: -7000, kontoId: "giro", kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "import" },
];

// Rücklage: 12.000,00 auf 100 Monate → 120,00 im Monat. Kalkulatorisch, nie gebucht.
const RUECKLAGEN: Ruecklage[] = [
  { id: "g-auto", bezeichnung: "Auto", ziel: 1200000, fristMonate: 100, beginn: "2024-01-01" },
];

/**
 * Die Karten rechnen seit 2026-08-19 nicht mehr selbst — sie bekommen fertige Ausblicke
 * aus der Anwendungsschicht. Der Test rechnet sie deshalb hier vor: dieselbe Rohdaten-
 * Fassung wie vorher, nur einmal durch `monatsAusblicke` gedreht. Dass er dabei den Kern
 * anfasst, ist erlaubt — die Schichtgrenze gilt dem Produktivcode.
 */
const ROH = {
  regeln: REGELN, budgets: BUDGETS, ruecklagen: [] as Ruecklage[],
  ist: IST, kategorien: KATEGORIEN, vertragsBuchungen: new Set<string>(), heute: "2026-08-16",
};

function props(over: Partial<typeof ROH> = {}) {
  const roh = { ...ROH, ...over };
  return {
    ausblicke: monatsAusblicke(roh),
    hatPlandaten: roh.regeln.length > 0 || roh.budgets.length > 0 || roh.ruecklagen.length > 0,
    kategorieNamen: new Map(roh.kategorien.map((k) => [k.id, k.name])),
    empfaenger: new Map<string, string>(),
  };
}

/**
 * Die Karte eines Monats. Der EinstellungenProvider rendert erst nach dem Laden, deshalb
 * asynchron. Der Weg über drei Elternebenen hängt am Aufbau der Card (Titel → Titelblock
 * → Kopfzeile → Karte) — bricht die, bricht dieser Helfer sichtbar und nicht still.
 */
async function karte(titel: string): Promise<HTMLElement> {
  const kopf = await screen.findByText(titel);
  const box = kopf.parentElement?.parentElement?.parentElement;
  if (!box) throw new Error(`Karte „${titel}" nicht gefunden`);
  return box;
}

describe("MonatsAusblick", () => {
  it("zeigt den laufenden Monat und die beiden folgenden", async () => {
    rendere(<MonatsAusblick {...props()} />);
    expect(await screen.findByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
  });

  it("rechnet im laufenden Monat Plan und Gebuchtes nebeneinander auf", async () => {
    rendere(<MonatsAusblick {...props()} />);
    const august = await karte("August 2026");
    // Unter dem Strich steht BEIDES nebeneinander, jede Zahl in ihrer Spalte:
    // gebucht −518,00 − 70,00 = −588,00, geplant 2800,00 − 530,00 − 430,00 = +1840,00.
    expect(within(august).getByText("−588,00 €")).toBeInTheDocument();
    expect(within(august).getByText("+1.840,00 €")).toBeInTheDocument();
    // Die Zeilen selbst tragen weiterhin beide Spalten.
    expect(within(august).getByText("gebucht")).toBeInTheDocument();
    expect(within(august).getByText("−530,00")).toBeInTheDocument();
  });

  it("stellt das Gebuchte vor das Geplante", async () => {
    rendere(<MonatsAusblick {...props()} />);
    const august = await karte("August 2026");
    const gebucht = within(august).getByText("gebucht");
    const geplant = within(august).getByText("geplant");
    // Das Tatsächliche steht links — beim nächsten Umbau soll das nicht still zurückdrehen.
    expect(gebucht.compareDocumentPosition(geplant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("zeigt für kommende Monate nur die Plan-Spalte", async () => {
    rendere(<MonatsAusblick {...props()} />);
    const september = await karte("September 2026");
    expect(within(september).queryByText("gebucht")).not.toBeInTheDocument();
    expect(within(september).getByText("+1.840,00 €")).toBeInTheDocument();
    // Ohne Ist gibt es auch nichts zu vergleichen.
    expect(within(september).queryByText(/gegenüber Plan/)).not.toBeInTheDocument();
  });

  it("klappt die Verträge auf und zeigt, was schon gebucht ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<MonatsAusblick {...props()} />);
    const august = await karte("August 2026");

    expect(within(august).queryByText("Vermieter")).not.toBeInTheDocument();
    // Exakt, nicht per Regex: die Fusszeile erklärt „Bleibt übrig" mit denselben Wörtern.
    await nutzer.click(within(august).getByText("Verträge"));

    expect(within(august).getByText("Vermieter")).toBeInTheDocument();
    expect(within(august).getByText("04.")).toBeInTheDocument();
    // Lange Anbieternamen werden per CSS gekappt — der volle Name bleibt im title.
    expect(within(august).getByTitle("Vermieter")).toBeInTheDocument();
    // Der TATSÄCHLICH gebuchte Betrag steht am Posten, nicht der geplante — einmal in
    // der Zeilensumme, einmal am aufgeklappten Posten.
    expect(within(august).getAllByText("−518,00")).toHaveLength(2);
  });

  it("klappt die Budgets auf und zeigt, wie weit der Rahmen durch ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<MonatsAusblick {...props()} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText("Budgets"));
    expect(within(august).getByText("Lebenshaltung")).toBeInTheDocument();
    expect(within(august).getByText("70,00 / 430,00 €")).toBeInTheDocument();
  });

  /**
   * Kam in einem Monat unterm Strich Geld ZURÜCK — eine Erstattung oder Retoure, die
   * höher war als die Ausgaben derselben Kategorie —, dann ist nichts verbraucht worden.
   * Hier stand `Math.abs`, und das behauptete das Gegenteil: der Rückfluss erschien als
   * Verbrauch in genau seiner Höhe, und der Balken wuchs mit.
   */
  it("zeigt einen Rückfluss nicht als Verbrauch", async () => {
    const nutzer = userEvent.setup();
    const zurueck: IstBuchung[] = [
      IST[0],
      // Ein Zufluss auf einer AUFWANDskategorie: die Retoure gehört in die Kategorie der
      // Ausgabe, dort entlastet sie das Budget.
      { id: "i3", datum: "2026-08-12", betrag: 9000, kontoId: "giro", kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell" },
    ];
    rendere(<MonatsAusblick {...props({ ist: zurueck })} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText("Budgets"));
    expect(within(august).getByText("\u221290,00 / 430,00 €")).toBeInTheDocument();
  });

  it("weist darauf hin, wenn gar keine Einnahmen geplant sind", async () => {
    rendere(<MonatsAusblick {...props({ regeln: [REGELN[0]] })} />);
    expect(await screen.findByText(/Einnahmen kommen aus Verträgen/)).toBeInTheDocument();
  });

  it("zeigt ohne Verträge, Budgets und Rücklagen einen Hinweis statt drei leerer Karten", async () => {
    rendere(<MonatsAusblick {...props({ regeln: [], budgets: [] })} />);
    expect(await screen.findByText(/Für den Ausblick fehlen die Plan-Daten/)).toBeInTheDocument();
    expect(screen.queryByText("August 2026")).not.toBeInTheDocument();
  });

  /**
   * Die Rücklagen hatten bis 2026-09-01 eine eigene Zeile: die kalkulatorische Monatsrate,
   * in Plan und Ist mit demselben Betrag. Sie ist weg, weil Rücklagen sich seit den
   * Umbuchungsverträgen PLANEN lassen — die geplante Umbuchung steht in der Zeile
   * „Sparen & Vorsorge", und beides nebeneinander zählte dasselbe Zurücklegen zweimal.
   */
  it("zeigt keine Rücklagenzeile mehr", async () => {
    rendere(<MonatsAusblick {...props()} />);
    await screen.findByText("August 2026");
    expect(screen.queryByText("Rücklagen")).not.toBeInTheDocument();
  });

  it("schweigt über fehlende Einnahmen, sobald ein Ertrags-Vertrag existiert", async () => {
    rendere(<MonatsAusblick {...props()} />);
    await screen.findByText("August 2026");
    expect(screen.queryByText(/Einnahmen kommen aus Verträgen/)).not.toBeInTheDocument();
  });
});

describe("Übersicht — Ausblick am echten Schema", () => {
  it("lädt Regeln und Budgets aus der Datenbank und zeigt die drei Karten", async () => {
    for (const k of KATEGORIEN) await sqliteKategorieRepository.speichern(k);
    for (const r of REGELN) await sqliteZahlungsregelRepository.speichern(r);
    for (const b of BUDGETS) await sqliteBudgetRepository.speichern(b);
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
    for (const g of RUECKLAGEN) await sqliteRuecklagenRepository.speichern(g);
    // Eine Buchung im laufenden Monat — welcher das ist, entscheidet hier die echte Uhr.
    const jetzt = new Date();
    const monatsErster = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-01`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: monatsErster, betrag: -6250, kontoId: "giro",
      kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell",
    });

    // Der Ausblick sitzt seit 2026-08-19 auf der Übersicht, nicht mehr im Rückblick.
    rendere(<UebersichtScreen />);

    // Drei Karten, und die Miete steht als Vertragsposten drin (Regel korrekt gemappt).
    await waitFor(() => expect(screen.getAllByText("Bleibt übrig")).toHaveLength(3));
    expect(screen.getAllByText(/geplant/).length).toBeGreaterThan(0);
    const nutzer = userEvent.setup();
    await nutzer.click(screen.getAllByText("Verträge")[0]);
    expect(screen.getAllByText("Vermieter").length).toBeGreaterThan(0);
    // Und keine Rücklagenzeile: die Rücklagen werden seit 2026-09-01 geplant statt
    // gerechnet, und die geplante Umbuchung steht unter „Sparen & Vorsorge".
    expect(screen.queryByText("Rücklagen")).not.toBeInTheDocument();
  });

  it("klappt ein Budget der Liste auf und zeigt seine Buchungen", async () => {
    for (const k of KATEGORIEN) await sqliteKategorieRepository.speichern(k);
    for (const b of BUDGETS) await sqliteBudgetRepository.speichern(b);
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    const jetzt = new Date();
    const monatsErster = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-01`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: monatsErster, betrag: -6250, kontoId: "giro",
      kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell", notiz: "Wocheneinkauf",
    });

    rendere(<UebersichtScreen />);
    const nutzer = userEvent.setup();
    // Die Budget-Liste unten trägt denselben Kategorienamen wie die aufgeklappte
    // Budgets-Zeile der Karte — deshalb über das aria-label der Kopfzeile greifen.
    const kopf = await screen.findByLabelText(/Lebenshaltung/);
    expect(screen.queryByText("Wocheneinkauf")).not.toBeInTheDocument();

    await nutzer.click(kopf);
    expect(await screen.findByText("Wocheneinkauf")).toBeInTheDocument();
    expect(screen.getByText("Verbraucht")).toBeInTheDocument();
  });

  /**
   * Und von dort aus weiter in die Buchung.
   *
   * Die aufgeklappte Liste ist die Stelle, an der eine falsch einsortierte Zeile auffällt:
   * man sieht sie unter einem Budget stehen, in das sie nicht gehört. Ohne den Weg von
   * hier aus musste man sie sich merken und im Kontoauszug wiederfinden.
   */
  it("öffnet die Buchung aus der aufgeklappten Budgetliste", async () => {
    for (const k of KATEGORIEN) await sqliteKategorieRepository.speichern(k);
    for (const b of BUDGETS) await sqliteBudgetRepository.speichern(b);
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    const jetzt = new Date();
    const monatsErster = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-01`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: monatsErster, betrag: -6250, kontoId: "giro",
      kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell", notiz: "Wocheneinkauf",
    });

    rendere(<UebersichtScreen />);
    const nutzer = userEvent.setup();
    await nutzer.click(await screen.findByLabelText(/Lebenshaltung/));

    // Die Zeile ist ein Knopf, kein Text — nur so ist sie auch mit der Tastatur erreichbar.
    const zeile = (await screen.findByText("Wocheneinkauf")).closest("button");
    expect(zeile).not.toBeNull();

    await nutzer.click(zeile!);
    const dialog = await screen.findByRole("dialog");
    // Nach den DATEN suchen, die der Test angelegt hat: der Dialog zeigt die Buchung.
    expect(within(dialog).getAllByDisplayValue("Wocheneinkauf").length).toBeGreaterThan(0);
  });
});
