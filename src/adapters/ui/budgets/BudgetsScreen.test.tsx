/** @vitest-environment jsdom */
// Budgets-Screen — Integrationstest von der Oberfläche bis ins Schema.
//
// `getDb` zeigt auf eine frische In-Memory-SQLite; alles dazwischen (Repositories,
// Use-Cases, Kern) läuft echt. Ein falsches Spalten-Mapping fällt hier deshalb genauso
// auf wie eine kaputte Anzeige.
//
// Seit der Zusammenlegung zu EINEM Aggregat (2026-08-19) prüft diese Datei beide Arten
// an einem Screen — inklusive der Verrechnung, die dabei neu dazugekommen ist: ein
// Budget, das in einem anderen liegt, wird aus dessen Betrag herausgerechnet.

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
import { BudgetsScreen } from "./BudgetsScreen";
import { sqliteBudgetRepository } from "../../persistence/sqliteBudgetRepository";
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

/** Das Auswahlfeld für die Art. */
function artFeld(): HTMLElement {
  const treffer = screen
    .getAllByRole("combobox")
    .find((s) => (s.textContent ?? "").includes("aufbauend"));
  if (!treffer) throw new Error("Art-Auswahl nicht gefunden");
  return treffer;
}

async function stammdatenBasis() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
  });
  await sqliteZahlungskontoRepository.speichern({
    id: "k2", bezeichnung: "Tagesgeldkonto", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 500000,
  });
}


/**
 * Ein Monat relativ zum laufenden, als „YYYY-MM". Die Screens lesen die Uhr selbst; ein
 * fester Monat im Test wäre nach dem nächsten Monatswechsel eine andere Aussage.
 */
function monatVersetzt(n: number): string {
  const jetzt = new Date();
  const d = new Date(jetzt.getFullYear(), jetzt.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("BudgetsScreen", () => {
  it("zeigt im Leerzustand keine leeren Kennzahlen", async () => {
    rendere(<BudgetsScreen />);
    expect((await screen.findAllByText("Budgets")).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Noch keine Budgets/));
    // Leere Kacheln (0,00 € überall) sähen aus wie ein Datenfehler.
    expect(document.body.textContent).not.toMatch(/Auslastung/);
  });

  /** Der Punkt der Zusammenlegung: beide Arten stehen in EINER Liste. */
  it("zeigt monatliche und aufbauende Budgets nebeneinander", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "kat2", name: "Urlaubskasse", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 40000 }], art: "monatlich", start: "2026-01-01",
    });
    await sqliteBudgetRepository.speichern({
      id: "b2", kategorieId: "kat2", kontoId: "k2", betraege: [{ abMonat: "2026-01", betrag: 10000 }], art: "aufbauend", start: "2026-01-01",
    });

    rendere(<BudgetsScreen />);
    expect(await screen.findByText(/Lebensmittel/)).toBeInTheDocument();
    expect(await screen.findByText("Urlaubskasse")).toBeInTheDocument();
    // Das Konto steht in der Zeile — es ist die Deckung hinter der Zahl.
    expect(screen.getAllByText("Tagesgeldkonto").length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/400,00/));
  });

  it("rechnet ein eingebettetes Budget aus seinem Dach heraus", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "frei", name: "Freizeit", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "urlaub", name: "Urlaub", elternId: "frei", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "dach", kategorieId: "frei", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 20000 }], art: "monatlich", start: "2026-01-01",
    });
    await sqliteBudgetRepository.speichern({
      id: "kind", kategorieId: "urlaub", kontoId: "k2", betraege: [{ abMonat: "2026-01", betrag: 8000 }], art: "aufbauend", start: "2026-01-01",
    });

    rendere(<BudgetsScreen />);
    await screen.findByText("Freizeit");
    // Das Dach zeigt 120,00 statt 200,00 — die 80,00 des Kindes sind abgezogen.
    await waitFor(() => expect(document.body.textContent).toMatch(/120,00/));
    expect(document.body.textContent).toMatch(/gekürzt um die Budgets/);
  });

  it("zählt gebuchte Ausgaben als Verbrauch gegen das Budget", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 40000 }], art: "monatlich", start: "2026-01-01",
    });
    const heute = new Date();
    const imMonat = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-05`;
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: imMonat, betrag: -15000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);
    // 400,00 Rahmen − 150,00 verbraucht = 250,00 Rest.
    await waitFor(() => expect(document.body.textContent).toMatch(/250,00/));
  });

  it("legt über den Dialog ein aufbauendes Budget an", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat2", name: "Urlaub", defaultCharakter: "Aufwand" });

    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));

    // Das Startdatum gibt es nur beim Aufbauenden — beim Monatlichen wäre es ohne Wirkung.
    expect(document.body.textContent).not.toMatch(/Sammelt ab/);
    await nutzer.selectOptions(artFeld(), "aufbauend");
    await waitFor(() => expect(document.body.textContent).toMatch(/Sammelt ab/));

    await nutzer.click(screen.getByRole("button", { name: /Kategorie wählen|—|▾/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Urlaub/ }));
    const betrag = screen.getAllByRole("textbox").find((f) => f.getAttribute("inputmode") === "decimal");
    await nutzer.type(betrag!, "100");

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    await waitFor(async () => {
      const gespeichert = await sqliteBudgetRepository.alle();
      expect(gespeichert).toHaveLength(1);
      expect(gespeichert[0].art).toBe("aufbauend");
      expect(gespeichert[0].betraege).toEqual([{ abMonat: "2026-08", betrag: 10000 }]);
    });
  });

  it("zeigt eine Fehlermeldung statt zu speichern, wenn die Kategorie fehlt", async () => {
    await stammdatenBasis();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /budget anlegen/i }));

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    // Nichts gespeichert, und der Dialog bleibt offen — ein stilles „nichts passiert"
    // wäre der eigentliche Fehler.
    expect(await sqliteBudgetRepository.alle()).toHaveLength(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Kategorie|wählen/i));
  });
});

/**
 * Vorschläge — der Weg läuft über zwei Tabellen (Betrag an der `ist_buchung`, Empfänger
 * am `umsatz`) und über die Vertragserkennung, die entscheidet, was NICHT steuerbar ist.
 */
describe("BudgetsScreen — Vorschläge", () => {
  const heute = new Date();
  /** Monatsschlüssel `i` Monate vor heute. */
  const monat = (i: number) => {
    const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  async function erfassen(id: string, datum: string, betrag: number, kategorieId: string, gegenpartei: string) {
    await sqliteLedgerRepository.speichern({
      id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId,
    });
    await sqliteUmsatzRepository.anlegen({
      id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum, betrag: -betrag,
      waehrung: "EUR", gegenpartei, verwendungszweck: "", rohHash: `h-${id}`,
      status: "verbucht", istbuchungId: id,
    });
  }

  /** Unregelmäßige Einkäufe: kein Vertrag, aber eine stabile Monatssumme. */
  async function einkaufsreihe(praefix: string, kategorieId: string, monatssumme: number, gegenpartei: string) {
    const tage = ["03", "12", "25"];
    for (let i = 0; i < 12; i++) {
      const teile = [Math.round(monatssumme * 0.5), Math.round(monatssumme * 0.2)];
      teile.push(monatssumme - teile[0] - teile[1]);
      for (const [j, betrag] of teile.entries()) {
        await erfassen(`${praefix}-${i}-${j}`, `${monat(i)}-${tage[(i + j) % 3]}`, betrag, kategorieId, gegenpartei);
      }
    }
  }

  async function stammdaten() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
    });
    await sqliteKategorieRepository.speichern({ id: "leben", name: "Lebenshaltung", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "essen", name: "Lebensmittel", elternId: "leben", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" });
    await sqliteKategorieRepository.speichern({ id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" });
  }

  it("zeigt ohne Buchungen keine Vorschlagskarte", async () => {
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Noch keine Budgets/));
    expect(document.body.textContent).not.toMatch(/Aus deinen Ausgaben abgeleitet/);
  });

  it("schlägt eine Hauptkategorie mit ihrem üblichen Monatsbetrag vor", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Lebenshaltung")).toBeInTheDocument();
    // Median 437,00 → Vorschlag 440,00.
    await waitFor(() => expect(document.body.textContent).toMatch(/440,00/));
  });

  /**
   * Die Stelle, an der beide Vorschlagssysteme zusammenhängen: die Miete ist eine
   * erkannte Vertragszahlung. „Wohnen" ist damit nicht steuerbar und darf trotz höchster
   * Summe NICHT als Budget erscheinen.
   */
  it("lässt eine rein vertragliche Kategorie weg", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    for (let i = 0; i < 12; i++) {
      await erfassen(`m-${i}`, `${monat(i)}-15`, 47000, "miete", "SWB Wohnungsvermietung");
    }

    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Lebenshaltung")).toBeInTheDocument();
    expect(screen.queryByText("Wohnen")).not.toBeInTheDocument();
  });

  it("füllt beim Übernehmen die Anlege-Maske vor und legt das Budget an", async () => {
    await stammdaten();
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText("Lebenshaltung");

    await nutzer.click(screen.getByRole("button", { name: /übernehmen/i }));
    await waitFor(() => expect(screen.getByDisplayValue("440")).toBeInTheDocument());

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);

    await waitFor(async () => {
      const budgets = await sqliteBudgetRepository.alle();
      expect(budgets).toHaveLength(1);
      expect(budgets[0].kategorieId).toBe("leben");
      expect(budgets[0].betraege[budgets[0].betraege.length - 1].betrag).toBe(44000);
    });
    // Und der Vorschlag ist weg, weil es das Budget jetzt gibt.
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Aus deinen Ausgaben abgeleitet/));
  });

  it("merkt sich ein weggeklicktes Verwerfen über einen Neustart", async () => {
    await stammdaten();
    await sqliteKategorieRepository.speichern({ id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" });
    await einkaufsreihe("e", "essen", 43700, "Nordhoff");
    // Zweiter Vorschlag als Anker: nur wenn DER nach dem Neustart wieder dasteht, sind
    // die Vorschläge geladen. Ohne ihn prüfte der Test gegen einen Bildschirm, auf dem
    // die Karte schlicht noch nicht gerendert ist — und wäre auch grün, wenn nichts
    // gespeichert würde.
    await einkaufsreihe("f", "freizeit", 20000, "Kino Seewinkel");

    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<BudgetsScreen />);
    await screen.findByText("Lebenshaltung");

    // Sortiert nach Vorschlagshöhe — Lebenshaltung (440) steht vor Freizeit (200).
    await nutzer.click(screen.getAllByRole("button", { name: /kein budget/i })[0]);
    await waitFor(() => expect(screen.queryByText("Lebenshaltung")).not.toBeInTheDocument());
    expect(screen.getByText("Freizeit")).toBeInTheDocument();

    ersteAnsicht.unmount();
    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Freizeit")).toBeInTheDocument();
    expect(screen.queryByText("Lebenshaltung")).not.toBeInTheDocument();
  });
});

/**
 * Der Verlauf — zwölf Monate als Balken, darunter die Buchungen des gewählten Monats.
 *
 * Der zweite Test hier ist der fachlich wichtige: ein aufbauendes Budget zeigt in der
 * Liste die Zahlen DIESES Monats, nicht die Summe seit Start. Vorher stand dort der
 * Betrag, der hineingegangen wäre, hätte man nie etwas ausgegeben.
 */
describe("BudgetsScreen · Verlauf", () => {
  /** Ein aufbauendes Budget, das vor drei Monaten angefangen hat, mit einer Ausgabe. */
  async function aufbauendMitHistorie() {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat2", name: "Urlaubskasse", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b2", kategorieId: "kat2", kontoId: "k2", betraege: [{ abMonat: monatVersetzt(-2), betrag: 10000 }],
      art: "aufbauend", start: `${monatVersetzt(-2)}-01`,
    });
    // Im Vormonat 30,00 ausgegeben: Übertrag 200,00 − 30,00 = 170,00 kommen hier an,
    // plus die Rate dieses Monats ergibt 270,00 verfügbar.
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: `${monatVersetzt(-1)}-05`, betrag: -3000, kontoId: "k2",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat2", notiz: "Fährticket",
    });
  }

  it("zeigt beim aufbauenden Budget die Zahlen DIESES Monats, nicht die Summe seit Start", async () => {
    await aufbauendMitHistorie();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Urlaubskasse/);

    // 170,00 Übertrag + 100,00 Rate = 270,00 verfügbar, davon in diesem Monat nichts weg.
    await waitFor(() => expect(document.body.textContent).toMatch(/270,00/));
    // Der kumulierte Rahmen (3 × 100,00) steht nirgends mehr als Anzeigewert.
    expect(document.body.textContent).not.toMatch(/300,00/);
  });

  it("klappt über den Namen den Verlauf auf und zeigt die Buchungen des gewählten Monats", async () => {
    await aufbauendMitHistorie();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);

    const link = await screen.findByRole("button", { name: /Urlaubskasse — Verlauf/ });
    await nutzer.click(link);

    await screen.findByText(/Verlauf · Urlaubskasse/);
    // Vorbelegt ist der laufende Monat — dort ist nichts gebucht.
    await waitFor(() => expect(document.body.textContent).toMatch(/nichts gebucht/));

    // Den Vormonat wählen: jetzt steht die Buchung da, die ihn belastet hat.
    const auswahl = await screen.findByLabelText("Monat");
    await nutzer.selectOptions(auswahl, monatVersetzt(-1));
    await waitFor(() => expect(document.body.textContent).toMatch(/Fährticket/));
  });

  /**
   * Ein RUECKFLUSS — eine Erstattung, die in die Kategorie der Ausgabe gehoert und dort
   * das Budget entlastet. Er steht als Aufwand mit positivem Betrag in der Datenbank, und
   * der Verbrauch des Monats wird dadurch negativ.
   *
   * Genau da log die Anzeige: „Verbraucht" ueber einem Minusbetrag, waehrend der Rest im
   * selben Bild waechst. Ein Wort gewinnt gegen ein Vorzeichen — also wechselt das Wort.
   */
  it("nennt einen Rueckfluss nicht „verbraucht“", async () => {
    await aufbauendMitHistorie();
    await sqliteLedgerRepository.speichern({
      id: "e1", datum: `${monatVersetzt(0)}-08`, betrag: 3490, kontoId: "k2",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat2", notiz: "Ruecksendung",
    });
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);

    await nutzer.click(await screen.findByRole("button", { name: /Urlaubskasse — Verlauf/ }));
    await screen.findByText(/Verlauf · Urlaubskasse/);
    await waitFor(() => expect(document.body.textContent).toMatch(/Ruecksendung/));

    // Die Summe unter der Liste heisst anders und traegt den Betrag OHNE Minus: das
    // Vorzeichen steckt schon im Wort, zweimal waere es eine doppelte Verneinung.
    const fuss = (await screen.findByText("Zurückgeflossen")).parentElement!;
    expect(fuss.textContent).toMatch(/34,90/);
    expect(fuss.textContent).not.toMatch(/−/);

    // Und die Aufrechnung daneben sagt „zurückgeflossen" statt „verbraucht“.
    await waitFor(() =>
      expect(document.querySelector('[title*="zurückgeflossen"]')).not.toBeNull(),
    );
  });

  it("hält die Verlaufskarte NEBEN der Liste, nicht darin", async () => {
    await aufbauendMitHistorie();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);

    const link = await screen.findByRole("button", { name: /Urlaubskasse — Verlauf/ });
    await nutzer.click(link);
    await screen.findByText(/Verlauf · Urlaubskasse/);

    // Karten erkennt man an ihrer Fläche, nicht an einer Klasse — wie in
    // `kartenschachtelung.test.tsx`.
    const karten = [...document.querySelectorAll<HTMLElement>("div")].filter((d) =>
      d.getAttribute("style")?.includes("var(--surface)"),
    );
    expect(karten.filter((k) => karten.some((a) => a !== k && a.contains(k)))).toHaveLength(0);
  });

  /**
   * Der Name trägt die Möglichkeit sichtbar, die Zeile ist die Trefferfläche. Beide
   * dürfen nicht ZUSAMMEN feuern: der Klick auf den Link blubberte sonst zur Zeile hoch,
   * schaltete ein zweites Mal um, und das Aufklappen hob sich selbst auf.
   */
  it("öffnet den Verlauf auch aus der Zeile heraus — und nicht zweimal", async () => {
    await aufbauendMitHistorie();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Urlaubskasse/);

    // Irgendwo in der Zeile, aber nicht auf dem Namen: die Art-Pille.
    await nutzer.click(screen.getByText("aufbauend"));
    await screen.findByText(/Verlauf · Urlaubskasse/);

    // Und der Name schaltet weiterhin genau einmal um — nicht hin und gleich zurück.
    await nutzer.click(screen.getByRole("button", { name: /Urlaubskasse — Verlauf/ }));
    await waitFor(() => expect(screen.queryByText(/Verlauf · Urlaubskasse/)).toBeNull());
  });

  it("lässt die Zeilen-Icons den Verlauf in Ruhe", async () => {
    await aufbauendMitHistorie();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Urlaubskasse/);

    // „bearbeiten" öffnet den Dialog — und nicht nebenbei ein Diagramm.
    await nutzer.click(screen.getByRole("button", { name: "bearbeiten" }));
    await screen.findByText(/Budget bearbeiten/);
    expect(screen.queryByText(/Verlauf · Urlaubskasse/)).toBeNull();
  });

  it("sagt es, wenn ein aufbauendes Budget erst später anfängt zu sammeln", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat3", name: "Rennrad", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b3", kategorieId: "kat3", kontoId: "k2", betraege: [{ abMonat: monatVersetzt(2), betrag: 10000 }],
      art: "aufbauend", start: `${monatVersetzt(2)}-01`,
    });

    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /Rennrad — Verlauf/ }));

    // Leere Balken für Monate vor dem Start zeigten Ausgaben, die das Budget nie
    // belastet haben — hier steht stattdessen, warum nichts da ist.
    await waitFor(() => expect(document.body.textContent).toMatch(/fängt erst später an/));
  });

  it("schliesst den Verlauf beim zweiten Klick auf denselben Namen wieder", async () => {
    await aufbauendMitHistorie();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);

    const link = await screen.findByRole("button", { name: /Urlaubskasse — Verlauf/ });
    await nutzer.click(link);
    await screen.findByText(/Verlauf · Urlaubskasse/);
    await nutzer.click(link);
    await waitFor(() => expect(screen.queryByText(/Verlauf · Urlaubskasse/)).toBeNull());
  });
});

/**
 * Der Betrag ist versioniert: ihn zu ändern legt eine neue Version ab dem laufenden Monat
 * an, statt die Vergangenheit zu überschreiben. Vorher sah ein Budget rückwirkend so aus,
 * als hätte man immer schon mit dem heutigen Rahmen geplant.
 */
describe("BudgetsScreen · Betragsversionen", () => {
  async function monatlichesBudget() {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", art: "monatlich",
      start: `${monatVersetzt(-3)}-01`,
      betraege: [{ abMonat: `${monatVersetzt(-3)}`, betrag: 40000 }],
    });
  }

  /** Öffnet den Bearbeiten-Dialog, trägt einen Betrag ein und speichert. */
  async function betragAendern(nutzer: ReturnType<typeof userEvent.setup>, neuerBetrag: string) {
    await nutzer.click(await screen.findByRole("button", { name: "bearbeiten" }));
    await screen.findByText(/Budget bearbeiten/);
    const feld = screen.getByPlaceholderText("0,00");
    await nutzer.clear(feld);
    await nutzer.type(feld, neuerBetrag);
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));
  }

  it("legt beim Ändern eine neue Version ab dem laufenden Monat an, statt die alte zu ersetzen", async () => {
    await monatlichesBudget();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);

    await betragAendern(nutzer, "450");

    await waitFor(async () => {
      const [b] = await sqliteBudgetRepository.alle();
      expect(b.betraege).toEqual([
        { abMonat: monatVersetzt(-3), betrag: 40000 },
        { abMonat: monatVersetzt(0), betrag: 45000 },
      ]);
    });
  });

  it("zeigt im Verlauf für jeden Monat die Rate, die damals galt", async () => {
    await monatlichesBudget();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);
    await betragAendern(nutzer, "450");

    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel — Verlauf/ }));
    await screen.findByText(/Verlauf · Lebensmittel/);

    // Laufender Monat: der neue Rahmen, plus der Hinweis auf den Wechsel.
    await waitFor(() => expect(document.body.textContent).toMatch(/Rahmen geändert/));
    expect(document.body.textContent).toMatch(/vorher 400,00/);

    // Vormonat: der alte Rahmen — und KEIN Hinweis, da hat sich nichts geändert.
    await nutzer.selectOptions(await screen.findByLabelText("Monat"), monatVersetzt(-1));
    await waitFor(() => expect(document.body.textContent).toMatch(/von 400,00/));
    expect(document.body.textContent).not.toMatch(/Rahmen geändert:/);
  });

  it("führt die Beträge im Dialog auf und lässt eine alte Version korrigieren", async () => {
    await monatlichesBudget();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);
    await betragAendern(nutzer, "450");
    // Erst wenn der Dialog zu ist, ist gespeichert — sonst öffnet der nächste Klick ihn
    // nicht neu, sondern trifft den noch offenen mit dem alten Stand.
    await waitFor(() => expect(screen.queryByText(/Budget bearbeiten/)).toBeNull());

    await nutzer.click(await screen.findByRole("button", { name: "bearbeiten" }));
    await screen.findByText(/Beträge im Zeitverlauf/);
    expect(document.body.textContent).toMatch(new RegExp(`ab ${monatVersetzt(-3)}`));

    // Die ALTE Version ins Feld holen und dort korrigieren — nicht eine dritte anlegen.
    await nutzer.click(screen.getByRole("button", { name: `Betrag ab ${monatVersetzt(-3)} korrigieren` }));
    const feld = screen.getByPlaceholderText("0,00");
    await nutzer.clear(feld);
    await nutzer.type(feld, "380");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(async () => {
      const [b] = await sqliteBudgetRepository.alle();
      expect(b.betraege).toEqual([
        { abMonat: monatVersetzt(-3), betrag: 38000 },
        { abMonat: monatVersetzt(0), betrag: 45000 },
      ]);
    });
  });

  it("zeigt Monate vor dem ersten Betrag als „kein Budget“, nicht als überzogen", async () => {
    await stammdatenBasis();
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand" });
    // Wie im echten Bestand: ein monatliches Budget trägt als Start den Tag, an dem es
    // angelegt wurde — der Verlauf reicht trotzdem zurück.
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", kontoId: "k1", art: "monatlich",
      start: `${monatVersetzt(0)}-01`,
      betraege: [{ abMonat: monatVersetzt(0), betrag: 40000 }],
    });
    await sqliteLedgerRepository.speichern({
      id: "alt", datum: `${monatVersetzt(-2)}-05`, betrag: -7000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });

    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel — Verlauf/ }));
    await screen.findByText(/Verlauf · Lebensmittel/);

    await nutzer.selectOptions(await screen.findByLabelText("Monat"), monatVersetzt(-2));
    // Nicht „−70,00 von 0,00": damals gab es keinen Rahmen, also auch keine Überziehung.
    await waitFor(() => expect(document.body.textContent).toMatch(/kein Budget in diesem Monat/));
    expect(document.body.textContent).toMatch(/70,00/);
  });

  it("bietet das Löschen erst an, wenn es mehr als eine Version gibt", async () => {
    await monatlichesBudget();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    await screen.findByText(/Lebensmittel/);

    // Eine einzige Version: kein Löschen — ein Budget ohne Betrag wäre nur ein Etikett.
    await nutzer.click(await screen.findByRole("button", { name: "bearbeiten" }));
    await screen.findByText(/Beträge im Zeitverlauf/);
    expect(screen.queryByRole("button", { name: /Betrag ab .* entfernen/ })).toBeNull();

    await nutzer.click(screen.getByRole("button", { name: "Abbrechen" }));
    await betragAendern(nutzer, "450");
    await waitFor(() => expect(screen.queryByText(/Budget bearbeiten/)).toBeNull());

    await nutzer.click(await screen.findByRole("button", { name: "bearbeiten" }));
    await screen.findByText(/Beträge im Zeitverlauf/);
    await nutzer.click(screen.getByRole("button", { name: `Betrag ab ${monatVersetzt(0)} entfernen` }));

    await waitFor(async () => {
      const [b] = await sqliteBudgetRepository.alle();
      expect(b.betraege).toEqual([{ abMonat: monatVersetzt(-3), betrag: 40000 }]);
    });
  });
});
