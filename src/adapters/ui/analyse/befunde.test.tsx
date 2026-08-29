/** @vitest-environment jsdom */
// Die Befunde von der Oberfläche bis ins Schema.
//
// Geprüft werden die Aussagen, für die es die Auswertungen überhaupt gibt — nicht die
// Formulierungen: dass „fest" wirklich an der Vertragszuordnung hängt, dass eine Ausgabe
// ohne Budget und ohne Vertrag als blinder Fleck erscheint, und dass eine Erstattung die
// Ausgabe senkt statt sie zu erhöhen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import i18n from "../../../i18n/i18n";
import { AnalyseScreen } from "./AnalyseScreen";
import { sqliteLedgerRepository as ledger } from "../../persistence/sqliteLedgerRepository";
import { sqliteVertragRepository as vertraege } from "../../persistence/sqliteVertragRepository";
import { sqliteVertragszuordnungRepository as zuordnungen } from "../../persistence/sqliteVertragZuordnungRepositories";
import {
  sqliteKategorieRepository as kategorien,
  sqliteZahlungskontoRepository as konten,
} from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Der Fünfzehnte eines Monats, `rueck` Monate zurück — sicher im 12-Monats-Fenster. */
function tag(rueck: number): string {
  const heute = new Date();
  const d = new Date(heute.getFullYear(), heute.getMonth() - rueck, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}

const text = (schluessel: string) => i18n.t(schluessel);

async function grunddaten() {
  await konten.speichern({
    id: "k1", bezeichnung: "Gemeinschaftskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 200000,
  });
  await kategorien.speichern({ id: "kat-wohnen", name: "Wohnen", defaultCharakter: "Aufwand" });
  await kategorien.speichern({ id: "kat-freizeit", name: "Freizeit", defaultCharakter: "Aufwand" });
}

async function buchung(id: string, datum: string, betrag: number, extra: Record<string, unknown> = {}) {
  await ledger.speichern({
    id, datum, betrag, kontoId: "k1",
    charakter: betrag > 0 ? "Ertrag" : "Aufwand",
    quelle: "manuell",
    ...extra,
  } as never);
}

async function lupeOeffnen(name: string) {
  const nutzer = userEvent.setup();
  await nutzer.click(await screen.findByText(text(`befunde.lupe.${name}.name`)));
}

describe("Befunde im Analyse-Bereich", () => {
  it("trennt gebundene von freien Ausgaben anhand der Vertragszuordnung", async () => {
    await grunddaten();
    await buchung("lohn", tag(1), 300000);
    await buchung("miete", tag(1), -120000, { kategorieId: "kat-wohnen" });
    await buchung("kino", tag(1), -2000, { kategorieId: "kat-freizeit" });

    await vertraege.speichern({
      id: "v1", anbieter: "Kesselmann", beginn: tag(6), verlaengerung: "automatisch", status: "aktiv",
    } as never);
    await zuordnungen.speichern({ istbuchungId: "miete", vertragId: "v1", herkunft: "manuell" } as never);

    rendere(<AnalyseScreen />);
    await lupeOeffnen("fest");

    // Nur die Miete hängt an einem Vertrag; das Kino steht als frei daneben. Ohne die
    // Zuordnung wären beide frei — „gebunden" ist keine Eigenschaft des Betrags.
    await waitFor(() => expect(document.body.textContent).toMatch(/1\.200,00/));
    expect(document.body.textContent).toMatch(/20,00/);
  });

  // Der Fall, der ohne diese Sicht nie auffällt: wer auf seine Budgets schaut, sieht
  // ausschliesslich das, was er schon geplant hat.
  it("meldet eine Ausgabe ohne Budget und ohne Vertrag als blinden Fleck", async () => {
    await grunddaten();
    await buchung("spontan", tag(0), -45600, { kategorieId: "kat-freizeit" });

    rendere(<AnalyseScreen />);
    await lupeOeffnen("budgets");

    await screen.findByText(text("befunde.blindTitel"));
    await waitFor(() => expect(document.body.textContent).toMatch(/456,00/));
  });

  // Die Rangliste greift auf den Empfänger zu; bei einer von Hand erfassten Buchung ist
  // das die Notiz. Ohne diesen Rückgriff fiele eine ganze Sorte Buchung heraus.
  it("führt Empfänger auch für von Hand erfasste Buchungen", async () => {
    await grunddaten();
    await buchung("a", tag(2), -1000, { kategorieId: "kat-freizeit", notiz: "Vibora" });
    await buchung("b", tag(1), -3000, { kategorieId: "kat-freizeit", notiz: "Vibora" });

    rendere(<AnalyseScreen />);
    await lupeOeffnen("empfaenger");

    await screen.findByText("Vibora");
    // Zwei Posten in zwei verschiedenen Monaten — erst beide Zahlen zusammen trennen das
    // Abo vom Einkauf, der zufällig oft passiert.
    await waitFor(() => expect(document.body.textContent).toMatch(/40,00/));
  });

  // Die Vorzeichen-Regel des Kerns, hier bis in die Anzeige: mit Math.abs stünden 250
  // statt 150 da, und aus „es kam Geld zurück" würde „es wurde mehr ausgegeben".
  it("lässt eine Erstattung die Ausgabe senken", async () => {
    await grunddaten();
    await buchung("kauf", tag(1), -20000, { kategorieId: "kat-freizeit" });
    await buchung("retoure", tag(1), 5000, { kategorieId: "kat-freizeit", charakter: "Aufwand" });

    rendere(<AnalyseScreen />);
    await lupeOeffnen("kategorien");

    await waitFor(() => expect(document.body.textContent).toMatch(/150,00/));
    expect(document.body.textContent).not.toMatch(/250,00/);
  });
});
