/** @vitest-environment jsdom */
// „Reicht das Geld?" — die Liquiditätsvorschau im Ausblick der Analyse.
//
// Alle Werte erfunden. Zwei Dinge werden festgehalten:
//
// 1. Die ZWEI RÄNGE der Texte unter der Tabelle. Was „fest" und „erwartet" bedeuten, ist
//    eine ERKLÄRUNG und darf einklappen. Was es heisst, wenn ein Konto NICHT im Minus
//    steht, ist eine EINSCHRÄNKUNG dessen, was die Tabelle überhaupt behauptet — sie
//    steht offen und nie im selben Deckel. Die Zusicherung stand bis 2026-11-08 an der
//    Karte „Da ist etwas zu tun" der Übersicht und ist mit ihr gegangen; hier ist sie
//    wieder.
// 2. Die Farbe: amber nur an einer Zahl unter null, kein Grün an einem Tiefstand.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import type { Liquiditaetssicht } from "../../../application";
import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository } from "../../persistence/sqliteZahlungsregelRepository";
import { AnalyseScreen } from "./AnalyseScreen";
import { LiquiditaetKarte } from "./LiquiditaetKarte";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, string>) => i18n.t(schluessel, werte);

const sicht: Liquiditaetssicht = {
  bis: "2026-12-10",
  kurve: [],
  zeilen: [
    {
      kontoId: "k1", name: "Hauptkonto", start: 50000,
      fest: { tiefstand: -3000, tiefstandAm: "2026-09-20", minusAb: "2026-09-20" },
      erwartet: { tiefstand: -8000, tiefstandAm: "2026-09-28", minusAb: "2026-09-18" },
    },
    {
      kontoId: "k2", name: "Nebenkonto", start: 90000,
      fest: { tiefstand: 70000, tiefstandAm: "2026-10-01" },
      erwartet: { tiefstand: -1000, tiefstandAm: "2026-10-30", minusAb: "2026-10-29" },
    },
    {
      kontoId: "k3", name: "Kasse", start: 12000,
      fest: { tiefstand: 12000, tiefstandAm: "2026-09-11" },
      erwartet: { tiefstand: 12000, tiefstandAm: "2026-09-11" },
    },
  ],
};

async function zeile(name: string): Promise<HTMLElement> {
  return (await screen.findByText(name)).closest("tr") as HTMLElement;
}

describe("LiquiditaetKarte — was die Tabelle sagt", () => {
  it("nennt je Konto, auf welcher Linie es ins Minus geht — fest vor erwartet", async () => {
    rendere(<LiquiditaetKarte sicht={sicht} />);
    expect(within(await zeile("Hauptkonto")).getByText(t("blickNachVorn.reicht.fest"))).toBeInTheDocument();
    expect(within(await zeile("Nebenkonto")).getByText(t("blickNachVorn.reicht.erwartet"))).toBeInTheDocument();
    // Ein Konto ohne Minus bleibt stehen — die Tabelle ist keine Warnliste.
    const kasse = await zeile("Kasse");
    expect(within(kasse).queryByText(t("blickNachVorn.reicht.fest"))).toBeNull();
    expect(within(kasse).queryByText(t("blickNachVorn.reicht.erwartet"))).toBeNull();
  });

  it("färbt nur, was unter null fällt, und nichts grün", async () => {
    const { container } = rendere(<LiquiditaetKarte sicht={sicht} />);
    const kasse = await zeile("Kasse");
    expect(kasse.innerHTML).not.toMatch(/--warn/);
    expect((await zeile("Hauptkonto")).innerHTML).toMatch(/--warn-deep/);
    // Ein Tiefstand im Plus ist eine Höhe, keine gute Nachricht.
    expect(container.innerHTML).not.toMatch(/--ok/);
  });

  it("rendert ohne liquides Konto nichts, statt eine leere Prüfung zu behaupten", async () => {
    rendere(
      <>
        <span>da</span>
        <LiquiditaetKarte sicht={{ bis: "2026-12-10", zeilen: [], kurve: [] }} />
      </>,
    );
    await screen.findByText("da");
    expect(screen.queryByText(t("blickNachVorn.reicht.titel"))).toBeNull();
  });
});

describe("LiquiditaetKarte — die Kurve", () => {
  const tag = (datum: string, fest: number, erwartet: number, posten: { bezeichnung: string; betrag: number }[] = []) => ({
    datum, fest, erwartet, budgetanteil: fest === erwartet ? 0 : 500, posten,
  });
  const mitKurve: Liquiditaetssicht = {
    ...sicht,
    kurve: [
      tag("2026-09-11", 50000, 50000),
      tag("2026-09-12", 50000, 49500),
      tag("2026-09-13", -3000, -4000, [{ bezeichnung: "Ruhnau", betrag: -53000 }]),
    ],
  };

  it("zeigt erst die Aufforderung, dann zum gewählten Tag Stand und Posten", async () => {
    const nutzer = userEvent.setup();
    rendere(<LiquiditaetKarte sicht={mitKurve} />);
    await screen.findByText(t("blickNachVorn.reicht.kurveWaehlen"));
    expect(screen.queryByText("Ruhnau")).toBeNull();

    // Mit der Tastatur: der erste Pfeil wählt den ersten Tag, jeder weitere den nächsten.
    const kurve = screen.getByRole("group", { name: t("blickNachVorn.reicht.kurveName") });
    kurve.focus();
    await nutzer.keyboard("{ArrowRight}");
    expect(screen.getByText(t("blickNachVorn.reicht.kurveNichts"))).toBeInTheDocument();
    await nutzer.keyboard("{End}");
    const info = screen.getByTestId("kurventag");
    expect(within(info).getByText("Ruhnau")).toBeInTheDocument();
    expect(info.textContent).toMatch(/13\.09\./);
    expect(info.textContent).toMatch(/530,00/);
    // Unter null amber, an der Zahl — der Posten selbst ist ein Abfluss und trägt die Geldfarbe.
    expect(info.innerHTML).toMatch(/--warn-deep/);
    expect(info.textContent).toContain(t("blickNachVorn.reicht.kurveBudgets"));
  });

  it("zeichnet ohne Kurve nichts davon", async () => {
    rendere(<LiquiditaetKarte sicht={sicht} />);
    await zeile("Kasse");
    expect(screen.queryByText(t("blickNachVorn.reicht.kurveWaehlen"))).toBeNull();
  });
});

describe("LiquiditaetKarte — die zwei Ränge", () => {
  it("klappt die ERKLÄRUNG ein, hinter eine ausgeschriebene Frage", async () => {
    const { container } = rendere(<LiquiditaetKarte sicht={sicht} />);
    await zeile("Kasse");
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe(t("blickNachVorn.reicht.legendeFrage"));
    // Der Text ist da, nur zugeklappt — das ist der Unterschied zum Streichen.
    expect(details.textContent).toContain(t("blickNachVorn.reicht.legende"));
  });

  it("lässt die EINSCHRÄNKUNG offen stehen — nie im Deckel der Erklärung", async () => {
    const { container } = rendere(<LiquiditaetKarte sicht={sicht} />);
    await zeile("Kasse");
    const hinweis = Array.from(container.querySelectorAll("p.hinweis")).find((p) => !p.closest("details")) as HTMLElement;
    // Mit dem Tag, bis zu dem gerechnet wurde: ohne ihn hiesse „läuft nicht ins Minus" für immer.
    expect(hinweis.textContent).toMatch(/10\.12\.2026/);
    expect(hinweis.textContent).toBe(
      t("blickNachVorn.reicht.hinweis", { bis: hinweis.textContent?.match(/\d{2}\.\d{2}\.\d{4}/)?.[0] ?? "" }),
    );
  });
});

describe("Analyse — der Ausblick zeigt die Vorschau wieder", () => {
  it("steht als eigene Karte unter dem Blick nach vorn, mit dem Konto, das ins Minus läuft", async () => {
    await sqliteZahlungskontoRepository.speichern({ id: "k1", bezeichnung: "Hauptkonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
    await sqliteZahlungskontoRepository.speichern({ id: "k2", bezeichnung: "Reserve", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 400000 });
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Verschiedenes", defaultCharakter: "Aufwand" });
    // Ohne Buchung zeigt die Analyse ihren Leerzustand und keine Register.
    await sqliteLedgerRepository.speichern({ id: "b1", datum: "2026-01-05", betrag: -1000, kontoId: "k1", charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1" });
    // Eine Rate, die das Konto allein schon reisst — fällig in jedem Monat, also sicher im Fenster.
    await sqliteZahlungsregelRepository.speichern({
      id: "r1", bezeichnung: "Vibora", betrag: -150000, rhythmus: "monatlich", startdatum: "2020-01-15",
      charakter: "Aufwand", kontoId: "k1", kategorieId: "kat1",
    });

    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, i18n.t("analyse.register.ausblick"));

    const titel = await screen.findByText(t("blickNachVorn.reicht.titel"));
    // Keine Karte in der Karte: der Titel des Saldo-Ausblicks liegt in einer anderen.
    const karte = titel.parentElement?.parentElement?.parentElement as HTMLElement;
    expect(within(karte).queryByText(t("blickNachVorn.titel"))).toBeNull();

    const konto = within(karte).getByText("Hauptkonto").closest("tr") as HTMLElement;
    expect(within(konto).getByText(t("blickNachVorn.reicht.fest"))).toBeInTheDocument();
    // Das Rücklagenkonto ist nicht liquide und steht nicht in der Liste.
    expect(within(karte).queryByText("Reserve")).toBeNull();
  });
});
