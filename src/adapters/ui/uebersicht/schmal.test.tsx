/** @vitest-environment jsdom */
// Die Übersicht schmal: der laufende Monat oben, „Damit die Zahlen stimmen" darunter als
// eine Zeile, die aufklappt — und breit alles wie vorher.
//
// `matchMedia` gibt es in jsdom nicht; ohne die Attrappe gilt BREIT (siehe `useSchmal`).
// Gegen die echte In-Memory-SQLite, Namen und Beträge erfunden.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { UebersichtScreen } from "./UebersichtScreen";
import { planzahlungSpeichern } from "../../../testwerkzeug/planzahlung";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});
afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte) as string;

function schmalStellen() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (media: string) => ({
      matches: true, media, onchange: null,
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
      addListener() {}, removeListener() {},
    }),
  });
}

function heute(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * Ein Konto, ein Vertrag (damit gibt es Monatskarten) und zwei Zahlungen OHNE Kategorie
 * — der Schritt „Wofür war das Geld?" ist damit offen und trägt seine Einschränkung.
 */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k-marwede", bezeichnung: "Marwede Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
  });
  await planzahlungSpeichern({
    id: "r-tessin", bezeichnung: "Tessin", betrag: -2300, rhythmus: "monatlich",
    startdatum: "2026-01-01", charakter: "Aufwand",
  });
  for (const id of ["b-1", "b-2"]) {
    await sqliteLedgerRepository.speichern({
      id, datum: heute(), betrag: -1700, kontoId: "k-marwede", charakter: "Aufwand", quelle: "manuell",
    });
  }
}

const titel = () => screen.findByText(t("einrichtung.titel"));
const einschraenkung = () => t("einrichtung.schritt.kategorien.warumAnzahl", { count: 2 });

describe("Übersicht — schmal", () => {
  it("stellt den laufenden Monat vor die Einrichtung, die Einrichtung vor die kommenden", async () => {
    await bestand();
    schmalStellen();
    rendere(<UebersichtScreen />);

    const einrichtung = await titel();
    const karten = [...document.querySelectorAll(".ausblick-karten > *")];
    // Erste Karte: der laufende Monat. Zweite: die Einrichtung. Danach die kommenden.
    expect(karten.length).toBeGreaterThanOrEqual(3);
    expect(karten[0].contains(einrichtung)).toBe(false);
    expect(karten[1].contains(einrichtung)).toBe(true);
  });

  it("ist eine Zeile mit dem Stand, die aufklappt", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<UebersichtScreen />);

    const zeile = await screen.findByRole("button", { name: new RegExp(t("einrichtung.titel")) });
    expect(zeile).toHaveAttribute("aria-expanded", "false");
    expect(zeile.textContent).toContain(t("einrichtung.stand", { erledigt: 3, gesamt: 6 }));
    // Die Fragen sind Erklärung und liegen hinter der Zeile.
    expect(screen.queryByText(t("einrichtung.schritt.vertraege.frage"))).not.toBeInTheDocument();

    await nutzer.click(zeile);
    expect(zeile).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(t("einrichtung.schritt.vertraege.frage"))).toBeInTheDocument();
  });

  /**
   * „Drei Ränge": dass Zahlungen ohne Kategorie unter „Ungeplant" stehen, ändert, was die
   * Zahl darüber bedeutet. Der Satz darf nicht hinter den Deckel — zu oder offen, er steht
   * genau einmal da.
   */
  it("laesst die Einschraenkung offen stehen", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<UebersichtScreen />);

    expect(await screen.findAllByText(einschraenkung())).toHaveLength(1);
    await nutzer.click(screen.getByRole("button", { name: new RegExp(t("einrichtung.titel")) }));
    expect(await screen.findAllByText(einschraenkung())).toHaveLength(1);
  });
});

describe("Übersicht — breit", () => {
  it("stellt die Einrichtung vollständig über die Monate, wie bisher", async () => {
    await bestand();
    rendere(<UebersichtScreen />);

    const einrichtung = await titel();
    const monate = document.querySelector(".ausblick-karten") as HTMLElement;
    expect(monate.contains(einrichtung)).toBe(false);
    expect(einrichtung.compareDocumentPosition(monate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Offen, ohne Zeile zum Aufklappen.
    expect(screen.getByText(t("einrichtung.schritt.vertraege.frage"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(t("einrichtung.titel")) })).not.toBeInTheDocument();
  });
});
