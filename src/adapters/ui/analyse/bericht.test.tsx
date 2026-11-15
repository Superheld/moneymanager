/** @vitest-environment jsdom */
// Das Register „Bericht" — von der Oberfläche bis ins Schema.
//
// Alle Werte erfunden. Festgehalten wird:
//
// 1. Ohne Wahl steht der letzte abgeschlossene Monat da, mit dem Vormonat daneben.
// 2. Die drei Teile stehen untereinander, jeder in seiner Karte, nichts eingeklappt.
// 3. Die Einschränkungen stehen offen da, wenn sie treffen: fehlender Vergleich,
//    Vermögenswerte mit ihrem zuletzt eingetragenen Wert.
// 4. Ohne ganz erfasstes Jahr sagt das Register, ab wann es eines gibt.

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
import { auswahlWaehlen, frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { sqliteVermoegenRepository } from "../../persistence/sqliteVermoegenRepository";
import { AnalyseScreen } from "./AnalyseScreen";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte);

/** Ein Tag im Monat `n` Monate vor dem laufenden, als ISO — die Analyse rechnet mit der echten Uhr. */
function monatVorHeute(n: number, tag: number): string {
  const jetzt = new Date();
  return new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth() - n, tag)).toISOString().slice(0, 10);
}
/** Der Name des Monats, wie der Bericht ihn zeigt („Oktober 2026"). */
function monatsname(n: number): string {
  const iso = monatVorHeute(n, 1);
  return `${t(`ergebnis.monat.${Number(iso.slice(5, 7))}`)} ${iso.slice(0, 4)}`;
}

/**
 * Die Karte um ihren Titel — der Titel sitzt zwei Ebenen unter der Fläche. Derselbe Text
 * steht auch in der Wahl des Zeitraums und im Spaltenkopf; gemeint ist der Kartentitel.
 */
async function karte(titel: string): Promise<HTMLElement> {
  const kandidaten = await screen.findAllByText(titel);
  const el = kandidaten.find((k) => k.style.fontSize === "var(--fs-title)");
  if (!el) throw new Error(`keine Karte ${titel}`);
  return el.parentElement?.parentElement?.parentElement as HTMLElement;
}

/** Die Tabellenzeile, die mit `name` beginnt. */
function zeile(wurzel: HTMLElement, name: string): HTMLElement {
  const z = Array.from(wurzel.querySelectorAll("tr")).find((tr) => tr.querySelector("td")?.textContent === name);
  if (!z) throw new Error(`keine Zeile ${name}`);
  return z as HTMLElement;
}

async function bestand() {
  await sqliteZahlungskontoRepository.speichern({ id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
  await sqliteKategorieRepository.speichern({ id: "kat-aus", name: "Verschiedenes", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "kat-ein", name: "Eingang", defaultCharakter: "Ertrag" });
  // Drei abgeschlossene Monate; die erste Buchung am Ersten, damit der erste voll zählt.
  const buchungen = [
    { id: "b3", datum: monatVorHeute(3, 1), betrag: -20000, kategorieId: "kat-aus", charakter: "Aufwand" as const },
    { id: "b2", datum: monatVorHeute(2, 4), betrag: -30000, kategorieId: "kat-aus", charakter: "Aufwand" as const },
    { id: "b1", datum: monatVorHeute(1, 4), betrag: -25000, kategorieId: "kat-aus", charakter: "Aufwand" as const },
    { id: "e1", datum: monatVorHeute(1, 6), betrag: 150000, kategorieId: "kat-ein", charakter: "Ertrag" as const },
  ];
  for (const b of buchungen) await sqliteLedgerRepository.speichern({ ...b, kontoId: "k1", quelle: "manuell" });
  await sqliteVermoegenRepository.gegenstandSpeichern({ id: "g1", bezeichnung: "Ohlert", art: "sonstiges" });
  await sqliteVermoegenRepository.wertEintragen({ gegenstandId: "g1", stichtag: monatVorHeute(1, 10), wert: 400000 }, "2026-01-01T08:00:00.000Z");
}

describe("Analyse — Register Bericht", () => {
  it("zeigt den letzten abgeschlossenen Monat in drei Teilen, mit dem Vormonat daneben", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    const { container } = rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, t("analyse.register.bericht"));

    const ergebnis = await karte(monatsname(1));
    // Ergebnis: 1500 herein, 250 hinaus; der Vormonat stand bei −300.
    const frei = zeile(ergebnis, t("ergebnis.stufe.ergebnis"));
    expect(frei.textContent).toContain("1.250,00");
    expect(frei.textContent).toContain("300,00");
    expect(frei.textContent).toContain("1.550,00");
    expect(within(ergebnis).getByText(t("historie.kosten.kpiSparquote"))).toBeInTheDocument();
    expect(within(ergebnis).queryByText(t("bericht.ohneVergleich.monat"))).toBeNull();

    // Der Weg zum Konto endet bei der Änderung aller Kontostände.
    const weg = await karte(t("ergebnis.ueberleitung.titel"));
    expect(zeile(weg, t("ergebnis.ueberleitung.summe")).textContent).toContain("1.250,00");

    // Das Vermögen: der Vermögenswert kam im Monat dazu, und die Einschränkung steht offen.
    const vermoegen = await karte(t("vermoegen.nettoTitel"));
    expect(zeile(vermoegen, t("vermoegen.kpiVermoegenswerte")).textContent).toContain("4.000,00");
    expect(zeile(vermoegen, t("vermoegen.nettoTitel")).textContent).toContain("5.250,00");
    const hinweis = within(vermoegen).getByText(t("bericht.vermoegenHinweis"));
    expect(hinweis.closest("details")).toBeNull();

    // Ein Blatt: nichts davon liegt hinter einem Deckel, und keine Karte steckt in einer anderen.
    expect(container.querySelector("details")).toBeNull();
    expect(within(ergebnis).queryByText(t("ergebnis.ueberleitung.titel"))).toBeNull();
  });

  it("sagt beim ersten erfassten Monat, dass der Vergleich fehlt", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, t("analyse.register.bericht"));
    await karte(monatsname(1));

    await auswahlWaehlen(nutzer, t("bericht.art.monat"), monatsname(3));
    const ergebnis = await karte(monatsname(3));
    expect(within(ergebnis).getByText(t("bericht.ohneVergleich.monat"))).toBeInTheDocument();
    expect(within(ergebnis).queryByText(new RegExp(t("bericht.spalteVeraenderung")))).toBeNull();
  });

  it("sagt ohne ganz erfasstes Jahr, ab wann es einen Bericht darüber gibt", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, t("analyse.register.bericht"));
    await karte(monatsname(1));

    await nutzer.click(screen.getByRole("button", { name: t("bericht.art.jahr") }));
    expect(await screen.findByText(t("bericht.leer.jahr"))).toBeInTheDocument();
    expect(screen.queryByText(t("ergebnis.ueberleitung.titel"))).toBeNull();
  });
});
