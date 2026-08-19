/** @vitest-environment jsdom */
// Der Buchungsdialog in seinen drei Rollen — anlegen, Entwurf prüfen, bearbeiten.
//
// Der wichtigste Test hier ist der erste: das bloße ÖFFNEN eines Entwurfs darf nichts
// schreiben. Vorher lief „bestätigen & bearbeiten" — die Zeile wurde verbucht und danach
// der Bearbeiten-Dialog auf dem Ergebnis geöffnet. Aus Nutzersicht verschwand sie beim
// Hinsehen aus der Liste, und der einzige Ausweg hieß „Löschen", tat aber etwas anderes.
// Genau dieser Weg wird hier festgenagelt.
//
// Gesucht wird nach Daten, die der Test selbst angelegt hat, nicht nach Formulierungen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { KontenScreen } from "./KontenScreen";
import { ReviewScreen } from "./ReviewScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteImportLaufRepository as laufRepo,
  sqliteUmsatzRepository as umsatzRepo,
} from "../persistence/sqliteImportRepositories";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteVertragszuordnungRepository as zuordnungRepo } from "../persistence/sqliteVertragZuordnungRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function grunddaten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await kontoRepo.speichern({ id: "k2", bezeichnung: "Zweitkonto", typ: "Giro", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-le", name: "Lebensmittel", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-so", name: "Sonstiges", defaultCharakter: "Aufwand" });
  // Der Entwurfs-Stapel gehört seit 2026-08-20 allein dem DATEI-Import: der Bankabruf
  // bucht direkt und hat keine Warteliste mehr.
  await laufRepo.speichern({ id: "l-datei", quelle: "finanzguru", zeitpunkt: "2026-08-18T10:00:00Z", eingelesen: 1, neu: 1, duplikate: 0 });
}

/** Eine abgerufene, noch nicht übernommene Zeile. */
async function entwurf(over: Record<string, unknown> = {}) {
  await umsatzRepo.speichern({
    id: "e1", laufId: "l-datei", zahlungskontoId: "k1", buchungstag: "2026-08-17",
    betrag: -4990, waehrung: "EUR", gegenpartei: "Testhaendler Nord",
    verwendungszweck: "Einkauf", rohHash: "h-e1", status: "neu",
    vorschlag: { kategorieId: "kat-so", charakter: "Aufwand", quelle: "ki" },
    ...over,
  });
}

/** Öffnet den Entwurfs-Dialog aus der Import-Inbox und liefert ihn zurück. */
async function entwurfOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Testhaendler Nord");
  await nutzer.click(await screen.findByRole("button", { name: /ansehen & bearbeiten/i }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: /übernehmen/i });
  return within(dialog);
}

describe("Entwurf prüfen", () => {
  it("schreibt beim bloßen Öffnen und Abbrechen nichts", async () => {
    // Der gemeldete Fehler: die Zeile verschwand aus der Liste, sobald der Dialog aufging.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /abbrechen/i }));

    const nachher = (await umsatzRepo.alle()).find((u) => u.id === "e1");
    expect(nachher?.status).toBe("neu");
    expect(nachher?.istbuchungId).toBeUndefined();
    expect(await ledgerRepo.alle()).toHaveLength(0);
    // Und sie steht wieder da, wo sie war.
    expect(await screen.findByText("Testhaendler Nord")).toBeInTheDocument();
  });

  it("übernimmt mit dem im Dialog gewählten Konto und der gewählten Kategorie", async () => {
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.selectOptions(dialog.getByRole("combobox", { name: /^Konto$/ }), "k2");
    await nutzer.click(await dialog.findByRole("button", { name: /Sonstiges/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Lebensmittel/ }));
    await nutzer.click(dialog.getByRole("button", { name: /übernehmen/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(1));
    const gebucht = (await ledgerRepo.alle())[0];
    expect(gebucht.kontoId).toBe("k2");
    expect(gebucht.kategorieId).toBe("kat-le");
    // Der Betrag stammt von der Bank und wurde nicht angefasst.
    expect(gebucht.betrag).toBe(-4990);
    const nachher = (await umsatzRepo.alle()).find((u) => u.id === "e1");
    expect(nachher?.status).toBe("verbucht");
    // Der Konto-Match zieht mit, sonst zeigte die Herkunft weiter aufs alte Konto.
    expect(nachher?.zahlungskontoId).toBe("k2");
  });

  it("lässt Tag und Betrag der Bank nicht ändern", async () => {
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    // Beides ist die Aussage der Bank — im Entwurf steht sie nur da.
    expect(dialog.getByRole("textbox", { name: /^Betrag$/ })).toBeDisabled();
    expect(dialog.getByRole("combobox", { name: /^Konto$/ })).toBeEnabled();
  });

  it("verwirft, ohne die Zeile zu löschen", async () => {
    // „Verworfen ist verworfen" — die Daten bleiben, markiert, und werden übersprungen.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /^verwerfen$/i }));

    await waitFor(async () =>
      expect((await umsatzRepo.alle()).find((u) => u.id === "e1")?.status).toBe("verworfen"),
    );
    expect(await umsatzRepo.alle()).toHaveLength(1);
    expect(await ledgerRepo.alle()).toHaveLength(0);
  });

  it("meldet einen Dublettenverdacht, bevor irgendetwas gebucht ist", async () => {
    await grunddaten();
    await entwurf();
    // Dieselbe Zahlung liegt schon auf dem Konto — gleicher Betrag, gleicher Tag,
    // gleicher Empfänger.
    await umsatzRepo.speichern({
      id: "alt", laufId: "l-abruf", zahlungskontoId: "k1", buchungstag: "2026-08-17",
      betrag: -4990, waehrung: "EUR", gegenpartei: "Testhaendler Nord",
      verwendungszweck: "Einkauf", rohHash: "h-alt", status: "verbucht", istbuchungId: "b-alt",
    });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    expect(dialog.getByText(/schon vorhanden|Dublette/)).toBeInTheDocument();
  });
});

describe("Weglegen und zurueckholen", () => {
  it("legt eine verworfene Zeile sichtbar ab und holt sie zurück", async () => {
    // Der gemeldete Verlust: verworfen war terminal, unsichtbar und ohne Rückweg — der
    // Betrag fehlte danach im Kontostand, ohne dass irgendwo stand, warum.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);

    await screen.findByText("Testhaendler Nord");
    await nutzer.click(screen.getByRole("button", { name: /diese zeile weglegen/i }));

    await waitFor(async () =>
      expect((await umsatzRepo.alle()).find((u) => u.id === "e1")?.status).toBe("verworfen"),
    );

    // Sie ist nicht verschwunden: der Rückweg steht da, mit Anzahl.
    await nutzer.click(await screen.findByRole("button", { name: /weggelegt \(1\)/i }));
    expect(await screen.findByText(/fehlen damit im Kontostand/)).toBeInTheDocument();

    await nutzer.click(await screen.findByRole("button", { name: /zurückholen/i }));

    await waitFor(async () =>
      expect((await umsatzRepo.alle()).find((u) => u.id === "e1")?.status).toBe("neu"),
    );
  });

  it("nennt eine erkannte Dublette beim Namen statt sie zu verwerfen", async () => {
    // „ist schon gebucht" und „verwerfen" sind nicht dasselbe: beim einen bleibt der
    // Kontostand richtig, beim anderen nicht. Der Unterschied steht im Dialog, denn erst
    // dort ist zu sehen, WORAUF sich der Verdacht bezieht.
    await grunddaten();
    await entwurf();
    await umsatzRepo.speichern({
      id: "alt", laufId: "l-abruf", zahlungskontoId: "k1", buchungstag: "2026-08-17",
      betrag: -4990, waehrung: "EUR", gegenpartei: "Testhaendler Nord",
      verwendungszweck: "Einkauf", rohHash: "h-alt", status: "verbucht", istbuchungId: "b-alt",
    });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    // Bei Verdacht heisst der Knopf anders — und tut etwas anderes.
    expect(dialog.queryByRole("button", { name: /^verwerfen$/i })).toBeNull();
    await nutzer.click(dialog.getByRole("button", { name: /ist schon gebucht/i }));

    await waitFor(async () =>
      expect((await umsatzRepo.alle()).find((u) => u.id === "e1")?.status).toBe("duplikat"),
    );
  });
});

describe("Umbuchung und Vertrag am Entwurf", () => {
  it("paart beim Übernehmen mit einer schon gebuchten Gegenbuchung", async () => {
    // Der Alltagsfall: das andere Bein kam mit einem früheren Abruf und ist längst
    // gebucht. Ohne diesen Weg entstünde eine einseitige Umschichtung.
    await grunddaten();
    await entwurf();
    await ledgerRepo.speichern({
      id: "b-gegen", datum: "2026-08-17", betrag: 4990, kontoId: "k2",
      charakter: "Ertrag", quelle: "manuell",
    });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /zur umbuchung machen/i }));
    await nutzer.click(await dialog.findByRole("radio", { name: /bereits gebucht/ }));
    await nutzer.click(dialog.getByRole("button", { name: /übernehmen/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(2));
    const alle = await ledgerRepo.alle();
    const gegen = alle.find((b) => b.id === "b-gegen")!;
    const neue = alle.find((b) => b.id !== "b-gegen")!;
    expect(neue.transferId).toBeTruthy();
    expect(gegen.transferId).toBe(neue.transferId);
    expect(neue.charakter).toBe("Umschichtung");
  });

  it("erzeugt das fehlende Gegenbein auf dem gewählten Konto", async () => {
    // Für Konten, die nicht importiert werden — typisch Bargeld.
    await grunddaten();
    await entwurf();
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.click(dialog.getByRole("button", { name: /zur umbuchung machen/i }));
    await nutzer.click(await dialog.findByRole("radio", { name: /neu erzeugen/i }));
    await nutzer.click(dialog.getByRole("button", { name: /übernehmen/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(2));
    const alle = await ledgerRepo.alle();
    expect(alle.every((b) => b.charakter === "Umschichtung")).toBe(true);
    expect(alle.map((b) => b.kontoId).sort()).toEqual(["k1", "k2"]);
    expect(alle[0].transferId).toBe(alle[1].transferId);
    // Netto null über beide Konten.
    expect(alle.reduce((s, b) => s + b.betrag, 0)).toBe(0);
  });

  it("setzt eine vorgemerkte Vertragszuordnung nach dem Übernehmen", async () => {
    await grunddaten();
    await entwurf();
    await vertragRepo.speichern({
      id: "v1", anbieter: "Testanbieter", beginn: "2026-01-01", status: "aktiv",
      verlaengerung: "automatisch", verlaengerungMonate: 1,
      mindestlaufzeitMonate: 1, kuendigungsfristMonate: 1,
    });
    const nutzer = userEvent.setup();
    rendere(<ReviewScreen />);
    const dialog = await entwurfOeffnen(nutzer);

    await nutzer.selectOptions(await dialog.findByRole("combobox", { name: /vertrag zuordnen/i }), "v1");
    await nutzer.click(dialog.getByRole("button", { name: /übernehmen/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(1));
    const gebucht = (await ledgerRepo.alle())[0];
    await waitFor(async () => {
      const zuordnungen = await zuordnungRepo.alle();
      expect(zuordnungen).toContainEqual({ istbuchungId: gebucht.id, vertragId: "v1", herkunft: "manuell" });
    });
  });
});

describe("Buchung von Hand anlegen", () => {
  it("legt sie auf dem im Dialog gewählten Konto an", async () => {
    // Das Konto fehlte in der alten Anlege-Maske ganz — es kam mit der Zusammenführung.
    await grunddaten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click((await screen.findAllByRole("button", { name: /^\+?\s*Buchung$/ }))[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByRole("combobox", { name: /^Konto$/ });

    await nutzer.selectOptions(dialog.getByRole("combobox", { name: /^Konto$/ }), "k2");
    await nutzer.type(dialog.getByRole("textbox", { name: /^Betrag$/ }), "12,50");
    await nutzer.click(dialog.getByRole("button", { name: /speichern/i }));

    await waitFor(async () => expect(await ledgerRepo.alle()).toHaveLength(1));
    const gebucht = (await ledgerRepo.alle())[0];
    expect(gebucht.kontoId).toBe("k2");
    expect(gebucht.betrag).toBe(-1250);
    expect(gebucht.quelle).toBe("manuell");
  });
});

describe("Charakter folgt der Kategorie", () => {
  // Bis 2026-08-19 stand im Dialog ein drittes Auswahlfeld für den Charakter. Es fragte
  // nach etwas, das die Kategorie längst weiss, und eine abweichende Antwort hätte
  // Auswertungen erzeugt, die sich gegenseitig widersprechen (die gruppieren nach
  // Charakter UND nach Kategorie).
  it("setzt beim Kategoriewechsel den Charakter der Kategorie", async () => {
    await grunddaten();
    await kategorieRepo.speichern({ id: "kat-lohn", name: "Gehalt", defaultCharakter: "Ertrag" });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await nutzer.click(await screen.findByRole("button", { name: /^\+?\s*Buchung$/i }));
    const dialog = within(await screen.findByRole("dialog"));

    // Kein Charakter-Feld mehr — es gibt nichts mehr zu wählen.
    expect(dialog.queryByLabelText(/charakter/i)).not.toBeInTheDocument();

    const betrag = dialog.getByLabelText(/betrag/i);
    await nutzer.type(betrag, "2500");
    await nutzer.click(dialog.getByRole("button", { name: /Kategorie wählen|—|▾/ }));
    await nutzer.click(await screen.findByRole("button", { name: /Gehalt/ }));
    await nutzer.click(dialog.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const alle = await ledgerRepo.alle();
      expect(alle).toHaveLength(1);
      // Ertrag aus der Kategorie — und damit ein ZUFLUSS, nicht ein Abfluss.
      expect(alle[0].charakter).toBe("Ertrag");
      expect(alle[0].betrag).toBe(250000);
    });
  });
});
