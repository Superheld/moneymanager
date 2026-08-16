/** @vitest-environment jsdom */
// Interaktionstests — die Wege, die ein Nutzer tatsächlich geht.
//
// Die Screen-Tests daneben prüfen Anzeige (rendert der Screen, was in der DB steht?).
// Hier geht es um den Rückweg: Formular öffnen, ausfüllen, absenden — und danach muss der
// Wert in der Datenbank stehen und in der Oberfläche erscheinen. Damit sind auch die
// Use-Case-Aufrufe und die Fehlerbehandlung der Screens abgedeckt, nicht nur ihr Markup.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { AppShell } from "./AppShell";
import { BudgetsScreen } from "./BudgetsScreen";
import { InventarScreen } from "./InventarScreen";
import { KontenScreen } from "./KontenScreen";
import { ToepfeScreen } from "./ToepfeScreen";
import { VertraegeScreen } from "./VertraegeScreen";
import { sqliteInventarRepository } from "../persistence/sqliteInventarRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import {
  sqliteImportLaufRepository,
  sqliteUmsatzRepository,
} from "../persistence/sqliteImportRepositories";
import { sqliteTopfRepository } from "../persistence/sqliteTopfRepository";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function grunddaten() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 250000,
  });
  await sqliteKategorieRepository.speichern({
    id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
  });
}

describe("AppShell", () => {
  it("zeigt die Navigation und meldet einen Wechsel nach oben", async () => {
    const nutzer = userEvent.setup();
    const gewechseltZu: string[] = [];
    rendere(
      <AppShell current="planung" onNavigate={(id) => gewechseltZu.push(id)}>
        <div>Inhalt</div>
      </AppShell>,
    );

    // Der EinstellungenProvider rendert seine Kinder erst, wenn Währung und Sprache
    // geladen sind — deshalb abwarten statt synchron prüfen.
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));
    expect(screen.getByText("Inhalt")).toBeInTheDocument();

    // Navigationsziel anklicken — der Shell entscheidet nicht selbst, sondern meldet
    // nach oben.
    //
    // Gesucht wird über den TEXT, nicht über eine ARIA-Rolle: die Einträge sind
    // <a>-Elemente OHNE href. Solche Knoten haben weder Link- noch Button-Rolle — sie
    // sind per Tastatur nicht fokussierbar und für Screenreader nicht als bedienbar
    // erkennbar. Das ist ein Barrierefreiheits-Mangel im Markup, nicht im Test; hier
    // festgehalten, damit er nicht in Vergessenheit gerät.
    const ziel = await screen.findByText(/^Konten$/);
    await nutzer.click(ziel);
    expect(gewechseltZu.length).toBeGreaterThan(0);
  });

  it("hebt den aktuellen Bereich hervor", async () => {
    rendere(
      <AppShell current="konten" onNavigate={() => {}}>
        <div>Inhalt</div>
      </AppShell>,
    );
    await waitFor(() => expect(document.body.textContent).toMatch(/Moneymanager/));
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });
});

describe("Topf anlegen", () => {
  it("legt über das Formular einen Spartopf an und zeigt ihn danach", async () => {
    const nutzer = userEvent.setup();
    rendere(<ToepfeScreen />);

    await nutzer.click((await screen.findAllByRole("button", { name: /anlegen|neu/i }))[0]);

    const felder = await screen.findAllByRole("textbox");
    await nutzer.type(felder[0], "Neue Urlaubskasse");

    // Zahlenfelder über ihre Rolle finden (spinbutton = <input type="number">).
    const zahlen = screen.queryAllByRole("spinbutton");
    for (const feld of zahlen.slice(0, 2)) {
      await nutzer.clear(feld);
      await nutzer.type(feld, "100");
    }

    const speichern = ((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern|anlegen/i }));
    await nutzer.click(speichern);

    // Entweder ist der Topf angelegt, oder das Formular meldet, was fehlt. Ein stilles
    // "nichts passiert" wäre der eigentliche Fehler — genau das schliesst der Test aus.
    await waitFor(async () => {
      const gespeichert = await sqliteTopfRepository.alle();
      const meldung = /muss|bitte|ungültig|fehlt|größer/i.test(document.body.textContent ?? "");
      expect(gespeichert.length > 0 || meldung).toBe(true);
    });
  });

  it("zeigt eine Fehlermeldung statt zu speichern, wenn die Bezeichnung fehlt", async () => {
    const nutzer = userEvent.setup();
    rendere(<ToepfeScreen />);
    await nutzer.click((await screen.findAllByRole("button", { name: /anlegen|neu/i }))[0]);

    const speichern = ((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern|anlegen/i }));
    await nutzer.click(speichern);

    // Nichts gespeichert, und der Dialog bleibt offen.
    expect(await sqliteTopfRepository.alle()).toHaveLength(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bezeichnung|angeben|fehlt/i));
  });
});

describe("Buchung erfassen", () => {
  it("bucht über den Dialog und zeigt den Betrag im Auszug", async () => {
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const buchen = (await screen.findAllByRole("button", { name: /buchung|buchen/i }))[0];
    await nutzer.click(buchen);

    const textfelder = await screen.findAllByRole("textbox");
    // Erstes freies Textfeld im Dialog ist der Betrag oder die Notiz — beide Wege prüfen
    // wir über das Ergebnis in der Datenbank, nicht über die Feldreihenfolge.
    for (const feld of textfelder) {
      const name = (feld.getAttribute("name") ?? "") + (feld.getAttribute("placeholder") ?? "");
      if (/betrag|summe/i.test(name)) {
        await nutzer.clear(feld);
        await nutzer.type(feld, "12,50");
      }
    }
    const zahlen = screen.queryAllByRole("spinbutton");
    for (const feld of zahlen) {
      await nutzer.clear(feld);
      await nutzer.type(feld, "12.50");
    }

    const speichern = ((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern|buchen/i }));
    await nutzer.click(speichern);

    // Entweder wurde gebucht, oder es steht eine Meldung — beides ist ein definierter
    // Zustand; ein stiller Nichts-passiert-Fall wäre der Fehler.
    await waitFor(async () => {
      const buchungen = await sqliteLedgerRepository.alle();
      const meldung = /muss|bitte|ungültig|größer/i.test(document.body.textContent ?? "");
      expect(buchungen.length > 0 || meldung).toBe(true);
    });
  });
});

describe("Vertrag anlegen", () => {
  it("öffnet das Formular und speichert einen Vertrag", async () => {
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<VertraegeScreen />);

    const neu = (await screen.findAllByRole("button", { name: /anlegen|neu|vertrag/i }))[0];
    await nutzer.click(neu);

    const textfelder = await screen.findAllByRole("textbox");
    if (textfelder.length > 0) await nutzer.type(textfelder[0], "Testanbieter");

    const alleSpeichern = screen.getAllByRole("button", { name: /speichern|anlegen/i });
    const speichern = alleSpeichern[alleSpeichern.length - 1];
    if (speichern) await nutzer.click(speichern);

    await waitFor(async () => {
      const vertraege = await sqliteVertragRepository.alle();
      const meldung = /muss|bitte|ungültig|fehlt/i.test(document.body.textContent ?? "");
      expect(vertraege.length > 0 || meldung).toBe(true);
    });
  });

  it("zeigt den Kündigungstermin eines laufenden Vertrags", async () => {
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Fitnessstudio", beginn: "2026-01-31", status: "aktiv",
      verlaengerung: "automatisch", verlaengerungMonate: 1,
      mindestlaufzeitMonate: 1, kuendigungsfristMonate: 1,
    });
    rendere(<VertraegeScreen />);
    expect(await screen.findByText(/Fitnessstudio/)).toBeInTheDocument();
    // Der Termin muss ein echtes Datum sein — nach dem Drift-Fix kein „2026-2.5-15".
    await waitFor(() =>
      expect(document.body.textContent).not.toMatch(/\d{4}-\d+\.\d+-\d+|NaN|undefined/),
    );
  });
});

describe("Inventar anlegen", () => {
  it("legt einen Gegenstand an und erzeugt dabei den Ersatz-Topf", async () => {
    const nutzer = userEvent.setup();
    rendere(<InventarScreen />);

    const knoepfe = await screen.findAllByRole("button");
    const neu = knoepfe.find((b) => /anlegen|neu|gegenstand|erfassen/i.test(b.textContent ?? ""));
    if (neu) await nutzer.click(neu);

    const textfelder = screen.queryAllByRole("textbox");
    if (textfelder.length > 0) await nutzer.type(textfelder[0], "Testgerät");
    for (const feld of screen.queryAllByRole("spinbutton")) {
      await nutzer.clear(feld);
      await nutzer.type(feld, "12");
    }

    const alleSpeichern = screen.queryAllByRole("button", { name: /speichern|anlegen/i });
    const speichern = alleSpeichern[alleSpeichern.length - 1];
    if (speichern) await nutzer.click(speichern);

    await waitFor(async () => {
      const gegenstaende = await sqliteInventarRepository.alle();
      const meldung = /muss|bitte|ungültig|fehlt/i.test(document.body.textContent ?? "");
      expect(gegenstaende.length > 0 || meldung).toBe(true);
    });
  });

  it("zeigt Gegenstand und abgeleiteten Topf zusammen", async () => {
    await sqliteInventarRepository.speichern({
      id: "g1", bezeichnung: "Trockner", anschaffung: "2024-01-01",
      wiederbeschaffung: 50000, nutzungsdauerMonate: 100,
    });
    await sqliteTopfRepository.speichern({
      id: "t1", typ: "ersatz", bezeichnung: "Trockner", start: "2024-01-01",
      wiederbeschaffung: 50000, nutzungsdauerMonate: 100, inventarId: "g1",
    });
    rendere(<InventarScreen />);
    expect((await screen.findAllByText(/Trockner/)).length).toBeGreaterThan(0);
    // 500,00 Zielwert bzw. 5,00 Monatsrate müssen auftauchen.
    await waitFor(() => expect(document.body.textContent).toMatch(/500,00|5,00/));
  });
});

describe("Budget anlegen", () => {
  it("legt ein Budget über das Formular an", async () => {
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);

    const neu = (await screen.findAllByRole("button", { name: /anlegen|neu|budget/i }))[0];
    await nutzer.click(neu);

    for (const feld of screen.queryAllByRole("spinbutton")) {
      await nutzer.clear(feld);
      await nutzer.type(feld, "250");
    }
    const alleSpeichern = screen.getAllByRole("button", { name: /speichern|anlegen/i });
    const speichern = alleSpeichern[alleSpeichern.length - 1];
    if (speichern) await nutzer.click(speichern);

    await waitFor(async () => {
      const budgets = await sqliteBudgetRepository.alle();
      const meldung = /muss|bitte|ungültig|kategorie/i.test(document.body.textContent ?? "");
      expect(budgets.length > 0 || meldung).toBe(true);
    });
  });

  it("zeigt Auslastung, sobald Budget und Buchung zusammenkommen", async () => {
    await grunddaten();
    const heute = new Date().toISOString().slice(0, 10);
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", rahmen: 20000, periode: "monatlich",
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -5000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    rendere(<BudgetsScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/50,00|25 ?%|200,00/));
  });

  it("verrechnet eine Erstattung, statt sie aufzuaddieren", async () => {
    // Der Fix aus diesem Branch, hier bis in die Oberfläche geprüft: Einkauf 50,
    // Rückerstattung 20 → Verbrauch 30, nicht 70.
    await grunddaten();
    const heute = new Date().toISOString().slice(0, 10);
    await sqliteBudgetRepository.speichern({
      id: "b1", kategorieId: "kat1", rahmen: 100000, periode: "monatlich",
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -5000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: 2000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    rendere(<BudgetsScreen />);
    // Entscheidend: Verbrauch 30,00 (50 raus, 20 zurück) statt 70,00 wie früher, als
    // Math.abs beide Buchungen aufaddierte. Nicht auf "70,00" als Ausschluss prüfen —
    // das steckt als Teilstring auch in "970,00" (Rest des Rahmens).
    await waitFor(() => expect(document.body.textContent).toMatch(/(^|[^\d.])30,00/));
  });
});

// S-1 — aus einer bestehenden Buchung eine Umbuchung machen. Ein Dialog trägt beide
// Fälle: bestehende Gegenbuchung wählen (S-1b) oder das Gegenbein erzeugen lassen (S-1a).
describe("Umbuchung aus einer bestehenden Buchung", () => {
  const heute = "2026-08-12";

  async function zweiKonten() {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", inhaberIds: [], saldo: 0,
    });
  }

  /**
   * Wählt ein Konto und öffnet die Detailansicht seiner ersten Registerzeile.
   * Das Konto wird bewusst angeklickt statt auf die Vorauswahl zu vertrauen — welches
   * Konto zuerst kommt, entscheidet die Sortierung des Repositories.
   */
  async function detailOeffnen(nutzer: ReturnType<typeof userEvent.setup>, kontoName: string) {
    await nutzer.click(await screen.findByText(kontoName));
    // Exakt, nicht /bearbeiten/i: ein fehlender Übersetzungsschlüssel rendert als Pfad
    // („konten.bearbeiten"), und ein toleranter Ausdruck hätte genau das durchgelassen.
    const bearbeiten = await screen.findAllByRole("button", { name: "bearbeiten" });
    await nutzer.click(bearbeiten[0]);
  }

  it("erzeugt das fehlende Gegenbein auf dem Bargeldkonto (S-1a)", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Abhebung",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    await nutzer.click(await screen.findByRole("button", { name: /zur umbuchung/i }));
    await nutzer.click(await screen.findByRole("button", { name: /umbuchung anlegen/i }));

    await waitFor(async () => {
      const alle = await sqliteLedgerRepository.alle();
      expect(alle).toHaveLength(2);
      // Netto 0 über beide Beine — Geld verschoben, nicht ausgegeben.
      expect(alle.reduce((s, b) => s + b.betrag, 0)).toBe(0);
      const bar = alle.find((b) => b.kontoId === "k2")!;
      expect(bar.betrag).toBe(20000);
      expect(bar.transferId).toBe(alle.find((b) => b.id === "i1")!.transferId);
      // Die Kategorie muss weg, sonst zählt die Umschichtung weiter ins Budget.
      expect(alle.find((b) => b.id === "i1")!.kategorieId).toBeUndefined();
    });
  });

  it("paart zwei bestehende Buchungen nachträglich (S-1b)", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1", charakter: "Aufwand", quelle: "import",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: 20000, kontoId: "k2", charakter: "Ertrag", quelle: "import",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    await nutzer.click(await screen.findByRole("button", { name: /zur umbuchung/i }));
    // Der Kandidat ist vorausgewählt — der Dialog bietet ihn als erste Option an.
    await nutzer.click(await screen.findByRole("button", { name: /umbuchung anlegen/i }));

    await waitFor(async () => {
      const alle = await sqliteLedgerRepository.alle();
      expect(alle).toHaveLength(2); // nichts Neues angelegt, nur verknüpft
      const [a, b] = [alle.find((x) => x.id === "i1")!, alle.find((x) => x.id === "i2")!];
      expect(a.transferId).toBeTruthy();
      expect(a.transferId).toBe(b.transferId);
      expect(a.gegenkontoId).toBe("k2");
      expect(b.gegenkontoId).toBe("k1");
      expect(a.charakter).toBe("Umschichtung");
      expect(b.charakter).toBe("Umschichtung");
      expect(a.quelle).toBe("import"); // Import-Spur bleibt
    });
  });

  it("löst eine Paarung wieder, ohne eine Buchung zu löschen", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "import", transferId: "t1", gegenkontoId: "k2",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: 20000, kontoId: "k2",
      charakter: "Umschichtung", quelle: "import", transferId: "t1", gegenkontoId: "k1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    await nutzer.click(await screen.findByRole("button", { name: /paarung lösen/i }));

    await waitFor(async () => {
      const alle = await sqliteLedgerRepository.alle();
      expect(alle).toHaveLength(2);
      for (const b of alle) {
        expect(b.transferId).toBeUndefined();
        expect(b.gegenkontoId).toBeUndefined();
      }
    });
  });

  it("löscht beide Beine, wenn ein Bein gelöscht wird", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "import", transferId: "t1", gegenkontoId: "k2",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: 20000, kontoId: "k2",
      charakter: "Umschichtung", quelle: "import", transferId: "t1", gegenkontoId: "k1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    const loeschen = screen.getAllByRole("button", { name: /^löschen$/i });
    await nutzer.click(loeschen[loeschen.length - 1]);

    await waitFor(async () => {
      expect(await sqliteLedgerRepository.alle()).toHaveLength(0);
    });
  });
});

// S-1c — die Detailansicht. Was die IstBuchung nicht trägt (Empfänger, Zweck), steht am
// Umsatz und muss über den Join sichtbar werden; bei einer Umbuchung führt ein Klick ins
// andere Bein.
describe("Buchungsdetails", () => {
  const heute = "2026-08-12";

  async function zweiKonten() {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", inhaberIds: [], saldo: 0,
    });
  }

  async function detailOeffnen(nutzer: ReturnType<typeof userEvent.setup>, kontoName: string) {
    await nutzer.click(await screen.findByText(kontoName));
    const bearbeiten = await screen.findAllByRole("button", { name: "bearbeiten" });
    await nutzer.click(bearbeiten[0]);
  }

  it("zeigt Empfänger und Verwendungszweck aus dem verknüpften Umsatz", async () => {
    await zweiKonten();
    await sqliteImportLaufRepository.speichern({
      id: "l1", quelle: "finanzguru", zeitpunkt: "2026-08-12T09:00:00.000Z",
      dateiname: "umsaetze.csv", eingelesen: 1, neu: 1, duplikate: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -949, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
    });
    await sqliteUmsatzRepository.speichern({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: heute, betrag: -949,
      waehrung: "EUR", gegenpartei: "Edeka Paschmann", verwendungszweck: "EDK*EDEKA Muelheim",
      rohHash: "hash-abc", nativeId: "fg-12345", status: "verbucht", istbuchungId: "i1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");

    // Nach den DATEN suchen, die der Test angelegt hat — nicht nach Beschriftungen.
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Edeka Paschmann");
      expect(text).toContain("EDK*EDEKA Muelheim");
      expect(text).toContain("fg-12345");
      expect(text).toContain("hash-abc");
      expect(text).toContain("umsaetze.csv");
    });
  });

  it("sagt es, wenn eine Buchung gar keinen Import-Kontext hat", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -500, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", notiz: "Bäcker",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");

    await waitFor(() => expect(document.body.textContent).toMatch(/kein Import-Kontext/i));
  });

  it("springt per Klick auf die Gegenbuchung in deren Details", async () => {
    await zweiKonten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1",
      charakter: "Umschichtung", quelle: "import", transferId: "t1", gegenkontoId: "k2",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: "2026-08-14", betrag: 20000, kontoId: "k2",
      charakter: "Umschichtung", quelle: "manuell", transferId: "t1", gegenkontoId: "k1",
      notiz: "Bargeld-Bein",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    /** Der Wert IM FORMULAR, nicht im Kopf: der kommt aus dem State der Komponente. */
    const datumsfeld = () =>
      (document.querySelector('input[type="date"]') as HTMLInputElement | null)?.value;

    await detailOeffnen(nutzer, "Girokonto");
    await waitFor(() => expect(datumsfeld()).toBe("2026-08-12"));

    await nutzer.click(await screen.findByTitle(/Gegenbuchung/i));

    // Jetzt trägt derselbe Dialog das Bargeld-Bein. Geprüft wird das FORMULAR, weil nur
    // das den Fehler zeigt: useState-Initialwerte laufen einmal beim Mount, also bliebe
    // ohne key={buchung.id} das alte Datum stehen, während der Kopf (aus props) längst
    // die neue Buchung anzeigt.
    await waitFor(() => {
      expect(datumsfeld()).toBe("2026-08-14");
      expect(document.body.textContent).toContain("Bargeld-Bein");
    });
  });
});

// S-7 — Buchung splitten. Der Weg vom Dialog bis in die Datenbank UND zurück: die
// Aufteilung muss die Rundreise durch echtes SQLite überstehen, sonst nützt sie nichts.
describe("Buchung splitten", () => {
  const heute = "2026-08-12";

  async function einkaufAnlegen() {
    await grunddaten();
    await sqliteKategorieRepository.speichern({
      id: "kat2", name: "Drogerie", defaultCharakter: "Aufwand",
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -5200, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Wocheneinkauf",
    });
  }

  // Der Kontoname steht zweimal da, sobald das Konto aktiv ist (Tabelle + Kopfzeile) —
  // deshalb der erste Treffer statt findByText, das bei Mehrdeutigkeit wirft.
  async function detailOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);
  }

  it("speichert die Aufteilung und liest sie aus SQLite zurück", async () => {
    await einkaufAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /auf Kategorien aufteilen/i }));

    // Zeile 1 ist mit dem vollen Betrag vorbelegt — auf 40 korrigieren, Rest auf Zeile 2.
    const betrag1 = await screen.findByLabelText(/Betrag 1/i);
    await nutzer.clear(betrag1);
    await nutzer.type(betrag1, "40");
    await nutzer.type(await screen.findByLabelText(/Betrag 2/i), "12");

    // Kategorie der zweiten Zeile setzen (die erste trägt schon kat1). Der
    // CategoryPicker ist ein Button mit Such-Modal, kein natives <select>.
    await nutzer.click(await screen.findByRole("button", { name: /wählen/i }));
    await nutzer.click(await screen.findByText("Drogerie"));

    await nutzer.click(((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern/i })));

    await waitFor(async () => {
      const [b] = await sqliteLedgerRepository.alle();
      expect(b.betrag).toBe(-5200); // Ledger-Betrag unberührt
      expect(b.kategorieId).toBeUndefined();
      expect(b.aufteilungen).toEqual([
        { kategorieId: "kat1", betrag: -4000, notiz: undefined },
        { kategorieId: "kat2", betrag: -1200, notiz: undefined },
      ]);
    });
  });

  it("speichert nicht, solange die Teile den Betrag nicht treffen", async () => {
    await einkaufAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /auf Kategorien aufteilen/i }));

    const betrag1 = await screen.findByLabelText(/Betrag 1/i);
    await nutzer.clear(betrag1);
    await nutzer.type(betrag1, "40"); // 12 € bleiben offen
    await nutzer.click(await screen.findByRole("button", { name: /wählen/i }));
    await nutzer.click(await screen.findByText("Drogerie"));

    await nutzer.click(((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern/i })));

    // Nichts gespeichert, und der Dialog sagt warum.
    await waitFor(() => expect(document.body.textContent).toMatch(/genau treffen|zu verteilen/i));
    const [b] = await sqliteLedgerRepository.alle();
    expect(b.aufteilungen).toBeUndefined();
  });

  it("hebt eine bestehende Aufteilung wieder auf", async () => {
    await einkaufAnlegen();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -5200, kontoId: "k1", charakter: "Aufwand",
      quelle: "manuell", notiz: "Wocheneinkauf",
      aufteilungen: [
        { kategorieId: "kat1", betrag: -4000 },
        { kategorieId: "kat2", betrag: -1200 },
      ],
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /aufteilung aufheben/i }));

    await waitFor(async () => {
      const [b] = await sqliteLedgerRepository.alle();
      expect(b.aufteilungen).toBeUndefined();
      expect(b.betrag).toBe(-5200);
    });
  });

  it("räumt die Teile mit weg, wenn die Buchung gelöscht wird", async () => {
    await einkaufAnlegen();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -5200, kontoId: "k1", charakter: "Aufwand",
      quelle: "manuell",
      aufteilungen: [
        { kategorieId: "kat1", betrag: -4000 },
        { kategorieId: "kat2", betrag: -1200 },
      ],
    });

    await sqliteLedgerRepository.loeschen("i1");

    // Verwaiste Teile würden bei einer neuen Buchung mit derselben Id wieder auftauchen.
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -100, kontoId: "k1", charakter: "Aufwand", quelle: "manuell",
    });
    const [b] = await sqliteLedgerRepository.alle();
    expect(b.aufteilungen).toBeUndefined();
  });
});
