/** @vitest-environment jsdom */
// Die Rücklagenvorschläge — von der Oberfläche bis ins Schema.
//
// Bis 2026-11-16 standen sie im Bereich Budgets, mit einer Spalte „Art". Hier steht,
// dass sie jetzt im Bereich Rücklagen stehen, dass Übernehmen den Dialog vorbelegt
// öffnet, dass Verwerfen je Bereich wirkt und dass ein früher verworfener Vorschlag
// verworfen bleibt.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";
import i18n from "../../../i18n/i18n";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { BudgetsScreen } from "../budgets/BudgetsScreen";
import { sqliteBudgetRepository } from "../../persistence/sqliteBudgetRepository";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "../../persistence/sqliteImportRepositories";
import { sqliteEinstellungenRepository } from "../../persistence/sqliteEinstellungenRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const heute = new Date();
/** Monatsschlüssel `i` Monate vor heute — die Screens lesen die Uhr selbst. */
const monat = (i: number) => {
  const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

async function erfassen(id: string, datum: string, betrag: number, kategorieId: string, gegenpartei: string) {
  await sqliteLedgerRepository.speichern({
    id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId,
  });
  await sqliteUmsatzRepository.anlegen({
    id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum, betrag: -betrag,
    waehrung: "EUR", gegenpartei, verwendungszweck: "", rohHash: `h-${id}`,
    status: "verbucht", istbuchungId: id,
  });
}

/**
 * Zwei Hauptkategorien: „Dorvik" mit Einkäufen jeden Monat (ein Budget) und „Feldhaus"
 * mit zwei grossen Ausgaben im Jahr (eine Rücklage, 2 × 600 € über zwölf Monate →
 * 100 € im Monat). Die Unterkategorien tragen die Buchungen, wie im Bestand üblich.
 */
async function bestand() {
  await sqliteZahlungskontoRepository.speichern({
    id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
  });
  await sqliteKategorieRepository.speichern({ id: "dorvik", name: "Dorvik", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "dorvik-a", name: "Dorvik A", elternId: "dorvik", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "feldhaus", name: "Feldhaus", defaultCharakter: "Aufwand" });
  await sqliteKategorieRepository.speichern({ id: "feldhaus-a", name: "Feldhaus A", elternId: "feldhaus", defaultCharakter: "Aufwand" });
  const tage = ["03", "12", "25"];
  for (let i = 0; i < 12; i++) {
    const teile = [21850, 8740, 13110]; // zusammen 437,00 €, an wechselnden Tagen
    for (const [j, betrag] of teile.entries()) {
      await erfassen(`e-${i}-${j}`, `${monat(i)}-${tage[(i + j) % 3]}`, betrag, "dorvik-a", "Quessel");
    }
  }
  await erfassen("s-1", `${monat(10)}-08`, 60000, "feldhaus-a", "Tarnow");
  await erfassen("s-2", `${monat(4)}-08`, 60000, "feldhaus-a", "Tarnow");
}

/** Die Karte, deren Titel `titel` ist — der Titel sitzt drei Ebenen unter ihr. */
function karteMit(titel: HTMLElement): HTMLElement {
  return titel.parentElement!.parentElement!.parentElement!;
}

describe("Rücklagen — Vorschläge", () => {
  it("zeigt den Rücklagenvorschlag hier und den Budgetvorschlag nicht", async () => {
    await bestand();
    rendere(<RuecklagenScreen />);
    const karte = karteMit(await screen.findByText(i18n.t("ruecklagen.vorschlaege.titel")));
    expect(karte.textContent).toMatch("Feldhaus");
    expect(karte.textContent).not.toMatch("Dorvik");
    // Derselbe Betrag wie vor der Trennung, als er noch unter Budgets stand.
    expect(karte.textContent).toMatch("100,00");
    // Keine Schwankung: bei einer Rücklage ist der teure Monat der Zweck.
    expect(karte.textContent).not.toMatch(i18n.t("budgets.spalteSchwankung"));
    // Der leere Bereich zeigt auf die Vorschläge, wie bei den Budgets.
    expect(document.body.textContent).toMatch(i18n.t("ruecklagen.leerMitVorschlaegen"));
  });

  it("und umgekehrt: jede Kategorie steht in genau einer der beiden Karten", async () => {
    await bestand();
    const r = rendere(<RuecklagenScreen />);
    const rk = karteMit(await screen.findByText(i18n.t("ruecklagen.vorschlaege.titel")));
    const inRuecklagen = rk.textContent ?? "";
    r.unmount();
    rendere(<BudgetsScreen />);
    const bk = karteMit(await screen.findByText(i18n.t("budgets.vorschlaegeTitel")));
    const inBudgets = bk.textContent ?? "";
    for (const name of ["Dorvik", "Feldhaus"]) {
      expect([inRuecklagen.includes(name), inBudgets.includes(name)].filter(Boolean), name).toHaveLength(1);
    }
  });

  it("öffnet beim Übernehmen den Dialog vorbelegt und legt eine Rücklage an, die weiterläuft", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    await screen.findByText(i18n.t("ruecklagen.vorschlaege.titel"));

    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.vorschlaege.uebernehmen") }));
    await screen.findByText(i18n.t("ruecklagen.modalAnlegen"));
    // Vorbelegt: Name und Rate aus dem Vorschlag, Sorte „läuft weiter".
    expect(screen.getByDisplayValue("Feldhaus")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(i18n.t("ruecklagen.sorte.fortlaufend"));

    const alle = screen.getAllByRole("button", { name: /speichern/i });
    await nutzer.click(alle[alle.length - 1]);
    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r).toMatchObject({ bezeichnung: "Feldhaus", kategorieId: "feldhaus", art: "fortlaufend" });
      expect(r?.raten?.map((x) => x.betrag)).toEqual([10000]);
    });
    // Ein Budget entsteht dabei nicht, und der Vorschlag ist weg.
    expect(await sqliteBudgetRepository.alle()).toEqual([]);
    await waitFor(() => expect(screen.queryByText(i18n.t("ruecklagen.vorschlaege.titel"))).not.toBeInTheDocument());
  });

  it("merkt sich ein Verwerfen nur für diesen Bereich", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    const erste = rendere(<RuecklagenScreen />);
    await screen.findByText(i18n.t("ruecklagen.vorschlaege.titel"));
    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.vorschlaege.verwerfen") }));
    await waitFor(() => expect(screen.queryByText(i18n.t("ruecklagen.vorschlaege.titel"))).not.toBeInTheDocument());
    // Geschrieben wurde der eigene Schlüssel, nicht der der Budgets.
    const kv = await sqliteEinstellungenRepository.lesen();
    expect(JSON.parse(kv["ruecklagenvorschlag.ignoriert"])).toEqual(["feldhaus"]);
    expect(kv["budgetvorschlag.ignoriert"]).toBeUndefined();

    // Nach einem Neustart bleibt er weg …
    erste.unmount();
    const zweite = rendere(<RuecklagenScreen />);
    // Die Erklärung des leeren Bereichs steht erst nach dem Laden — im selben Zug wie
    // die Vorschläge (`laden` setzt beides zusammen).
    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("ruecklagen.leerErklaerung")));
    expect(screen.queryByText(i18n.t("ruecklagen.vorschlaege.titel"))).not.toBeInTheDocument();
    zweite.unmount();

    // … und der Bereich Budgets schlägt seinen Vorschlag unverändert vor.
    rendere(<BudgetsScreen />);
    expect(await screen.findByText("Dorvik")).toBeInTheDocument();
  });

  /**
   * Vor der Trennung verwarf man eine Rücklage über „kein Budget", und das stand im
   * Schlüssel der Budgets. Ohne Migration: der Bereich Rücklagen liest ihn mit.
   */
  it("lässt einen schon früher im Bereich Budgets verworfenen Vorschlag weg", async () => {
    await bestand();
    await sqliteEinstellungenRepository.schreiben("budgetvorschlag.ignoriert", JSON.stringify(["feldhaus"]));
    rendere(<RuecklagenScreen />);
    // Nach dem Laden (siehe oben) — und dann steht die Karte gar nicht da.
    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("ruecklagen.leerErklaerung")));
    expect(screen.queryByText(i18n.t("ruecklagen.vorschlaege.titel"))).not.toBeInTheDocument();
  });
});
