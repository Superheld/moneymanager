/** @vitest-environment jsdom */
// Der Bereich Rücklagen seit Paket 4 (ADR-0006): EINE Liste für beide Sorten, der Verlauf
// je Rücklage und EIN Dialog. Von der Oberfläche bis ins Schema; alle Werte erfunden.

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

import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Der Monat (`YYYY-MM`), `n` Monate von heute versetzt — der Screen liest die Uhr selbst. */
function monatVersetzt(n: number): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Zwei Rücklagen:
 *  - „Tellwick" läuft weiter, seit zwei Monaten 100,00 im Monat auf dem Tagesgeld, an
 *    `kat-t`; im Vormonat hat sie eine Buchung über 30,00 getragen → Stand 270,00.
 *  - „Ombrast" wird abgeschlossen, Ziel 1.200,00 in 12 Monaten, ohne Konto, an `kat-o`.
 */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 500000 });
  await sqliteKategorieRepository.speichern({ id: "kat-t", name: "Werkstatt", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "kat-o", name: "Geraete", defaultCharakter: "Aufwand" });
  await sqliteRuecklagenRepository.speichern({ id: "r-t", bezeichnung: "Tellwick", kategorieId: "kat-t", kontoId: "tg", art: "fortlaufend", beginn: `${monatVersetzt(-2)}-01` });
  await sqliteRuecklagenRepository.rateSpeichern("r-t", { abMonat: monatVersetzt(-2), betrag: 10000 });
  await sqliteRuecklagenRepository.speichern({ id: "r-o", bezeichnung: "Ombrast", ziel: 120000, fristMonate: 12, kategorieId: "kat-o", art: "abschliessend", beginn: `${monatVersetzt(-3)}-01`, findetAb: `${monatVersetzt(-3)}-01` });
  await sqliteLedgerRepository.speichern({
    id: "i1", datum: `${monatVersetzt(-1)}-05`, betrag: -3000, kontoId: "tg",
    charakter: "Aufwand", quelle: "manuell", kategorieId: "kat-t", notiz: "Quelvin Ersatzteil",
  });
}

/** Der Block einer Rücklage in der Liste — von ihrem Namen aus (ab der zweiten trägt er die Trennlinie). */
async function eintrag(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole("button", { name: i18n.t("ruecklagen.verlaufAuf", { name }) });
  return (link.closest("[style*='padding-top']") as HTMLElement | null) ?? (link.parentElement!.parentElement!.parentElement as HTMLElement);
}

describe("Rücklagen — die eine Liste", () => {
  it("zeigt beide Sorten in EINER Liste, je mit Sorte, Kategorie, Rate, Stand und Konto", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    expect(await screen.findByText(i18n.t("ruecklagen.listeTitel"))).toBeInTheDocument();
    // Die beiden Karten von davor gibt es nicht mehr.
    expect(document.body.textContent).not.toMatch(/Von Hand ausgebucht|Über die Kategorie/);

    const weiter = await eintrag("Tellwick");
    expect(within(weiter).getByText(i18n.t("ruecklagen.sorte.fortlaufend"))).toBeInTheDocument();
    expect(weiter.textContent).toMatch(/Werkstatt/);
    expect(weiter.textContent).toMatch(/Tagesgeld/);
    expect(weiter.textContent).toMatch(/100,00/);
    // Stand: 3 × 100,00 − 30,00 — die Rate des laufenden Monats zählt mit.
    expect(weiter.textContent).toMatch(/270,00/);

    const abschluss = await eintrag("Ombrast");
    expect(within(abschluss).getByText(i18n.t("ruecklagen.sorte.abschliessend"))).toBeInTheDocument();
    expect(abschluss.textContent).toMatch(/Geraete/);
    // Ohne Konto: die Pille und der Satz in der zweiten Zeile.
    expect(within(abschluss).getByText(i18n.t("ruecklagen.pillNurRechnung"))).toBeInTheDocument();
    // Mit Ziel ein Fortschritt: drei Monate zu 100,00 gegen 1.200,00.
    expect(abschluss.textContent).toMatch(/300,00 \/ 1\.200,00/);
  });

  it("bietet das Abschliessen nur an einer an, die abgeschlossen wird — ohne Ausbuchen daneben", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    const weiter = await eintrag("Tellwick");
    const abschluss = await eintrag("Ombrast");
    expect(within(weiter).queryByRole("button", { name: i18n.t("ruecklagen.abschliessen") })).toBeNull();
    expect(within(weiter).queryByRole("button", { name: i18n.t("ruecklagen.ausbuchen") })).toBeNull();
    expect(within(abschluss).getByRole("button", { name: i18n.t("ruecklagen.abschliessen") })).toBeInTheDocument();
    // Mit Kategorie gibt es keine Buchungswahl mehr — das Ausbuchen bleibt dem Altbestand.
    expect(within(abschluss).queryByRole("button", { name: i18n.t("ruecklagen.ausbuchen") })).toBeNull();
  });

  it("zeigt einen Stand im Minus, statt ihn auf null zu klemmen", async () => {
    await bestand();
    await sqliteLedgerRepository.speichern({
      id: "i2", datum: `${monatVersetzt(0)}-01`, betrag: -50000, kontoId: "tg",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat-t",
    });
    rendere(<RuecklagenScreen />);
    const weiter = await eintrag("Tellwick");
    // 300,00 − 30,00 − 500,00 = −230,00.
    await waitFor(() => expect(weiter.textContent).toMatch(/−230,00/));
  });

  it("öffnet über den Namen den Verlauf, mit der Fortschreibung und den Buchungen des Monats", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    await nutzer.click(await screen.findByRole("button", { name: i18n.t("ruecklagen.verlaufAuf", { name: "Tellwick" }) }));
    expect(await screen.findByText(i18n.t("ruecklagen.verlaufTitel", { name: "Tellwick" }))).toBeInTheDocument();
    // Vorbelegt der laufende Monat: Übertrag 170,00, Rate +100,00, nichts entnommen.
    expect(document.body.textContent).toMatch(/Übertrag 170,00/);
    // Der Vormonat zeigt die Buchung, die sie getragen hat.
    await auswahlWaehlen(nutzer, i18n.t("ruecklagen.verlaufMonatWaehlen"), monatVersetzt(-1));
    expect(await screen.findByText(/Quelvin Ersatzteil/)).toBeInTheDocument();
    // Zweiter Klick auf den Namen schliesst ihn wieder.
    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.verlaufZu", { name: "Tellwick" }) }));
    await waitFor(() => expect(screen.queryByText(i18n.t("ruecklagen.verlaufTitel", { name: "Tellwick" }))).toBeNull());
  });
});

describe("Rücklagen — der eine Dialog", () => {
  it("zeigt die Sorte beim Bearbeiten nur an und führt die Raten als Reihe", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    const weiter = await eintrag("Tellwick");
    await nutzer.click(within(weiter).getByRole("button", { name: i18n.t("ruecklagen.bearbeiten") }));
    await screen.findByText(i18n.t("ruecklagen.modalBearbeiten"));
    // Keine Wahl der Sorte — sie steht fest.
    expect(screen.queryByRole("combobox", { name: i18n.t("ruecklagen.feldSorte") })).toBeNull();
    expect(screen.getByLabelText(i18n.t("ruecklagen.feldSorte")).textContent).toBe(i18n.t("ruecklagen.sorte.fortlaufend"));
    // Die Reihe der Raten, mit dem Monat, ab dem sie gilt.
    expect(screen.getByText(i18n.t("ruecklagen.ratenTitel"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("ruecklagen.rateAb", { monat: monatVersetzt(-2) }))).toBeInTheDocument();

    // Eine geänderte Rate gilt ab dem laufenden Monat; die Monate davor behalten ihre.
    const rate = screen.getByLabelText(/^Rate im Monat/);
    await nutzer.clear(rate);
    await nutzer.type(rate, "150");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));
    await waitFor(async () => {
      const r = (await sqliteRuecklagenRepository.alle()).find((x) => x.id === "r-t");
      expect(r?.raten).toEqual([
        { abMonat: monatVersetzt(-2), betrag: 10000 },
        { abMonat: monatVersetzt(0), betrag: 15000 },
      ]);
      expect(r?.art).toBe("fortlaufend");
    });
  });

  it("lässt einen Altfall ohne Kategorie stehen, verlangt sie aber beim Speichern", async () => {
    await sqliteRuecklagenRepository.speichern({ id: "r-alt", bezeichnung: "Quelvin", ziel: 60000, fristMonate: 12, beginn: "2026-01-01", art: "abschliessend" });
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    const alt = await eintrag("Quelvin");
    // In der Liste steht er, mit dem Hinweis, dass keine Kategorie da ist.
    expect(alt.textContent).toMatch(i18n.t("ruecklagen.ohneKategorie"));
    await nutzer.click(within(alt).getByRole("button", { name: i18n.t("ruecklagen.bearbeiten") }));
    expect(await screen.findByText(i18n.t("ruecklagen.kategorieNachtragen"))).toBeInTheDocument();
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));
    expect(await screen.findByText(i18n.t("fehler.ruecklage.kategorieFehlt"))).toBeInTheDocument();
    // Nichts geschrieben.
    expect((await sqliteRuecklagenRepository.alle())[0]).toMatchObject({ bezeichnung: "Quelvin", kategorieId: undefined });
  });
});
