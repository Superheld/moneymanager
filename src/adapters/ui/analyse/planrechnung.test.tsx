/** @vitest-environment jsdom */
// Das Register „Planrechnung" — von der Oberfläche bis ins Schema.
//
// Alle Werte erfunden. Festgehalten wird:
//
// 1. Oben die Summe über zwölf Monate mit den Stufen, darunter die zwölf Monate.
// 2. Verträge stehen anteilig: ein Quartalsvertrag mit einem Drittel in JEDEM Monat —
//    anders als in der Übersicht, die nach Fälligkeit zeigt.
// 3. Die Einschränkung (nur Geplantes, Verträge verteilt) steht offen da.
// 4. Ohne Plan gibt es keinen Reiter.

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
import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteBudgetRepository } from "../../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "../../persistence/sqliteStammdatenRepositories";
import { AnalyseScreen } from "./AnalyseScreen";
import { planzahlungSpeichern } from "../../../testwerkzeug/planzahlung";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte);

/** Der Erste des laufenden Monats als ISO — die Analyse rechnet mit der echten Uhr. */
function monatsErster(): string {
  const jetzt = new Date();
  return new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), 1)).toISOString().slice(0, 10);
}

/** Die Tabellenzeile, deren erste Zelle `name` ist. */
function zeile(wurzel: HTMLElement, name: string): HTMLElement {
  const z = Array.from(wurzel.querySelectorAll("tr")).find((tr) => tr.querySelector("td")?.textContent === name);
  if (!z) throw new Error(`keine Zeile ${name}`);
  return z as HTMLElement;
}

/** Die Karte um ihren Titel (Titel → Titelblock → Kopfzeile → Karte). */
async function karte(titel: string): Promise<HTMLElement> {
  const el = await screen.findByText(titel);
  return el.parentElement?.parentElement?.parentElement as HTMLElement;
}

async function bestand({ mitPlan }: { mitPlan: boolean }) {
  const ab = monatsErster();
  await sqliteZahlungskontoRepository.speichern({ id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
  await sqliteKategorieRepository.speichern({ id: "kat-a", name: "Verschiedenes", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "kat-e", name: "Eingang", defaultCharakter: "Ertrag" });
  // Gebucht und ungeplant: die Planrechnung zeigt es nicht.
  await sqliteLedgerRepository.speichern({ id: "b1", datum: ab, betrag: -4321, kontoId: "k1", kategorieId: "kat-a", charakter: "Aufwand", quelle: "manuell" });
  if (!mitPlan) return;
  // 90,00 je Quartal, 2000,00 Einnahmen und 500,00 Budget je Monat.
  await planzahlungSpeichern({ id: "r-q", bezeichnung: "Kesselmann", betrag: -9000, rhythmus: "quartalsweise", startdatum: ab, charakter: "Aufwand", kategorieId: "kat-a" });
  await planzahlungSpeichern({ id: "r-e", bezeichnung: "Ohlert", betrag: 200000, rhythmus: "monatlich", startdatum: ab, charakter: "Ertrag", kategorieId: "kat-e" });
  await sqliteBudgetRepository.speichern({ id: "bu1", kategorieId: "kat-a", kontoId: "k1", art: "monatlich", start: ab, betraege: [{ abMonat: ab.slice(0, 7), betrag: 50000 }] });
}

describe("Analyse — Register Planrechnung", () => {
  it("zeigt die Summe über zwölf Monate mit den Stufen und Verträge anteilig", async () => {
    await bestand({ mitPlan: true });
    const nutzer = userEvent.setup();
    rendere(<AnalyseScreen />);
    await registerWaehlen(nutzer, t("analyse.register.planrechnung"));

    const summe = await karte(t("planrechnung.summeTitel"));
    expect(zeile(summe, t("ergebnis.zeile.einnahmen")).textContent).toContain("24.000,00");
    // Viermal 90,00 im Jahr, gleich verteilt.
    expect(zeile(summe, t("ergebnis.zeile.fixkosten")).textContent).toContain("360,00");
    expect(zeile(summe, t("ergebnis.zeile.laufend")).textContent).toContain("6.000,00");
    expect(zeile(summe, t("ergebnis.stufe.ergebnis")).textContent).toContain("17.640,00");
    // Ungeplantes steht nicht da, und auch keine Zeile dafür.
    expect(within(summe).queryByText(t("ergebnis.zeile.ungeplant"))).toBeNull();
    // Ohne Rücklage und Vorsorge keine Zwischensumme, die das Ergebnis wiederholte.
    expect(within(summe).queryByText(t("ergebnis.stufe.nachAlltag"))).toBeNull();

    // Die Einschränkung steht offen da.
    const hinweis = within(summe).getByText(t("planrechnung.hinweis"));
    expect(hinweis.closest("details")).toBeNull();

    // Monat für Monat: zwölf Zeilen, in jeder ein Drittel des Quartalsbetrags.
    const monate = await karte(t("planrechnung.monateTitel"));
    const zeilen = Array.from(monate.querySelectorAll("tbody tr"));
    expect(zeilen).toHaveLength(12);
    for (const z of zeilen) expect(z.textContent).toContain("30,00");
  });

  it("hat ohne Plan keinen Reiter", async () => {
    await bestand({ mitPlan: false });
    rendere(<AnalyseScreen />);
    await waitFor(() => expect(screen.getByRole("tab", { name: t("analyse.register.verlauf") })).toBeInTheDocument());
    expect(screen.queryByRole("tab", { name: t("analyse.register.planrechnung") })).toBeNull();
  });
});
