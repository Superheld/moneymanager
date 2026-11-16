/** @vitest-environment jsdom */
// Der Bereich Rücklagen über beide Formen: die Kennzahlen oben und die Karte „Wo das Geld
// liegt". Von der Oberfläche bis ins Schema, alle Werte erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Der Erste des Monats, `zurueck` Monate vor dem laufenden. */
function monatsanfang(zurueck: number): string {
  const n = new Date();
  const d = new Date(Date.UTC(n.getFullYear(), n.getMonth() - zurueck, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Zwei Konten mit Ansprüchen und eine Rücklage ohne Konto:
 *  - Tagesgeld (1.000,00): „Kalmbach" von Hand, 100,00 seit drei Monaten → 300,00, gedeckt.
 *  - Sparkonto (100,00): „Rubrik Q" über die Kategorie, 300,00 im laufenden Monat → Rest
 *    300,00, davon nur 100,00 da — es fehlen 200,00.
 *  - „Wendhausen" von Hand ohne Konto, 20,00 seit zwei Monaten → 40,00.
 */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 100000 });
  await sqliteZahlungskontoRepository.speichern({ id: "spar", bezeichnung: "Sparkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 10000 });
  await sqliteKategorieRepository.speichern({ id: "kat-q", name: "Rubrik Q", defaultCharakter: "Aufwand" });
  await sqliteRuecklagenRepository.speichern({ id: "r-kalmbach", bezeichnung: "Kalmbach", rate: 10000, beginn: monatsanfang(3), kontoId: "tg" });
  await sqliteRuecklagenRepository.speichern({ id: "r-wendhausen", bezeichnung: "Wendhausen", rate: 2000, beginn: monatsanfang(2) });
  // Läuft weiter — bis Migration 81 ein aufbauendes Budget.
  await sqliteRuecklagenRepository.speichern({ id: "b-q", bezeichnung: "Rubrik Q", kategorieId: "kat-q", kontoId: "spar", art: "fortlaufend", beginn: monatsanfang(0) });
  await sqliteRuecklagenRepository.rateSpeichern("b-q", { abMonat: monatsanfang(0).slice(0, 7), betrag: 30000 });
}

/** Die Karte zu einem Titel — der Titel sitzt drei Ebenen unter ihrer Fläche. */
async function karte(titel: string): Promise<HTMLElement> {
  const el = await screen.findByText(titel);
  return el.parentElement!.parentElement!.parentElement as HTMLElement;
}

describe("Rücklagen — Kennzahlen über beide Formen", () => {
  it("zählt die Rücklage über die Kategorie in Soll, Gedecktes, Deckung und Bedarf", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    const stand = await karte(i18n.t("ruecklagen.standTitel"));
    // Soll: 300,00 + 40,00 (von Hand) + 300,00 (Rest über die Kategorie) = 640,00.
    await waitFor(() => expect(stand.textContent).toMatch(/640,00/));
    // Da: 300,00 auf dem Tagesgeld + 100,00 auf dem Sparkonto. Deckung 400 / 600 → 67 %.
    expect(stand.textContent).toMatch(/400,00/);
    expect(stand.textContent).toMatch(/67/);
    // Bedarf diesen Monat: 100,00 + 20,00 + 300,00.
    const fluss = await karte(i18n.t("ruecklagen.flussTitel"));
    expect(fluss.textContent).toMatch(/420,00/);
  });

  it("steht auch da, wenn es nur Rücklagen über die Kategorie gibt", async () => {
    await sqliteZahlungskontoRepository.speichern({ id: "spar", bezeichnung: "Sparkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 50000 });
    await sqliteKategorieRepository.speichern({ id: "kat-z", name: "Rubrik Z", defaultCharakter: "Aufwand" });
    await sqliteRuecklagenRepository.speichern({ id: "b-z", bezeichnung: "Rubrik Z", kategorieId: "kat-z", kontoId: "spar", art: "fortlaufend", beginn: monatsanfang(0) });
    await sqliteRuecklagenRepository.rateSpeichern("b-z", { abMonat: monatsanfang(0).slice(0, 7), betrag: 12000 });
    rendere(<RuecklagenScreen />);
    const stand = await karte(i18n.t("ruecklagen.standTitel"));
    await waitFor(() => expect(stand.textContent).toMatch(/120,00/));
    expect(stand.textContent).toMatch(/100/);
    // Sie hat ein Konto — der Satz, alles sei nur Rechnung, wäre falsch.
    expect(document.body.textContent).not.toContain(i18n.t("ruecklagen.hinweisOhneKonto"));
  });
});

describe("Rücklagen — Wo das Geld liegt", () => {
  it("zeigt je Konto die Rücklagen beider Formen, was gedeckt ist und was fehlt", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    await karte(i18n.t("ruecklagen.geldJeKonto.titel"));

    const tg = await screen.findByRole("region", { name: "Tagesgeld" });
    expect(tg.textContent).toContain("Kalmbach");
    expect(tg.textContent).toMatch(/300,00/);
    // Voll gedeckt: keine Spalte „gedeckt", kein Satz, was fehlt.
    expect(within(tg).getAllByRole("columnheader")).toHaveLength(2);

    const spar = screen.getByRole("region", { name: "Sparkonto" });
    expect(spar.textContent).toContain("Rubrik Q");
    expect(within(spar).getAllByRole("columnheader").map((h) => h.textContent)).toContainEqual(expect.stringContaining(i18n.t("konten.belegung.spalteGedeckt")));
    // Es fehlen 200,00 — der Satz aus dem Kontoauszug.
    expect(spar.textContent).toMatch(/200,00/);
    expect(spar.textContent).toMatch(/33 %/);
  });

  it("nennt eine Rücklage ohne Konto und öffnet sie zum Bearbeiten", async () => {
    const nutzer = userEvent.setup();
    await bestand();
    rendere(<RuecklagenScreen />);

    const ohne = await screen.findByRole("region", { name: i18n.t("ruecklagen.geldJeKonto.ohneKontoTitel") });
    expect(ohne.textContent).toContain("Wendhausen");
    expect(ohne.textContent).toMatch(/40,00/);
    // Die mit Konto stehen dort nicht.
    expect(ohne.textContent).not.toContain("Kalmbach");
    expect(ohne.textContent).not.toContain("Rubrik Q");

    await nutzer.click(within(ohne).getByText("Wendhausen"));
    const dialog = await screen.findByRole("dialog");
    const [name] = within(dialog).getAllByRole("textbox");
    expect((name as HTMLInputElement).value).toBe("Wendhausen");
  });

  it("fehlt, wenn keine Rücklage etwas beansprucht und keine ohne Konto ist", async () => {
    await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 100000 });
    rendere(<RuecklagenScreen />);
    await screen.findByText(i18n.t("ruecklagen.mindestTitel"));
    expect(screen.queryByText(i18n.t("ruecklagen.geldJeKonto.titel"))).toBeNull();
  });
});
