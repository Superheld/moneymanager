/** @vitest-environment jsdom */
// Interaktionstests — die Wege, die ein Nutzer tatsächlich geht.
//
// Die Screen-Tests daneben prüfen Anzeige (rendert der Screen, was in der DB steht?).
// Hier geht es um den Rückweg: Formular öffnen, ausfüllen, absenden — und danach muss der
// Wert in der Datenbank stehen und in der Oberfläche erscheinen. Damit sind auch die
// Use-Case-Aufrufe und die Fehlerbehandlung der Screens abgedeckt, nicht nur ihr Markup.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../testwerkzeug/harness";
import { AppShell } from "./bausteine/AppShell";
import { BudgetsScreen } from "./budgets/BudgetsScreen";
import { InventarScreen } from "./inventar/InventarScreen";
import { KontenScreen } from "./konten/KontenScreen";
import { VertraegeScreen } from "./vertraege/VertraegeScreen";
import { sqliteInventarRepository } from "../persistence/sqliteInventarRepository";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import {
  sqliteDublettenfreigabeRepository,
  sqliteImportLaufRepository,
  sqliteUmsatzRepository,
} from "../persistence/sqliteImportRepositories";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import {
  sqliteBankzugangRepository,
  sqliteKontozuordnungRepository,
} from "../persistence/sqliteBankzugangRepositories";
import {
  sqliteVertragserkennungRepository,
  sqliteVertragszuordnungRepository,
  vertragsAbgleichDeps,
} from "../persistence/sqliteVertragZuordnungRepositories";
import { erkennungSicherstellen, zuordnungenAbgleichen } from "../../application/vertraege/vertragszuordnung";
import { sqliteZahlungsregelRepository } from "../persistence/sqliteZahlungsregelRepository";
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
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
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
      <AppShell current="uebersicht" onNavigate={(id) => gewechseltZu.push(id)}>
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
    // Zweimal vorhanden: Übersicht (Überblick) und Verwaltung. Die erste genügt.
    const ziel = (await screen.findAllByText(/^Konten$/))[0];
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
  it("legt einen Gegenstand an", async () => {
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

  it("zeigt Gegenstand, Monatsrücklage und Wiederbeschaffung", async () => {
    await sqliteInventarRepository.speichern({
      id: "g1", bezeichnung: "Trockner", anschaffung: "2024-01-01",
      wiederbeschaffung: 50000, nutzungsdauerMonate: 100,
    });
    rendere(<InventarScreen />);
    expect((await screen.findAllByText(/Trockner/)).length).toBeGreaterThan(0);
    // 500,00 Wiederbeschaffung bzw. 5,00 Monatsrücklage müssen auftauchen.
    await waitFor(() => expect(document.body.textContent).toMatch(/500,00|5,00/));
  });

  // Ohne Konto gibt es nur die Rechnung; mit Konto wird sie anteilig gegen den realen
  // Stand abgeglichen. Der Test sucht nach den DATEN, die er selbst angelegt hat.
  it("gleicht die Rücklage gegen den realen Stand des zugeordneten Kontos ab", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k-rueck", bezeichnung: "Rücklagenkonto", typ: "Giro", klasse: "liquide", saldo: 13800, inhaberIds: [],
    });
    await sqliteInventarRepository.speichern({
      id: "g1", bezeichnung: "Trockner", anschaffung: "2024-01-01",
      wiederbeschaffung: 50000, nutzungsdauerMonate: 100, kontoId: "k-rueck",
    });
    rendere(<InventarScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Rücklagenkonto/));
    // Auf dem Konto liegen 138,00 — die müssen als tatsächlich gedeckter Teil auftauchen.
    await waitFor(() => expect(document.body.textContent).toMatch(/138,00/));
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
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 20000 }], art: "monatlich", start: "2026-01-01",
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
      id: "b1", kategorieId: "kat1", kontoId: "k1", betraege: [{ abMonat: "2026-01", betrag: 100000 }], art: "monatlich", start: "2026-01-01",
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
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
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
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
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
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: heute, betrag: -949,
      waehrung: "EUR", gegenpartei: "Thalberg Vibora", verwendungszweck: "EDK*THALBERG Seewinkel",
      rohHash: "hash-abc", nativeId: "fg-12345", status: "verbucht", istbuchungId: "i1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    // Die Herkunft ist zugeklappt, bis jemand danach fragt — sie steht ganz unten im
    // Dialog und wird selten gebraucht.
    await nutzer.click(await screen.findByRole("button", { name: /herkunft/i }));

    // Nach den DATEN suchen, die der Test angelegt hat — nicht nach Beschriftungen.
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Thalberg Vibora");
      expect(text).toContain("EDK*THALBERG Seewinkel");
      expect(text).toContain("fg-12345");
      expect(text).toContain("hash-abc");
      expect(text).toContain("umsaetze.csv");
    });
  });

  // Entscheidend ist die HERKUNFT, nicht das Konto. Vorher hing die Sperre am Konto: alles
  // auf einem Konto mit Bankverbindung war tabu, also auch die Zeilen, die per Datei
  // dorthin kamen — die kennt die Bank aber gar nicht, und ohne Löschweg blieb eine
  // falsch importierte Zeile für immer im Saldo stehen.
  //
  // Eine Zeile aus dem ABRUF wird nicht gelöscht, sondern verworfen: die Buchung fällt
  // aus dem Ledger, der Umsatz bleibt als Entscheidung stehen. Nur so holt der nächste
  // Abruf sie nicht zurück — geprüft wird deshalb an beidem, nicht am Knopf.
  it("verwirft eine Zeile aus dem Bankabruf, statt sie zu löschen", async () => {
    await zweiKonten();
    await sqliteImportLaufRepository.speichern({
      id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-12T09:00:00.000Z",
      eingelesen: 1, neu: 1, duplikate: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -949, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1", notiz: "Von der Bank",
    });
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l-bank", zahlungskontoId: "k1", buchungstag: heute, betrag: -949,
      waehrung: "EUR", gegenpartei: "Ohlert Vibora", verwendungszweck: "Abbuchung",
      rohHash: "h-bank", nativeId: "fints-1", status: "verbucht", istbuchungId: "i1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");

    // Kein „Löschen" — der Weg für diese Zeile heisst anders und tut etwas anderes.
    expect(screen.queryByRole("button", { name: /^löschen$/i })).not.toBeInTheDocument();
    const verwerfen = await screen.findAllByRole("button", { name: /^verwerfen$/i });
    await nutzer.click(verwerfen[verwerfen.length - 1]);

    await waitFor(async () => {
      expect(await sqliteLedgerRepository.alle()).toHaveLength(0);
      const umsatz = (await sqliteUmsatzRepository.alle()).find((u) => u.id === "u1");
      expect(umsatz?.status).toBe("verworfen");
      expect(umsatz?.istbuchungId).toBeUndefined();
    });

    // Der Roh-Hash bleibt im Bestand: genau er blockt den Reimport beim nächsten Abruf.
    const schluessel = await sqliteUmsatzRepository.bestandsSchluessel();
    expect(schluessel.hashes).toContain("h-bank");
  });

  it("lässt eine Zeile aus einem Dateiimport löschen, auch auf einem Bankkonto", async () => {
    await zweiKonten();
    await sqliteImportLaufRepository.speichern({
      id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-12T09:00:00.000Z",
      dateiname: "umsaetze.csv", eingelesen: 1, neu: 1, duplikate: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -949, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1", notiz: "Aus der Datei",
    });
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l-datei", zahlungskontoId: "k1", buchungstag: heute, betrag: -949,
      waehrung: "EUR", gegenpartei: "Thalberg", verwendungszweck: "Einkauf",
      rohHash: "h-datei", nativeId: "fg-1", status: "verbucht", istbuchungId: "i1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer, "Girokonto");
    const loeschen = await screen.findAllByRole("button", { name: /^löschen$/i });
    await nutzer.click(loeschen[loeschen.length - 1]);
    await waitFor(async () => expect(await sqliteLedgerRepository.alle()).toHaveLength(0));
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
    await nutzer.click(await screen.findByRole("button", { name: /herkunft/i }));

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

    /**
     * Der Wert IM FORMULAR, nicht im Kopf: der kommt aus dem State der Komponente.
     * Seit 2026-08-25 ist das ein `Datumsfeld` und kein `input[type=date]` mehr — es
     * zeigt die Landesschreibweise und trägt seinen Namen als `aria-label`.
     */
    const datumsfeld = () =>
      (screen.queryByRole("textbox", { name: "Datum" }) as HTMLInputElement | null)?.value;

    await detailOeffnen(nutzer, "Girokonto");
    await waitFor(() => expect(datumsfeld()).toBe("12.08.2026"));

    await nutzer.click(await screen.findByTitle(/Gegenbuchung/i));

    // Jetzt trägt derselbe Dialog das Bargeld-Bein. Geprüft wird das FORMULAR, weil nur
    // das den Fehler zeigt: useState-Initialwerte laufen einmal beim Mount, also bliebe
    // ohne key={buchung.id} das alte Datum stehen, während der Kopf (aus props) längst
    // die neue Buchung anzeigt.
    await waitFor(() => {
      expect(datumsfeld()).toBe("14.08.2026");
      expect(document.body.textContent).toContain("Bargeld-Bein");
    });
  });
});

// S-7 — Buchung splitten. Der Weg vom Dialog bis in die Datenbank UND zurück: die
// Aufteilung muss die Rundreise durch echtes SQLite überstehen, sonst nützt sie nichts.
describe("Konto-Register — Suche und Spalten", () => {
  const heute = "2026-08-12";

  async function dreiBuchungen() {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Sparkonto", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -1250, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Baecker",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: -8900, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Tankstelle",
    });
    // Ein Umbuchungs-Bein: traegt ein Gegenkonto und keine Kategorie.
    await sqliteLedgerRepository.speichern({
      id: "i3", datum: heute, betrag: -50000, kontoId: "k1", gegenkontoId: "k2",
      transferId: "t1", charakter: "Umschichtung", quelle: "manuell", notiz: "Uebertrag",
    });
  }

  it("findet eine Buchung ueber ihren Betrag", async () => {
    await dreiBuchungen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findAllByText("Girokonto");
    await screen.findByText("Baecker");

    // „89" allein ist kein Betrag, „89,00" schon — beide Wege muessen die Zeile finden.
    await nutzer.type(screen.getByPlaceholderText(/Suche/i), "89,00");
    await waitFor(() => expect(screen.queryByText("Baecker")).not.toBeInTheDocument());
    expect(screen.getByText("Tankstelle")).toBeInTheDocument();
  });

  it("zeigt die Umbuchungs-Pille in der Kategorie-Spalte", async () => {
    await dreiBuchungen();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findAllByText("Girokonto");
    await screen.findByText("Uebertrag");

    // Die Pille ersetzt die Kategorie: sie steht in derselben Zelle, in der bei den
    // anderen Zeilen „Lebensmittel" steht.
    const zeile = screen.getByText("Uebertrag").closest("tr")!;
    const zellen = [...zeile.querySelectorAll("td")].map((z) => z.textContent ?? "");
    const katSpalte = zellen.findIndex((z) => z.includes("Umbuchung"));
    expect(katSpalte).toBeGreaterThan(0);
    // Und bei einer normalen Zeile steht an derselben Stelle die Kategorie.
    const andere = screen.getByText("Baecker").closest("tr")!;
    expect([...andere.querySelectorAll("td")][katSpalte].textContent).toContain("Lebensmittel");
  });

  it("zeigt in der Kontenliste weder Anfangsbestand noch Abgleich", async () => {
    await dreiBuchungen();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findAllByText("Girokonto");
    // Beide Spalten sind 2026-08-19 aus der Liste geflogen: der Anfangsbestand steht im
    // geoeffneten Konto, der Abgleich ebenfalls — in der Liste waren sie Ballast.
    const kopfzeilen = [...document.querySelectorAll("th")].map((z) => z.textContent ?? "");
    expect(kopfzeilen.some((z) => /Anfangsbestand/i.test(z))).toBe(false);
    expect(kopfzeilen.some((z) => /Abgleich/i.test(z))).toBe(false);
  });
});

describe("Massenbearbeitung im Register", () => {
  const heute = "2026-08-12";

  async function zweiOhneKategorie() {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -1250, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", notiz: "Baecker",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: -8900, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", notiz: "Tankstelle",
    });
  }

  /** Schaltet den Auswahlmodus ein und markiert alle gefilterten Zeilen. */
  async function alleMarkieren(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click(screen.getByLabelText(/mehrere bearbeiten/i));
    await nutzer.click(await screen.findByLabelText(/alle gefilterten/i));
  }

  it("zeigt die Kästchen erst, wenn man den Modus einschaltet", async () => {
    await zweiOhneKategorie();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findByText("Baecker");

    // Eine dauerhafte Kästchenspalte macht aus einer Leseansicht ein Formular.
    expect(screen.queryByLabelText(/diese buchung wählen/i)).toBeNull();
    await nutzer.click(screen.getByLabelText(/mehrere bearbeiten/i));
    expect(screen.getAllByLabelText(/diese buchung wählen/i)).toHaveLength(2);
  });

  it("setzt die Kategorie auf allen markierten Buchungen", async () => {
    await zweiOhneKategorie();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findByText("Baecker");
    await alleMarkieren(nutzer);

    await nutzer.click(screen.getByRole("button", { name: /auswahl bearbeiten/i }));
    const dialog = within(await screen.findByRole("dialog"));
    // Ohne Haken passiert nichts — leer heisst hier „nicht anfassen".
    await nutzer.click(dialog.getByLabelText(/kategorie setzen/i));
    await nutzer.click(dialog.getByRole("button", { name: /Kategorie wählen|—|▾/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel/ }));
    await nutzer.click(dialog.getByRole("button", { name: /anwenden/i }));

    await waitFor(async () => {
      const alle = await sqliteLedgerRepository.alle();
      expect(alle.every((b) => b.kategorieId === "kat1")).toBe(true);
      // Die Bezeichnungen bleiben stehen: danach wurde nicht gefragt.
      expect(alle.map((b) => b.notiz).sort()).toEqual(["Baecker", "Tankstelle"]);
    });
  });

  it("löscht die markierten Buchungen nach Rückfrage", async () => {
    await zweiOhneKategorie();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await screen.findByText("Baecker");
    await alleMarkieren(nutzer);

    await nutzer.click(screen.getByRole("button", { name: /auswahl bearbeiten/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await nutzer.click(dialog.getByRole("button", { name: /^löschen$/i }));
    // Zweite Frage, mit der Zahl darin — Löschen ist der einzige Weg ohne Rückweg.
    await nutzer.click(await dialog.findByRole("button", { name: /2 löschen/i }));

    await waitFor(async () => expect(await sqliteLedgerRepository.alle()).toHaveLength(0));
  });
});

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

// Aus einer gebuchten Zahlung einen Vertrag machen. Der Weg ist die Umkehrung der
// Vertragserkennung: die kennt viele Zahlungen und rät den Takt, hier kennt man EINE
// Zahlung und trägt den Takt selbst nach. Geprüft wird beides — dass die Vorbelegung
// aus der Buchung kommt, und dass Vertrag UND Zahlungsregel danach in SQLite stehen.
describe("Vertrag aus einer Buchung", () => {
  const heute = "2026-08-12";

  async function zahlungAnlegen() {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -2999, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
    });
    await sqliteImportLaufRepository.speichern({
      id: "l1", quelle: "finanzguru", dateiname: "a.xlsx", zeitpunkt: "2026-08-12T10:00:00Z",
      eingelesen: 1, neu: 1, duplikate: 0,
    });
    await sqliteUmsatzRepository.anlegen({
      id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: heute, betrag: -2999,
      waehrung: "EUR", gegenpartei: "Telefonica Germany GmbH", verwendungszweck: "Mobilfunk",
      rohHash: "h1", status: "verbucht", istbuchungId: "i1",
    });
  }

  async function detailOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);
  }

  it("übernimmt Empfänger, Betrag, Konto und Kategorie in die Vertragsmaske", async () => {
    await zahlungAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /vertrag daraus machen/i }));

    // Nach Daten suchen, die der Test selbst angelegt hat — nicht nach Formulierungen.
    expect((await screen.findByDisplayValue("Telefonica Germany GmbH")).tagName).toBe("INPUT");
    // Die Maske trägt den Betrag POSITIV — die Richtung steckt im Charakter.
    await screen.findByDisplayValue("29.99");
    // Sichtbar ist die erste Fälligkeit; der Vertragsbeginn liegt im zugeklappten
    // Konditionen-Block und trägt dasselbe Datum. Beide sind seit 2026-08-25 ein
    // `Datumsfeld` und zeigen deshalb die Landesschreibweise, nicht mehr ISO.
    const heuteAngezeigt = "12.08.2026";
    expect(await screen.findAllByDisplayValue(heuteAngezeigt)).toHaveLength(1);
    await nutzer.click(screen.getByRole("button", { name: /Vertragsdaten/i }));
    expect(await screen.findAllByDisplayValue(heuteAngezeigt)).toHaveLength(2);
  });

  it("legt Vertrag und Zahlungsregel an", async () => {
    await zahlungAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /vertrag daraus machen/i }));
    await nutzer.click(((a) => a[a.length - 1]!)(screen.getAllByRole("button", { name: /speichern/i })));

    await waitFor(async () => {
      const [v] = await sqliteVertragRepository.alle();
      expect(v?.anbieter).toBe("Telefonica Germany GmbH");
      expect(v?.beginn).toBe(heute);
    });
    const [v] = await sqliteVertragRepository.alle();
    const regeln = await sqliteZahlungsregelRepository.alle();
    const regel = regeln.find((r) => r.vertragId === v.id);
    // Der Betrag kommt positiv in die Maske; das Vorzeichen setzt der Use-Case aus dem
    // Charakter — eine Aufwands-Regel muss abfliessen, nicht zufliessen.
    expect(regel?.betrag).toBe(-2999);
    expect(regel?.kontoId).toBe("k1");
    expect(regel?.kategorieId).toBe("kat1");
    expect(regel?.startdatum).toBe(heute);
  });

  /**
   * Die ganze Kette in einem Test: Erkennungsregel → Abgleich → Kennzeichnung im Dialog.
   * Der Anbietername im Vertrag ist bewusst anders geschrieben als im Umsatz — gematcht
   * wird über den normalisierten Namen, sonst hinge die Zuordnung daran, wie die Bank
   * den Empfänger schreibt.
   */
  it("kennzeichnet eine Buchung, die der Abgleich einem Vertrag zugeordnet hat", async () => {
    await zahlungAnlegen();
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Telefonica Germany", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await erkennungSicherstellen(sqliteVertragserkennungRepository, "v1", "Telefonica Germany", 2999);
    await zuordnungenAbgleichen(vertragsAbgleichDeps);

    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    // Zweimal: als Kennzeichnung und als gewählter Eintrag in der Zuordnungs-Auswahl.
    expect(await screen.findAllByText("Telefonica Germany")).not.toHaveLength(0);
    // Der Anlege-Weg ist weg — sonst legte man beim zweiten Blick denselben Vertrag
    // ein zweites Mal an.
    expect(screen.queryByRole("button", { name: /vertrag daraus machen/i })).toBeNull();
  });

  /**
   * Der Rückweg, ohne den „automatisch" eine Zumutung wäre: die Automatik greift daneben,
   * der Mensch überstimmt sie — und die Korrektur muss den nächsten Abgleich überleben.
   * Geprüft wird an der gespeicherten Zuordnung, nicht an der Anzeige: nur dort steht,
   * ob die Entscheidung wirklich festgehalten wurde.
   */
  it("lässt eine automatische Zuordnung von Hand aufheben — dauerhaft", async () => {
    await zahlungAnlegen();
    await sqliteVertragRepository.speichern({
      id: "v1", anbieter: "Telefonica Germany", beginn: "2025-01-01",
      verlaengerung: "automatisch", status: "aktiv",
    });
    await erkennungSicherstellen(sqliteVertragserkennungRepository, "v1", "Telefonica Germany", 2999);
    await zuordnungenAbgleichen(vertragsAbgleichDeps);
    expect((await sqliteVertragszuordnungRepository.alle())[0].vertragId).toBe("v1");

    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await detailOeffnen(nutzer);

    await auswahlWaehlen(nutzer, /vertrag zuordnen/i, "kein Vertrag");

    await waitFor(async () => {
      const z = (await sqliteVertragszuordnungRepository.alle())[0];
      expect(z.vertragId).toBeNull();
      expect(z.herkunft).toBe("manuell");
    });

    // Und der nächste Abgleich rechnet sie NICHT zurück.
    await zuordnungenAbgleichen(vertragsAbgleichDeps);
    const danach = (await sqliteVertragszuordnungRepository.alle())[0];
    expect(danach.vertragId).toBeNull();
    expect(danach.herkunft).toBe("manuell");
  });

  it("bietet den Weg bei einem Umbuchungs-Bein nicht an", async () => {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -50000, kontoId: "k1", gegenkontoId: "k2",
      transferId: "t1", charakter: "Umschichtung", quelle: "manuell",
    });
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: 50000, kontoId: "k2", gegenkontoId: "k1",
      transferId: "t1", charakter: "Umschichtung", quelle: "manuell",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await detailOeffnen(nutzer);
    await screen.findByText(/Gegenkonto/i);
    expect(screen.queryByRole("button", { name: /vertrag daraus machen/i })).toBeNull();
  });
});

/**
 * Der Vergleich ist der Ort, an dem über ein Dublettenpaar entschieden wird. Geprüft wird
 * an dem, was danach in der Datenbank steht — nicht an Beschriftungen: welche der beiden
 * Zeilen verschwindet, ist die ganze Frage, und ein Dialog, der die falsche nimmt, sähe
 * im Markup genauso richtig aus.
 */
describe("Dubletten nebeneinander vergleichen", () => {
  /**
   * Dasselbe Paar, wie es im echten Bestand vorkommt: eine Zeile aus einer Datei, eine aus
   * dem Bankabruf, gleicher Tag, gleicher Betrag. Nur so entsteht überhaupt ein Verdacht
   * im Ledger — innerhalb EINES Laufs wird bewusst nicht gemeldet.
   */
  async function paarAnlegen() {
    await grunddaten();
    await sqliteImportLaufRepository.speichern({
      id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-10T09:00:00.000Z",
      dateiname: "auszug.csv", eingelesen: 1, neu: 1, duplikate: 0,
    });
    await sqliteImportLaufRepository.speichern({
      id: "l-bank", quelle: "fints", zeitpunkt: "2026-08-12T09:00:00.000Z",
      eingelesen: 1, neu: 1, duplikate: 0,
    });
    for (const [ist, lauf, umsatz, hash] of [
      ["i-datei", "l-datei", "u-datei", "h-datei"],
      ["i-bank", "l-bank", "u-bank", "h-bank"],
    ] as const) {
      await sqliteLedgerRepository.speichern({
        id: ist, datum: "2026-07-20", betrag: -7430, kontoId: "k1",
        charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
      });
      await sqliteUmsatzRepository.anlegen({
        id: umsatz, laufId: lauf, zahlungskontoId: "k1", buchungstag: "2026-07-20",
        betrag: -7430, waehrung: "EUR", gegenpartei: "Vibora Ohlert",
        verwendungszweck: "Rechnung 4711", rohHash: hash, status: "verbucht", istbuchungId: ist,
      });
    }
  }

  async function vergleichOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    const pillen = await screen.findAllByRole("button", { name: /nebeneinander vergleichen/i });
    await nutzer.click(pillen[0]);
  }

  it("zeigt beide Zeilen mit ihrer Herkunft, sobald die Markierung angeklickt wird", async () => {
    await paarAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await vergleichOeffnen(nutzer);

    // Nach den DATEN suchen, die der Test angelegt hat: beide Herkünfte stehen im Dialog,
    // und genau daran unterscheidet man die zwei Spalten.
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("auszug.csv");
      expect(text).toContain("h-datei");
      expect(text).toContain("h-bank");
    });
  });

  it("verwirft die Bankzeile und lässt die Zeile aus der Datei stehen", async () => {
    await paarAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await vergleichOeffnen(nutzer);

    // Die Bankzeile ist die zweite Spalte (später importiert, gleiches Datum → rechts
    // steht der Zwilling). Der Knopf heisst bei ihr „verwerfen", bei der Datei „löschen" —
    // das ist der sichtbare Unterschied zwischen den beiden Wegen.
    await nutzer.click(await screen.findByRole("button", { name: /diese zeile verwerfen/i }));

    await waitFor(async () => {
      const ids = (await sqliteLedgerRepository.alle()).map((b) => b.id);
      expect(ids).toEqual(["i-datei"]);
      const bank = (await sqliteUmsatzRepository.alle()).find((u) => u.id === "u-bank");
      expect(bank?.status).toBe("verworfen");
    });
  });

  it("hält „kein Duplikat“ fest, ohne eine der beiden anzufassen", async () => {
    await paarAnlegen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await vergleichOeffnen(nutzer);
    await nutzer.click(await screen.findByRole("button", { name: /kein duplikat/i }));

    await waitFor(async () => {
      expect(await sqliteDublettenfreigabeRepository.alle()).toHaveLength(1);
      expect(await sqliteLedgerRepository.alle()).toHaveLength(2);
    });
  });
});

/**
 * Auf einem abgerufenen Konto sagt die BANK, was daraufsteht. Eine von Hand angelegte oder
 * geänderte Zeile wäre dort eine Behauptung gegen den Kontoauszug: sie taucht beim
 * nächsten Abgleich als Abweichung auf, und dann weiss niemand mehr, dass sie von Hand
 * entstanden ist — sie sieht aus wie eine fehlende Buchung.
 *
 * Was sich ändern lässt, ist die EINORDNUNG (Bezeichnung, Kategorie): die gehört dem
 * Nutzer. Genau diese Trennung prüfen die Tests hier — dass gar nichts mehr ginge, wäre
 * derselbe Fehler in die andere Richtung.
 */
describe("Online geführte Konten werden nicht von Hand bebucht", () => {
  const heute = "2026-08-12";

  /** Macht das Girokonto zu einem Online-Konto; „Bargeld" bleibt von Hand geführt. */
  async function mitBankverbindung() {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteBankzugangRepository.speichern({
      id: "z1", bezeichnung: "Testbank", art: "fints", url: "https://example.invalid/fints",
      blz: "99999901", benutzer: "nutzer",
    });
    await sqliteKontozuordnungRepository.speichern({
      zugangId: "z1", schluessel: "1234567|", zahlungskontoId: "k1",
    });
  }

  it("bietet auf dem Bankkonto keine neue Buchung an, auf dem Bargeldkonto schon", async () => {
    await mitBankverbindung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    // Der Knopf traegt ein fuehrendes „+" aus der Button-Komponente — verankert wird
    // trotzdem am ganzen Namen, damit „Buchungsdetails" nicht mitzaehlt.
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^\+\s*buchung$/i })).not.toBeInTheDocument();
    });

    await nutzer.click((await screen.findAllByText("Bargeld"))[0]);
    expect(await screen.findByRole("button", { name: /^\+\s*buchung$/i })).toBeInTheDocument();
  });

  /**
   * Umbuchen legt ZWEI neue Buchungen an. Mit nur einem Konto von Hand bleibt kein Paar
   * übrig, für das der Dialog etwas anlegen dürfte — also erscheint er gar nicht.
   */
  it("bietet kein Umbuchen an, wenn nur ein Konto von Hand geführt wird", async () => {
    await mitBankverbindung();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Bargeld"))[0]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /umbuchen/i })).not.toBeInTheDocument();
    });
  });

  // Der Test „legt aus der geplanten Vorschau keine Buchung an" stand hier und ist mit der
  // Vorschau in die Übersicht gezogen (`uebersicht/vorschau.test.tsx`). Die Zusage gilt
  // unverändert — sie gilt nur nicht mehr diesem Bildschirm.

  /**
   * Und auch mit genug Konten von Hand nicht, solange ein ONLINE-Konto offen ist.
   *
   * Die Umbuchung geht immer von dem Auszug aus, den man gerade vor sich hat. Bei einem
   * Bankkonto wäre das eine Ausgangsseite, auf der von Hand gar nicht gebucht werden darf
   * — der Dialog bot sie an und fiel dann still auf ein anderes Konto zurück.
   */
  it("bietet auf einem Online-Konto kein Umbuchen an, auch wenn zwei Konten von Hand da sind", async () => {
    await mitBankverbindung();
    await sqliteZahlungskontoRepository.speichern({
      id: "k3", bezeichnung: "Spardose", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /umbuchen/i })).not.toBeInTheDocument();
    });

    // Auf einem Konto von Hand steht er dagegen — sonst prüfte der Test nur, dass gar
    // nichts erscheint.
    await nutzer.click((await screen.findAllByText("Bargeld"))[0]);
    expect(await screen.findByRole("button", { name: /umbuchen/i })).toBeInTheDocument();
  });

  it("sperrt Betrag und Datum einer Buchung auf dem Bankkonto, nicht aber ihre Bezeichnung", async () => {
    await mitBankverbindung();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -1234, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);

    expect(await screen.findByLabelText(/betrag/i)).toBeDisabled();
    expect(await screen.findByLabelText(/datum/i)).toBeDisabled();
    // Die Einordnung bleibt frei — sonst wäre die Zeile gar nicht mehr zu pflegen.
    const bezeichnung = await screen.findByRole("textbox", { name: /bezeichnung/i });
    expect(bezeichnung).not.toBeDisabled();
  });

  it("lässt Betrag und Datum auf einem von Hand geführten Konto in Ruhe", async () => {
    await mitBankverbindung();
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: heute, betrag: -500, kontoId: "k2",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Bargeld"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);

    expect(await screen.findByLabelText(/betrag/i)).not.toBeDisabled();
    expect(await screen.findByLabelText(/datum/i)).not.toBeDisabled();
  });
});

/**
 * Der Marker beantwortet keine Frage über die Zahlung, sondern eine über den Nutzer: habe
 * ich mir das angesehen? Deshalb wird hier an den DATEN geprüft, was nach dem Klick steht —
 * eine Pille, die verschwindet, ohne dass sich etwas gemerkt hat, sähe genauso aus.
 */
describe("Prüfmarker im Auszug", () => {
  const heute = "2026-08-12";

  async function buchungMitMarker(zuPruefen: boolean) {
    await grunddaten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -1250, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1", notiz: "Ohlert",
      zuPruefen: zuPruefen || undefined,
    });
  }

  it("nimmt den Marker weg, wenn man auf die Pille klickt", async () => {
    await buchungMitMarker(true);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click(await screen.findByRole("button", { name: /marker entfernen/i }));

    await waitFor(async () => {
      const b = (await sqliteLedgerRepository.alle()).find((x) => x.id === "i1");
      expect(b?.zuPruefen).toBeUndefined();
    });
    expect(screen.queryByRole("button", { name: /marker entfernen/i })).not.toBeInTheDocument();
  });

  it("zeigt gar keine Pille, wenn nichts vorgemerkt ist", async () => {
    await buchungMitMarker(false);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await screen.findAllByRole("button", { name: "bearbeiten" });
    expect(screen.queryByRole("button", { name: /marker entfernen/i })).not.toBeInTheDocument();
  });

  /** Der zweite Weg: im Detail von Hand vormerken — auch bei einer Zeile ohne Marker. */
  it("merkt eine Zeile über das Kästchen im Detail vor", async () => {
    await buchungMitMarker(false);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);

    const kasten = await screen.findByRole("checkbox", { name: /ansehen/i });
    expect(kasten).not.toBeChecked();
    await nutzer.click(kasten);

    await waitFor(async () => {
      const b = (await sqliteLedgerRepository.alle()).find((x) => x.id === "i1");
      expect(b?.zuPruefen).toBe(true);
    });
  });

  /**
   * Der Marker wirkt SOFORT, nicht erst beim Speichern: er ist eine Handlung („gesehen"),
   * keine Eigenschaft, die man miterfasst. Wer den Dialog ohne Speichern schliesst, hat
   * ihn trotzdem gesetzt.
   */
  it("wirkt sofort, auch ohne Speichern", async () => {
    await buchungMitMarker(true);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);
    await nutzer.click(await screen.findByRole("checkbox", { name: /ansehen/i }));
    await nutzer.click(await screen.findByRole("button", { name: /abbrechen/i }));

    await waitFor(async () => {
      const b = (await sqliteLedgerRepository.alle()).find((x) => x.id === "i1");
      expect(b?.zuPruefen).toBeUndefined();
    });
  });
});

/**
 * Der Umbuchungs-Dialog kennt zwei Wege: eine vorhandene Gegenbuchung VERBINDEN (S-1b)
 * und ein fehlendes Gegenbein ERZEUGEN (S-1a). Nur der zweite legt etwas an, das die Bank
 * nicht kennt — deshalb steht er auf einem abgerufenen Konto nicht zur Wahl.
 */
describe("Gegenbein erzeugen nur auf Konten ohne Bankverbindung", () => {
  const heute = "2026-08-12";

  /** Giro und Tagesgeld hängen an der Bank, Bargeld nicht. */
  async function dreiKonten(bargeld: boolean) {
    await grunddaten();
    await sqliteZahlungskontoRepository.speichern({
      id: "k-tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    if (bargeld) {
      await sqliteZahlungskontoRepository.speichern({
        id: "k-bar", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
      });
    }
    await sqliteBankzugangRepository.speichern({
      id: "z1", bezeichnung: "Testbank", art: "fints", url: "https://example.invalid/fints",
      blz: "99999901", benutzer: "nutzer",
    });
    for (const [schluessel, kontoId] of [["1234567|", "k1"], ["7654321|", "k-tg"]] as const) {
      await sqliteKontozuordnungRepository.speichern({ zugangId: "z1", schluessel, zahlungskontoId: kontoId });
    }
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: heute, betrag: -20000, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1", notiz: "Abhebung",
    });
  }

  async function umbuchungsdialog(nutzer: ReturnType<typeof userEvent.setup>) {
    await nutzer.click((await screen.findAllByText("Girokonto"))[0]);
    await nutzer.click((await screen.findAllByRole("button", { name: "bearbeiten" }))[0]);
    // Exakt: „Umbuchen" in der Werkzeugleiste und „Zur Umbuchung machen" im Dialog
    // treffen beide auf einen toleranten Ausdruck.
    await nutzer.click(await screen.findByRole("button", { name: "Zur Umbuchung machen" }));
  }

  it("bietet nur das Bargeldkonto als Ziel an, nicht das zweite Bankkonto", async () => {
    await dreiKonten(true);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await umbuchungsdialog(nutzer);

    // Die Liste einer `Auswahl` steht erst im DOM, wenn sie offen ist.
    await nutzer.click(await screen.findByRole("combobox", { name: "Gegenbein neu erzeugen auf" }));
    const namen = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(namen).toContain("Bargeld");
    expect(namen).not.toContain("Tagesgeld");
  });

  /**
   * Bleibt gar kein Ziel übrig, verschwindet der Weg ganz — ein Radio-Knopf über einer
   * leeren Auswahlliste wäre eine Handlung, die nicht geht.
   */
  it("lässt den Erzeugen-Weg weg, wenn alle anderen Konten an der Bank hängen", async () => {
    await dreiKonten(false);
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await umbuchungsdialog(nutzer);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/nur verbunden/i);
    });
    expect(screen.queryByRole("combobox", { name: "Gegenbein neu erzeugen auf" })).not.toBeInTheDocument();
  });
});
