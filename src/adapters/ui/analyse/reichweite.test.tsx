/** @vitest-environment jsdom */
// „Wie lange reicht es ohne Einnahmen?" — die Reichweite im Ausblick der Analyse.
//
// Alle Werte erfunden. Festgehalten wird:
//
// 1. ZWEI Zahlen, ohne und mit dem Zurücklegen, jede mit den Kosten, gegen die sie steht.
// 2. Die ANNAHME (worüber gemittelt, was frei ist) ist eine Einschränkung: offen, nie in
//    einem `<details>`.
// 3. Keine Farbe — Monate sind ungerichtet, und eine Schwelle gibt es nicht.
// 4. Mit zu wenigen Monaten steht ein Satz da und keine Zahl.

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
import type { Reichweitensicht } from "../../../application";
import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { AnalyseScreen } from "./AnalyseScreen";
import { ReichweiteKarte } from "./ReichweiteKarte";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte);

/** Die Karte um ihren Titel — der Titel sitzt zwei Ebenen unter der Fläche. */
async function karte(): Promise<HTMLElement> {
  const titel = await screen.findByText(t("blickNachVorn.reichweite.titel"));
  return titel.parentElement?.parentElement?.parentElement as HTMLElement;
}

/**
 * Der offene Satz mit der Annahme, für `monate` gemittelte Monate. Der Betrag darin ist
 * formatiert und wird nicht nachgebaut: verglichen wird der Text um ihn herum.
 */
function annahme(wurzel: HTMLElement, monate: number): HTMLElement | undefined {
  const [vor, nach] = t("blickNachVorn.reichweite.hinweis", { count: monate, frei: "§" }).split("§");
  return Array.from(wurzel.querySelectorAll<HTMLElement>("p.hinweis")).find(
    (p) => !p.closest("details") && p.textContent!.startsWith(vor) && p.textContent!.endsWith(nach),
  );
}

const sicht: Reichweitensicht = {
  reichweite: { monate: 12, frei: 900000, grundkosten: 170000, alleKosten: 200000, ohneZuruecklegen: 5.2, mitZuruecklegen: 4.5 },
  mindestens: 3,
  ruecklagenUnvollstaendig: false,
};

describe("ReichweiteKarte — was sie sagt", () => {
  it("zeigt zwei Zahlen, jede unter ihrer Beschriftung", async () => {
    rendere(<ReichweiteKarte sicht={sicht} />);
    const k = await karte();
    const ohne = within(k).getByText(t("blickNachVorn.reichweite.ohneZuruecklegen")).parentElement as HTMLElement;
    const mit = within(k).getByText(t("blickNachVorn.reichweite.mitZuruecklegen")).parentElement as HTMLElement;
    expect(ohne.textContent).toMatch(/5,2/);
    expect(mit.textContent).toMatch(/4,5/);
    expect(ohne.textContent).toContain(t("blickNachVorn.reichweite.einheit", { count: 5.2 }));
  });

  it("lässt die Annahme offen stehen, mit der Zahl der Monate", async () => {
    const { container } = rendere(<ReichweiteKarte sicht={sicht} />);
    await karte();
    expect(container.querySelector("details")).toBeNull();
    expect(annahme(container, 12)).toBeDefined();
  });

  it("färbt nichts — weder grün noch amber", async () => {
    const { container } = rendere(<ReichweiteKarte sicht={sicht} />);
    await karte();
    expect(container.innerHTML).not.toMatch(/--ok|--warn/);
  });

  it("nennt die Grenze bei ausgebuchten Rücklagen nur, wenn sie trifft", async () => {
    const { unmount } = rendere(<ReichweiteKarte sicht={sicht} />);
    await karte();
    expect(screen.queryByText(t("blickNachVorn.reichweite.ruecklagen"))).toBeNull();
    unmount();
    rendere(<ReichweiteKarte sicht={{ ...sicht, ruecklagenUnvollstaendig: true }} />);
    expect(await screen.findByText(t("blickNachVorn.reichweite.ruecklagen"))).toBeInTheDocument();
  });

  it("sagt mit zu wenigen Monaten, ab wann es eine Aussage gibt, statt eine Zahl zu zeigen", async () => {
    rendere(<ReichweiteKarte sicht={{ reichweite: null, mindestens: 3, ruecklagenUnvollstaendig: false }} />);
    const k = await karte();
    expect(within(k).getByText(t("blickNachVorn.reichweite.zuWenig", { count: 3 }))).toBeInTheDocument();
    expect(within(k).queryByText(t("blickNachVorn.reichweite.ohneZuruecklegen"))).toBeNull();
  });
});

/** Der Erste des Monats `n` Monate vor dem laufenden, als ISO — die Analyse rechnet mit der echten Uhr. */
function monatVorHeute(n: number, tag: number): string {
  const jetzt = new Date();
  const d = new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth() - n, tag));
  return d.toISOString().slice(0, 10);
}

describe("Analyse — der Ausblick zeigt die Reichweite", () => {
  it("steht als eigene Karte im Ausblick und rechnet aus dem Bestand", async () => {
    await sqliteZahlungskontoRepository.speichern({ id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 600000 });
    await sqliteKategorieRepository.speichern({ id: "kat1", name: "Verschiedenes", defaultCharakter: "Aufwand" });
    // Drei abgeschlossene Monate, je 1000 ungeplant; die erste Buchung am Ersten, damit
    // der erste Monat voll zählt. Stand danach 3000 → drei Monate.
    for (const n of [1, 2, 3]) {
      await sqliteLedgerRepository.speichern({
        id: `b${n}`, datum: monatVorHeute(n, 1), betrag: -100000, kontoId: "k1", charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
      });
    }

    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, i18n.t("analyse.register.ausblick"));

    const k = await karte();
    // Keine Karte in der Karte: „Reicht das Geld?" liegt in einer anderen.
    expect(within(k).queryByText(t("blickNachVorn.reicht.titel"))).toBeNull();
    const ohne = within(k).getByText(t("blickNachVorn.reichweite.ohneZuruecklegen")).parentElement as HTMLElement;
    expect(within(ohne).getByText("3")).toBeInTheDocument();
    expect(annahme(k, 3)).toBeDefined();
  });
});
