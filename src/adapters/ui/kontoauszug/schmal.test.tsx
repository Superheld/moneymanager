/** @vitest-environment jsdom */
// Buchungen schmal: oben das gewählte Konto mit einem Auswahlfeld, darunter das Gebuchte,
// die Liste aller Konten eingeklappt am Ende — und breit alles wie vorher.
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
import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { KontenScreen } from "./KontenScreen";

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

/** Zwei Konten, auf dem ersten eine Buchung — damit gibt es ein Gebuchtes mit Zeile. */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "k-ilvar", bezeichnung: "Ilvar Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 10000 });
  await sqliteZahlungskontoRepository.speichern({ id: "k-pemm", bezeichnung: "Pemmert Tagesgeld", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 50000 });
  await sqliteLedgerRepository.speichern({
    id: "b-1", datum: "2026-10-02", betrag: -2340, kontoId: "k-ilvar", charakter: "Aufwand", quelle: "manuell", notiz: "Sornwald",
  });
}

const kontoFeld = () => screen.findByRole("combobox", { name: t("konten.detail.konto") });
const gebucht = () => screen.findByText(t("konten.gebuchtTitel"));
const listenZeile = () => screen.findByRole("button", { name: new RegExp(t("konten.deineKonten")) });
const vorher = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Buchungen — schmal", () => {
  it("stellt das Auswahlfeld vor das Gebuchte und die Kontenliste ans Ende", async () => {
    await bestand();
    schmalStellen();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const feld = await kontoFeld();
    const titelGebucht = await gebucht();
    const zeile = await listenZeile();
    expect(feld.textContent).toContain("Ilvar Giro");
    expect(vorher(feld, titelGebucht)).toBe(true);
    expect(vorher(titelGebucht, zeile)).toBe(true);
    // Die Zeile nennt die Zahl der Konten.
    expect(zeile.textContent).toContain("(2)");
    // Das Gebuchte ist das des gewählten Kontos.
    expect(await screen.findByText("Sornwald")).toBeInTheDocument();
  });

  it("klappt die Kontenliste ein, und sie geht auf, mit allem, was breit darin steht", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const zeile = await listenZeile();
    expect(zeile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(t("konten.deineKontenUntertitel"))).not.toBeInTheDocument();
    expect(screen.queryByText("Pemmert Tagesgeld")).not.toBeInTheDocument();

    await nutzer.click(zeile);
    expect(zeile).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(t("konten.deineKontenUntertitel"))).toBeInTheDocument();
    expect(screen.getByText("Pemmert Tagesgeld")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(t("konten.kontoAnlegen")) })).toBeInTheDocument();
  });

  it("wechselt das Konto über das Auswahlfeld", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await screen.findByText("Sornwald");
    await auswahlWaehlen(nutzer, t("konten.detail.konto"), "Pemmert Tagesgeld");
    expect((await kontoFeld()).textContent).toContain("Pemmert Tagesgeld");
    expect(screen.queryByText("Sornwald")).not.toBeInTheDocument();
  });

  /** Ohne Konto trägt die Liste den leeren Zustand mit seinen Wegen — sie bleibt oben und offen. */
  it("laesst die Liste ohne Konto oben und offen", async () => {
    schmalStellen();
    rendere(<KontenScreen onNavigate={() => {}} />);

    expect(await screen.findByText(t("konten.leerOhneKonto"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(t("konten.deineKonten")) })).not.toBeInTheDocument();
  });
});

describe("Buchungen — breit", () => {
  it("stellt die Kontenliste offen über den Auszug, ohne Auswahlfeld, wie bisher", async () => {
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const untertitel = await screen.findByText(t("konten.deineKontenUntertitel"));
    const titelGebucht = await gebucht();
    expect(vorher(untertitel, titelGebucht)).toBe(true);
    expect(screen.getByText("Pemmert Tagesgeld")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: t("konten.detail.konto") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(`${t("konten.deineKonten")}.*\\(2\\)`) })).not.toBeInTheDocument();
  });
});
