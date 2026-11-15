/** @vitest-environment jsdom */
// Die Monatskarten oben in der Übersicht.
//
// Zwei Ebenen: die Karten selbst gegen übergebene Daten (dort ist `heute` festgenagelt,
// damit die Tests nicht mit der Uhr wandern), und einmal der ganze Weg über den
// UebersichtScreen gegen eine echte In-Memory-SQLite — der prüft die Verdrahtung
// (Repositories, Spalten-Mapping), nicht die Rechnung. Die Rechnung selbst steht in
// `core/ergebnis.test.ts`.

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
import { ErgebnisKarten } from "./ErgebnisKarten";
import { UebersichtScreen } from "./UebersichtScreen";
import { sqliteBudgetRepository } from "../../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteZahlungsregelRepository } from "../../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { ergebnisbasis, monatsErgebnisse } from "../../../core";
import type { Budget, Ruecklage, IstBuchung, Kategorie, Zahlungskonto, Zahlungsregel } from "../../../core";

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
  { id: "urlaub", name: "Urlaub", defaultCharakter: "Aufwand" },
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

const KONTEN: Zahlungskonto[] = [{ id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 }];

const REGELN: Zahlungsregel[] = [
  { id: "r-miete", bezeichnung: "Vermieter", betrag: -53000, rhythmus: "monatlich", startdatum: "2026-01-04", charakter: "Aufwand", kategorieId: "miete", vertragId: "v-miete" },
  { id: "r-lohn", bezeichnung: "Arbeitgeber", betrag: 280000, rhythmus: "monatlich", startdatum: "2026-01-28", charakter: "Ertrag", kategorieId: "gehalt", vertragId: "v-lohn" },
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

const ROH = {
  regeln: REGELN, budgets: BUDGETS, ruecklagen: [] as Ruecklage[], ist: IST, kategorien: KATEGORIEN,
  konten: KONTEN, vertragJeBuchung: new Map([["i1", "v-miete"]]), heute: "2026-08-16",
};

/** Dass der Test den Kern anfasst, ist erlaubt — die Schichtgrenze gilt dem Produktivcode. */
function props(over: Partial<typeof ROH> = {}) {
  const roh = { ...ROH, ...over };
  return {
    ergebnisse: monatsErgebnisse(ergebnisbasis(roh)),
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
  if (!box) throw new Error(`Karte nicht gefunden: ${titel}`);
  return box;
}

const text = (schluessel: string) => i18n.t(schluessel);

describe("ErgebnisKarten", () => {
  it("zeigt den laufenden Monat und die beiden folgenden", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    expect(await screen.findByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
  });

  it("rechnet im laufenden Monat Bisheriges und Geplantes nebeneinander auf", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");
    // Unter dem Strich: bisher −518,00 − 70,00, geplant 2800,00 − 530,00 − 430,00.
    expect(within(august).getByText("−588,00 €")).toBeInTheDocument();
    expect(within(august).getByText("+1.840,00 €")).toBeInTheDocument();
    expect(within(august).getByText("−530,00")).toBeInTheDocument();
  });

  it("zieht nach den Pflichten eine Zwischensumme", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");
    expect(within(august).getByText(text("ergebnis.stufe.nachPflichten"))).toBeInTheDocument();
    expect(within(august).getByText("+2.270,00 €")).toBeInTheDocument();
  });

  it("wiederholt das Ergebnis nicht als Zwischensumme, wenn danach nichts mehr abgeht", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");
    // Ohne Rücklagen und Vorsorge wäre „was der Alltag übrig lässt" dieselbe Zahl.
    expect(within(august).queryByText(text("ergebnis.stufe.nachAlltag"))).not.toBeInTheDocument();
    expect(within(august).getByText(text("ergebnis.stufe.ergebnis"))).toBeInTheDocument();
  });

  it("stellt das Bisherige vor das Geplante", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");
    const ist = within(august).getByText(text("ergebnis.spalteIst"));
    const plan = within(august).getByText(text("ergebnis.spaltePlan"));
    expect(ist.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("nennt nur am laufenden Monat, womit er voraussichtlich endet", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");
    expect(within(august).getByText(text("ergebnis.erwartet"))).toBeInTheDocument();
    const september = await karte("September 2026");
    expect(within(september).queryByText(text("ergebnis.erwartet"))).not.toBeInTheDocument();
  });

  it("zeigt für kommende Monate nur die Plan-Spalte und keinen Weg zum Konto", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    const september = await karte("September 2026");
    expect(within(september).queryByText(text("ergebnis.spalteIst"))).not.toBeInTheDocument();
    expect(within(september).getByText("+1.840,00 €")).toBeInTheDocument();
    expect(within(september).queryByText(new RegExp(text("ergebnis.ueberleitung.titel").replace("?", "\\?")))).not.toBeInTheDocument();
  });

  it("klappt die Fixkosten auf und zeigt, was schon gebucht ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");

    expect(within(august).queryByText("Vermieter")).not.toBeInTheDocument();
    await nutzer.click(within(august).getByText(text("ergebnis.zeile.fixkosten")));

    expect(within(august).getByTitle("Vermieter")).toBeInTheDocument();
    // Der TATSÄCHLICH gebuchte Betrag steht am Posten, nicht der geplante — einmal in
    // der Zeilensumme, einmal am aufgeklappten Posten.
    expect(within(august).getAllByText("−518,00")).toHaveLength(2);
  });

  it("zeigt einen Vertrag ohne zugeordnete Zahlung als offen", async () => {
    const nutzer = userEvent.setup();
    rendere(<ErgebnisKarten {...props({ vertragJeBuchung: new Map() })} />);
    const august = await karte("August 2026");
    await nutzer.click(within(august).getByText(text("ergebnis.zeile.fixkosten")));
    expect(within(august).getAllByText(text("ergebnis.statusOffen")).length).toBeGreaterThan(0);
    // Die Zahlung steht dann als Ungeplantes da — gezählt wird sie genau einmal.
    expect(within(august).getByText(text("ergebnis.zeile.ungeplant"))).toBeInTheDocument();
  });

  it("klappt die laufenden Kosten auf und zeigt, wie weit der Rahmen durch ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<ErgebnisKarten {...props()} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText(text("ergebnis.zeile.laufend")));
    expect(within(august).getByText("Lebenshaltung")).toBeInTheDocument();
    expect(within(august).getByText("70,00 / 430,00 €")).toBeInTheDocument();
  });

  /**
   * Kam in einem Monat unterm Strich Geld ZURÜCK — eine Erstattung, die höher war als
   * die Ausgaben derselben Kategorie —, dann ist nichts verbraucht worden. Mit
   * `Math.abs` erschiene der Rückfluss als Verbrauch in genau seiner Höhe.
   */
  it("zeigt einen Rückfluss nicht als Verbrauch", async () => {
    const nutzer = userEvent.setup();
    const zurueck: IstBuchung[] = [
      IST[0],
      { id: "i3", datum: "2026-08-12", betrag: 9000, kontoId: "giro", kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell" },
    ];
    rendere(<ErgebnisKarten {...props({ ist: zurueck })} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText(text("ergebnis.zeile.laufend")));
    expect(within(august).getByText("−90,00 / 430,00 €")).toBeInTheDocument();
  });

  it("zeigt die Raten der Rücklagen als Kosten und erklärt den Weg zum Konto", async () => {
    const nutzer = userEvent.setup();
    rendere(<ErgebnisKarten {...props({ ruecklagen: RUECKLAGEN })} />);
    const august = await karte("August 2026");
    expect(within(august).getByText(text("ergebnis.zeile.abschreibungen"))).toBeInTheDocument();
    // Jetzt geht nach dem Alltag noch etwas ab — die Zwischensumme steht da.
    expect(within(august).getByText(text("ergebnis.stufe.nachAlltag"))).toBeInTheDocument();
    // Bisher: −588,00 − 120,00.
    expect(within(august).getByText("−708,00 €")).toBeInTheDocument();

    await nutzer.click(within(august).getByRole("button", { name: new RegExp(text("ergebnis.ueberleitung.titel").replace("?", "\\?")) }));
    expect(within(august).getByText(text("ergebnis.ueberleitung.raten"))).toBeInTheDocument();
    // Die Rate blieb auf dem Konto: die Kontostände änderten sich um −588,00.
    expect(within(august).getByText(text("ergebnis.ueberleitung.summe"))).toBeInTheDocument();
    expect(within(august).getByText("−588,00")).toBeInTheDocument();
  });

  it("zeigt am aufbauenden Budget die Rate als Kosten und die Entnahme daneben", async () => {
    const nutzer = userEvent.setup();
    const topf: Budget = { id: "b-urlaub", kategorieId: "urlaub", kontoId: "giro", betraege: [{ abMonat: "2026-01", betrag: 10000 }], art: "aufbauend", start: "2026-01-01" };
    const reise: IstBuchung = { id: "i9", datum: "2026-08-03", betrag: -60000, kontoId: "giro", kategorieId: "urlaub", charakter: "Aufwand", quelle: "import" };
    rendere(<ErgebnisKarten {...props({ budgets: [...BUDGETS, topf], ist: [...IST, reise] })} />);
    const august = await karte("August 2026");

    await nutzer.click(within(august).getByText(text("ergebnis.zeile.wagnisse")));
    // Acht Raten sind im Topf, 600 gehen raus: der Monat kostet die Rate.
    expect(within(august).getAllByText("−100,00").length).toBeGreaterThan(0);
    expect(within(august).getByText(new RegExp("600,00"))).toBeInTheDocument();
  });

  it("weist darauf hin, wenn gar keine Einnahmen geplant sind", async () => {
    rendere(<ErgebnisKarten {...props({ regeln: [REGELN[0]] })} />);
    expect(await screen.findByText(text("ergebnis.hinweisKeineEinnahmen"))).toBeInTheDocument();
  });

  it("zeigt ohne Verträge, Budgets und Rücklagen einen Hinweis statt drei leerer Karten", async () => {
    rendere(<ErgebnisKarten {...props({ regeln: [], budgets: [] })} />);
    expect(await screen.findByText(text("ergebnis.leer"))).toBeInTheDocument();
    expect(screen.queryByText("August 2026")).not.toBeInTheDocument();
  });

  it("schweigt über fehlende Einnahmen, sobald ein Ertrags-Vertrag existiert", async () => {
    rendere(<ErgebnisKarten {...props()} />);
    await screen.findByText("August 2026");
    expect(screen.queryByText(text("ergebnis.hinweisKeineEinnahmen"))).not.toBeInTheDocument();
  });
});

describe("Übersicht — Monatskarten am echten Schema", () => {
  it("lädt Regeln, Budgets und Rücklagen aus der Datenbank und zeigt die drei Karten", async () => {
    for (const k of KATEGORIEN) await sqliteKategorieRepository.speichern(k);
    for (const r of REGELN) await sqliteZahlungsregelRepository.speichern({ ...r, vertragId: undefined });
    for (const b of BUDGETS) await sqliteBudgetRepository.speichern(b);
    await sqliteZahlungskontoRepository.speichern({ ...KONTEN[0], saldo: 100000 });
    for (const g of RUECKLAGEN) await sqliteRuecklagenRepository.speichern(g);
    // Eine Buchung im laufenden Monat — welcher das ist, entscheidet hier die echte Uhr.
    const jetzt = new Date();
    const monatsErster = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-01`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: monatsErster, betrag: -6250, kontoId: "giro",
      kategorieId: "lebensmittel", charakter: "Aufwand", quelle: "manuell",
    });

    rendere(<UebersichtScreen />);

    // Drei Karten, und die Miete steht als Posten der Fixkosten drin (Regel korrekt gemappt).
    await waitFor(() => expect(screen.getAllByText(text("ergebnis.stufe.ergebnis"))).toHaveLength(3));
    const nutzer = userEvent.setup();
    await nutzer.click(screen.getAllByText(text("ergebnis.zeile.fixkosten"))[0]);
    expect(screen.getAllByText("Vermieter").length).toBeGreaterThan(0);
    // Und die Rücklage aus der Datenbank steht mit ihrer Rate in jeder Karte.
    expect(screen.getAllByText(text("ergebnis.zeile.abschreibungen"))).toHaveLength(3);
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
    // Budgets-Zeile der Karte — deshalb über die aufklappende Kopfzeile greifen (seit der
    // Balken darunter benannt ist, trägt auch er den Namen).
    const kopf = await screen.findByRole("button", { name: /Lebenshaltung/ });
    expect(screen.queryByText("Wocheneinkauf")).not.toBeInTheDocument();

    await nutzer.click(kopf);
    expect(await screen.findByText("Wocheneinkauf")).toBeInTheDocument();
    // Ohne Summenzeile: der Betrag steht schon in der Budgetzeile darüber.
    expect(screen.queryByText("Verbraucht")).not.toBeInTheDocument();
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
    await nutzer.click(await screen.findByRole("button", { name: /Lebenshaltung/ }));

    // Die Zeile hat die Rolle eines Knopfs und steht in der Tab-Reihenfolge — nur so ist
    // sie auch mit der Tastatur erreichbar (seit 2026-11-09 eine Tabellenzeile in
    // `Aufklapptabelle`, vorher ein echtes <button>).
    const zeile = (await screen.findByText("Wocheneinkauf")).closest('[role="button"]') as HTMLElement | null;
    expect(zeile).not.toBeNull();
    expect(zeile!.tabIndex).toBe(0);

    await nutzer.click(zeile!);
    const dialog = await screen.findByRole("dialog");
    // Nach den DATEN suchen, die der Test angelegt hat: der Dialog zeigt die Buchung.
    expect(within(dialog).getAllByDisplayValue("Wocheneinkauf").length).toBeGreaterThan(0);
  });
});
