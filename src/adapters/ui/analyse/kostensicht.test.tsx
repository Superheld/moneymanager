/** @vitest-environment jsdom */
// Die Kostensicht des Verlaufs — von der Oberfläche bis ins Schema.
//
// Alle Werte erfunden. Geprüft wird, was an der Sicht ENTSCHEIDUNG ist: die Frage ist
// eine eigene Wahl neben der Darstellung, Kosten stehen mit ihrer Rate da und nicht mit
// der Auszahlung, eine Quote wird nie grün, und die Einschränkung zu ausgebuchten
// Rücklagen steht genau dann offen da, wenn sie gilt.

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
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { AnalyseScreen } from "./AnalyseScreen";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Der 15. des Monats `zurueck` Monate vor heute — der Screen liest die Uhr selbst. */
function tag(zurueck: number): string {
  const heute = new Date();
  const d = new Date(heute.getFullYear(), heute.getMonth() - zurueck, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}

/**
 * Ein Haushalt mit genau einem bewegten Monat (dem Vormonat) und einer Rücklage, die
 * schon lange läuft: 2000 herein, 500 hinaus ohne Plan, 100 Rate.
 */
async function haushalt() {
  await sqliteZahlungskontoRepository.speichern({ id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000 });
  await sqliteKategorieRepository.speichern({ id: "lohn", name: "Lohn", defaultCharakter: "Ertrag" });
  await sqliteKategorieRepository.speichern({ id: "kat1", name: "Verschiedenes", defaultCharakter: "Aufwand" });
  await sqliteLedgerRepository.speichern({ id: "ein", datum: tag(1), betrag: 200000, kontoId: "k1", charakter: "Ertrag", quelle: "manuell", kategorieId: "lohn" });
  await sqliteLedgerRepository.speichern({ id: "aus", datum: tag(1), betrag: -50000, kontoId: "k1", charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1" });
  await sqliteRuecklagenRepository.speichern({ id: "rl", bezeichnung: "Ohlert", rate: 10000, beginn: tag(30) });
}

const t = (schluessel: string) => i18n.t(schluessel);

async function zurKostenfrage(nutzer: ReturnType<typeof userEvent.setup>) {
  rendere(<AnalyseScreen />);
  await nutzer.click(await screen.findByRole("button", { name: t("historie.frage.kosten") }));
  await screen.findByText(t("historie.kosten.kpiKosten"));
}

describe("Verlauf — die Frage nach den Kosten", () => {
  it("ist eine eigene Wahl und lässt die Ausgabensicht unberührt zurück", async () => {
    await haushalt();
    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);

    // Zuerst die Sicht von vorher, mit ihren Kennzahlen und der Monatswahl.
    const frage = await screen.findByRole("group", { name: t("historie.frageWahl") });
    expect(within(frage).getByRole("button", { name: t("historie.frage.ausgaben") })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(t("historie.kpiSaldo"))).toBeInTheDocument();

    await nutzer.click(within(frage).getByRole("button", { name: t("historie.frage.kosten") }));
    await screen.findByText(t("historie.kosten.kpiKosten"));
    // Die Kennzahlen der Auszahlungssicht sind weg — eine Zahl gehört in genau eine Sicht.
    expect(screen.queryByText(t("historie.kpiSaldo"))).toBeNull();
    // Einen Saldo bietet die Kostensicht nicht an.
    expect(screen.queryByRole("button", { name: t("historie.ansicht.saldo") })).toBeNull();

    await nutzer.click(screen.getByRole("button", { name: t("historie.frage.ausgaben") }));
    expect(await screen.findByText(t("historie.kpiSaldo"))).toBeInTheDocument();
  });

  it("stapelt die Kosten nach Art und nennt in der Legende nur, was vorkommt", async () => {
    await haushalt();
    await zurKostenfrage(userEvent.setup());

    const chart = screen.getByRole("img", { name: t("historie.kosten.diagrammName") });
    const vormonat = chart.querySelector(`g[data-monat="${tag(1).slice(0, 7)}"]`) as SVGGElement;
    // Ungeplantes und die Rate der Rücklage — zwei Teile, keine Fixkosten.
    expect([...vormonat.querySelectorAll("rect[data-art]")].map((r) => r.getAttribute("data-art"))).toEqual(["ungeplant", "abschreibungen"]);
    // Kein Teil mit kaputter Geometrie.
    for (const r of chart.querySelectorAll("rect[data-art]")) {
      expect(Number(r.getAttribute("height"))).toBeGreaterThan(0);
      expect(r.getAttribute("y")).not.toMatch(/NaN/);
    }

    const legende = chart.parentElement as HTMLElement;
    expect(within(legende).getByText(t("ergebnis.zeile.abschreibungen"))).toBeInTheDocument();
    expect(within(legende).getByText(t("ergebnis.zeile.einnahmen"))).toBeInTheDocument();
    expect(within(legende).queryByText(t("ergebnis.zeile.fixkosten"))).toBeNull();
  });

  it("zeigt in der Tabelle je Monat die Zeilen der Ergebnisrechnung — die Rücklage mit ihrer Rate", async () => {
    await haushalt();
    const nutzer = userEvent.setup();
    await zurKostenfrage(nutzer);
    await nutzer.click(screen.getByRole("button", { name: t("historie.kosten.ansicht.tabelle") }));

    const zeile = (await screen.findByText(tag(1).slice(0, 7))).closest("tr") as HTMLElement;
    const text = zeile.textContent ?? "";
    expect(text).toMatch(/2\.000,00/); // Einnahmen
    expect(text).toMatch(/500,00/); // Ungeplant
    expect(text).toMatch(/100,00/); // Rücklage: die Rate, obwohl nichts geflossen ist
    expect(text).toMatch(/\+1\.400,00/); // bleibt wirklich frei

    // Die Spalten heissen wie die Zeilen der Monatskarten — ein Wort je Sache.
    for (const id of ["fixkosten", "laufend", "ungeplant", "abschreibungen", "wagnisse", "vorsorge"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(t(`ergebnis.zeile.${id}`)) })).toBeInTheDocument();
    }
    // Der laufende Monat steht da und ist als solcher markiert.
    const laufend = screen.getByText(tag(0).slice(0, 7)).closest("tr") as HTMLElement;
    expect(within(laufend).getByText(t("ergebnis.pillLaufend"))).toBeInTheDocument();
  });

  it("rechnet die Quoten über die abgeschlossenen Monate und färbt sie nie grün", async () => {
    await haushalt();
    await zurKostenfrage(userEvent.setup());

    // Elf abgeschlossene Monate zu je 100 Rate gegen 2000 Einnahmen: 55 %.
    const sparquote = screen.getByText(t("historie.kosten.kpiSparquote")).parentElement as HTMLElement;
    await waitFor(() => expect(sparquote.textContent).toMatch(/55\s%/));
    expect(sparquote.innerHTML).not.toMatch(/--ok/);
    const fixquote = screen.getByText(t("historie.kosten.kpiFixkostenquote")).parentElement as HTMLElement;
    expect(fixquote.textContent).toMatch(/0\s%/);
    expect(fixquote.innerHTML).not.toMatch(/--ok/);
    // Dass der laufende Monat nicht mitzählt, ändert die Zahlen — also steht es da.
    expect(screen.getByText(t("historie.kosten.hinweisLaufend"))).toBeInTheDocument();
  });

  // Ein Vorbehalt, der immer dasteht, wird überlesen — auch in dem Monat, in dem er gilt.
  it("schweigt über ausgebuchte Rücklagen, solange keine ausgebucht ist", async () => {
    await haushalt();
    await zurKostenfrage(userEvent.setup());
    expect(screen.queryByText(t("historie.kosten.hinweisRuecklagen"))).toBeNull();
  });

  it("schreibt die Grenze nach einer Ausbuchung im Fenster offen dazu, nicht eingeklappt", async () => {
    await haushalt();
    await sqliteRuecklagenRepository.ausbuchungSpeichern({ id: "ab1", ruecklageId: "rl", datum: tag(0), betrag: 30000 });
    const nutzer = userEvent.setup();
    await zurKostenfrage(nutzer);

    const hinweis = screen.getByText(t("historie.kosten.hinweisRuecklagen"));
    expect(hinweis).toHaveClass("hinweis");
    // Eine Einschränkung liegt nie hinter einem Deckel.
    expect(hinweis.closest("details")).toBeNull();

    await nutzer.click(screen.getByRole("button", { name: t("historie.kosten.ansicht.tabelle") }));
    const vormonat = (await screen.findByText(tag(1).slice(0, 7))).closest("tr") as HTMLElement;
    expect(within(vormonat).getByText(t("historie.kosten.pillUnvollstaendig"))).toBeInTheDocument();
  });
});
