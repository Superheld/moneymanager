/** @vitest-environment jsdom */
// Rücklagen schmal: oben, was auf eine Zuordnung wartet, dann die Rücklagen je als kurze
// Zeile; Stand, Faustformel, „Wo das Geld liegt" und der Erklärtext eingeklappt — und
// breit alles wie vorher.
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
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { RuecklagenScreen } from "./RuecklagenScreen";

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

/**
 * Zwei Rücklagen mit Ziel an DERSELBEN Kategorie, ohne Konto, und eine Buchung dort —
 * sie wartet auf Zuordnung. Ohne Konto stehen beide unter „Wo das Geld liegt" bei
 * „Ohne Konto".
 */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Dravelt Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
  await sqliteKategorieRepository.speichern({ id: "kat-quen", name: "Quendrik", defaultCharakter: "Aufwand" });
  for (const [id, name] of [["r-asp", "Asperlin"], ["r-mol", "Molvaret"]]) {
    await sqliteRuecklagenRepository.speichern({
      id, bezeichnung: name, kategorieId: "kat-quen", art: "abschliessend", beginn: "2026-01-01", findetAb: "2026-01-01", ziel: 60000, fristMonate: 12,
    });
  }
  await sqliteLedgerRepository.speichern({
    id: "b-quen", datum: "2026-03-04", betrag: -12345, kontoId: "giro", charakter: "Aufwand", quelle: "manuell",
    kategorieId: "kat-quen", notiz: "Torvelin",
  });
}

const vorher = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const klappzeile = (schluessel: string) => screen.findByRole("button", { name: new RegExp(t(schluessel).replace(/[()?]/g, "\\$&")) });

describe("Rücklagen — schmal", () => {
  it("stellt Wartendes vor die Liste und rückt Stand und Faustformel eingeklappt darunter", async () => {
    await bestand();
    schmalStellen();
    rendere(<RuecklagenScreen />);

    const wartet = await screen.findByText(t("ruecklagen.wartend.titel"));
    const liste = await screen.findByText(t("ruecklagen.listeTitel"));
    const faustformel = await klappzeile("ruecklagen.mindestTitel");
    const geld = await klappzeile("ruecklagen.geldJeKonto.titel");
    expect(vorher(wartet, liste)).toBe(true);
    expect(vorher(liste, faustformel)).toBe(true);
    expect(vorher(faustformel, geld)).toBe(true);
    // Die Zeile nennt die Karten, die darin stehen — mit ihren eigenen Überschriften.
    expect(faustformel.textContent).toContain(t("ruecklagen.standTitel"));
    // Eingeklappt: die Karten selbst stehen nicht da.
    expect(screen.queryByText(t("ruecklagen.standUntertitel"))).not.toBeInTheDocument();
    expect(screen.queryByText(t("ruecklagen.geldJeKonto.ohneKontoTitel"))).not.toBeInTheDocument();
  });

  it("klappt den Erklaertext hinter eine Frage", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);

    const frage = await klappzeile("ruecklagen.erklaerungFrage");
    expect(frage).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Ziel mit Frist/)).not.toBeInTheDocument();
    await nutzer.click(frage);
    expect(await screen.findByText(/Ziel mit Frist/)).toBeInTheDocument();
  });

  it("zeigt je Rücklage eine Zeile mit Stand und Ziel; Tippen öffnet Knöpfe und Verlauf", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);

    const zeile = await screen.findByRole("button", { name: /Asperlin/ });
    expect(zeile).toHaveAttribute("aria-expanded", "false");
    expect(zeile.textContent).toMatch(/\/ 600,00/);
    expect(zeile.querySelector("[role=meter]")).not.toBeNull();
    // Was breit in der Zeile steht, liegt dahinter.
    expect(screen.queryAllByRole("button", { name: t("ruecklagen.bearbeiten") })).toHaveLength(0);

    await nutzer.click(zeile);
    expect(zeile).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: t("ruecklagen.bearbeiten") })).toHaveLength(1);
    expect(await screen.findByText(t("ruecklagen.verlaufTitel", { name: "Asperlin" }))).toBeInTheDocument();
  });

  it("klappt Wo das Geld liegt auf, samt Ohne Konto", async () => {
    await bestand();
    schmalStellen();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);

    const zeile = await klappzeile("ruecklagen.geldJeKonto.titel");
    await nutzer.click(zeile);
    expect(zeile).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(t("ruecklagen.geldJeKonto.untertitel"))).toBeInTheDocument();
    expect(screen.getAllByText(t("ruecklagen.geldJeKonto.ohneKontoTitel")).length).toBeGreaterThan(0);
  });
});

describe("Rücklagen — breit", () => {
  it("stellt Stand und Faustformel offen über die Liste und Wartendes danach, wie bisher", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);

    const stand = await screen.findByText(t("ruecklagen.standUntertitel"));
    const liste = await screen.findByText(t("ruecklagen.listeTitel"));
    const wartet = await screen.findByText(t("ruecklagen.wartend.titel"));
    expect(vorher(stand, liste)).toBe(true);
    expect(vorher(liste, wartet)).toBe(true);
    // Offen und ohne Zeilen zum Aufklappen; der Erklärtext steht da.
    expect(screen.getByText(/Ziel mit Frist/)).toBeInTheDocument();
    expect(screen.getByText(t("ruecklagen.geldJeKonto.untertitel"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(t("ruecklagen.erklaerungFrage").replace("?", "\\?")) })).not.toBeInTheDocument();
    // Der Name öffnet den Verlauf wie bisher; die Knöpfe stehen in der Zeile.
    expect(screen.getByRole("button", { name: t("ruecklagen.verlaufAuf", { name: "Asperlin" }) })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("ruecklagen.bearbeiten") })).toHaveLength(2);
  });
});
