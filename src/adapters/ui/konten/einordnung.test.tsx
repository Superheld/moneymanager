/** @vitest-environment jsdom */
// Die Einordnung steht an der Zeile — und im Dialog steht, warum.
//
// Bis 2026-11-15 sah man im Kontoauszug die Kategorie einer Buchung, aber nicht, wie sie
// deshalb ZÄHLT: ob die Ergebnisrechnung der Übersicht sie als Fixkosten führt, als
// laufende Kosten, oder gar nicht, weil eine Rücklage sie trägt. Wer wissen
// wollte, warum eine grosse Ausgabe den Monat nicht belastet, hatte keine Stelle zum
// Nachsehen.
//
// Geprüft wird von der Oberfläche bis ins Schema, und gesucht über i18n-Schlüssel und
// selbst angelegte Namen. Die Sortierregel selbst gehört dem Kern; hier steht, dass sie
// an der Zeile und im Dialog ANKOMMT — und an beiden Stellen dasselbe sagt.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import i18n from "../../../i18n/i18n";
import { KontenScreen } from "./KontenScreen";
import { sqliteLedgerRepository as ledgerRepo } from "../../persistence/sqliteLedgerRepository";
import { sqliteBudgetRepository as budgetRepo } from "../../persistence/sqliteBudgetRepository";
import { sqliteRuecklagenRepository as ruecklagenRepo } from "../../persistence/sqliteRuecklagenRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../../persistence/sqliteStammdatenRepositories";
import { sqliteVertragRepository as vertragRepo } from "../../persistence/sqliteVertragRepository";
import { sqliteVertragszuordnungRepository as zuordnungRepo } from "../../persistence/sqliteVertragZuordnungRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Ein Konto, ein monatliches und ein aufbauendes Budget, ein Vertrag — und je eine
 * Buchung, die genau eine der Einordnungen trifft.
 */
async function bestand() {
  await kontoRepo.speichern({ id: "kt", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await kategorieRepo.speichern({ id: "kat-m", name: "Kesselraum", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-t", name: "Vorhaben Nordseite", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-frei", name: "Verschiedenes", defaultCharakter: "Aufwand" });
  await kategorieRepo.speichern({ id: "kat-ein", name: "Zuflüsse", defaultCharakter: "Ertrag" });
  await budgetRepo.speichern({
    id: "bu-m", kategorieId: "kat-m", kontoId: "kt", art: "monatlich", start: "2026-01-01",
    betraege: [{ abMonat: "2026-01", betrag: 20000 }],
  });
  // Läuft weiter — bis Migration 81 ein aufbauendes Budget; sein Name ist der der Kategorie.
  await ruecklagenRepo.speichern({
    id: "bu-t", bezeichnung: "Vorhaben Nordseite", kategorieId: "kat-t", kontoId: "kt", art: "fortlaufend", beginn: "2026-01-01",
  });
  await ruecklagenRepo.rateSpeichern("bu-t", { abMonat: "2026-01", betrag: 5000 });
  await vertragRepo.speichern({
    id: "v1", anbieter: "Halvern", beginn: "2026-01-01", status: "aktiv",
    verlaengerung: "automatisch", verlaengerungMonate: 1,
    mindestlaufzeitMonate: 1, kuendigungsfristMonate: 1,
  });

  const zeile = (id: string, notiz: string, rest: Record<string, unknown>) =>
    ledgerRepo.speichern({
      id, kontoId: "kt", datum: "2026-08-14", betrag: -4200,
      charakter: "Aufwand", quelle: "import", rohHash: `h-${id}`, notiz, ...rest,
    });
  await zeile("b-ein", "Eingang Vibora", { betrag: 180000, charakter: "Ertrag", kategorieId: "kat-ein" });
  await zeile("b-fix", "Abschlag Halvern", { kategorieId: "kat-m" });
  await zeile("b-lauf", "Besorgung Kesselmann", { kategorieId: "kat-m" });
  await zeile("b-topf", "Anzahlung Ohlert", { kategorieId: "kat-t" });
  await zeile("b-frei", "Einzelposten Dremmel", { kategorieId: "kat-frei" });
  await zuordnungRepo.speichern({ istbuchungId: "b-fix", vertragId: "v1", herkunft: "manuell" });
}

/** Die Tabellenzeile, in der ein selbst angelegter Name steht. */
async function zeileVon(name: string) {
  const zelle = await screen.findByText(name);
  const zeile = zelle.closest("tr");
  if (!zeile) throw new Error(`Keine Tabellenzeile um „${name}“`);
  return within(zeile);
}

const pille = (art: string, werte?: Record<string, string>) => i18n.t(`einordnung.pille.${art}`, werte);

describe("Einordnung im Kontoauszug", () => {
  it("zeigt an jeder Zeile, was sie kaufmännisch ist", async () => {
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);

    expect((await zeileVon("Eingang Vibora")).getByText(pille("einnahme"))).toBeInTheDocument();
    expect((await zeileVon("Besorgung Kesselmann")).getByText(pille("laufend"))).toBeInTheDocument();
    expect((await zeileVon("Einzelposten Dremmel")).getByText(pille("ungeplant"))).toBeInTheDocument();
    // Die Rücklage steht mit NAMEN da — „aus Budget" allein liesse offen, aus
    // welchem, und genau das will man an der Zeile wissen.
    expect(
      (await zeileVon("Anzahlung Ohlert")).getByText(pille("ruecklageBenannt", { budget: "Vorhaben Nordseite" })),
    ).toBeInTheDocument();
  });

  it("zählt die Vertragszahlung als Fixkosten, obwohl ihre Kategorie unter einem Budget liegt", async () => {
    // Dieselbe Kategorie, zwei Zeilen, zwei Einordnungen: der Vertrag geht dem Budget
    // vor. Das ist die Reihenfolge aus dem Kern, und an der Zeile muss sie ankommen —
    // sonst erklärte der Auszug eine andere Rechnung als die der Übersicht.
    await bestand();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const fix = await zeileVon("Abschlag Halvern");
    expect(fix.getByText(pille("fixkosten"))).toBeInTheDocument();
    expect(fix.queryByText(pille("laufend"))).not.toBeInTheDocument();
  });

  it("zeigt an einer aufgeteilten Buchung die verschiedenen Einordnungen ihrer Teile", async () => {
    await bestand();
    await ledgerRepo.speichern({
      id: "b-split", kontoId: "kt", datum: "2026-08-15", betrag: -9000,
      charakter: "Aufwand", quelle: "manuell", notiz: "Sammelposten Tarnow",
      aufteilungen: [
        { kategorieId: "kat-m", betrag: -5000 },
        { kategorieId: "kat-t", betrag: -4000 },
      ],
    });
    rendere(<KontenScreen onNavigate={() => {}} />);

    const zeile = await zeileVon("Sammelposten Tarnow");
    expect(zeile.getByText(pille("laufend"))).toBeInTheDocument();
    expect(zeile.getByText(pille("ruecklageBenannt", { budget: "Vorhaben Nordseite" }))).toBeInTheDocument();
  });

  it("nennt die Umbuchung genau EINMAL in der Zeile", async () => {
    // Die Kategorie-Spalte trug bis zur Einordnungsspalte selbst eine Pille „Umbuchung".
    // Beide nebeneinander wären dasselbe Wort zweimal.
    await bestand();
    await kontoRepo.speichern({ id: "kt2", bezeichnung: "Zweitkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 0 });
    await ledgerRepo.speichern({
      id: "u-ab", kontoId: "kt", datum: "2026-08-16", betrag: -30000, charakter: "Umschichtung",
      quelle: "manuell", notiz: "Übertrag Sommer", transferId: "t1", gegenkontoId: "kt2",
    });
    await ledgerRepo.speichern({
      id: "u-zu", kontoId: "kt2", datum: "2026-08-16", betrag: 30000, charakter: "Umschichtung",
      quelle: "manuell", notiz: "Übertrag Sommer", transferId: "t1", gegenkontoId: "kt",
    });
    rendere(<KontenScreen onNavigate={() => {}} />);

    const zeile = await zeileVon("Übertrag Sommer");
    expect(zeile.getAllByText(pille("umbuchung"))).toHaveLength(1);
  });
});

describe("Einordnung im Buchungsdialog", () => {
  /** Öffnet die Buchung über ihre Zeile und liefert den Einordnungs-Abschnitt. */
  async function einordnungImDialog(nutzer: ReturnType<typeof userEvent.setup>, name: string) {
    await nutzer.click(await screen.findByText(name));
    const dialog = await screen.findByRole("dialog");
    return within(await within(dialog).findByRole("group", { name: i18n.t("einordnung.titel") }));
  }

  it("sagt bei Fixkosten, welcher Vertrag der Grund ist", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const abschnitt = await einordnungImDialog(nutzer, "Abschlag Halvern");
    expect(abschnitt.getByText(i18n.t("einordnung.grund.fixkosten", { vertrag: "Halvern" }))).toBeInTheDocument();
  });

  it("erklärt bei der Entnahme aus einer Rücklage, die weiterläuft, dass sie den Monat nicht noch einmal kostet", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const abschnitt = await einordnungImDialog(nutzer, "Anzahlung Ohlert");
    expect(
      abschnitt.getByText(i18n.t("einordnung.grund.ruecklageBenannt", { budget: "Vorhaben Nordseite" })),
    ).toBeInTheDocument();
  });

  it("sagt bei einer ungeplanten Ausgabe, dass weder Vertrag noch Budget sie trägt", async () => {
    await bestand();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    const abschnitt = await einordnungImDialog(nutzer, "Einzelposten Dremmel");
    expect(abschnitt.getByText(i18n.t("einordnung.grund.ungeplant"))).toBeInTheDocument();
  });

  it("zeigt beim Anlegen einer neuen Buchung keinen Abschnitt — es gibt noch nichts einzuordnen", async () => {
    await bestand();
    // Anlegen geht nur auf einem Konto ohne Bankverbindung; `kt` ist eines.
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await screen.findByText("Abschlag Halvern");
    // Der Knopf trägt ein „+" vor seinem Text (`Button plus`) — verglichen wird der Rest.
    const text = i18n.t("konten.btnBuchung");
    await nutzer.click(
      await screen.findByRole("button", { name: (name) => name.replace("+", "").trim() === text }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("group", { name: i18n.t("einordnung.titel") })).not.toBeInTheDocument();
  });
});
