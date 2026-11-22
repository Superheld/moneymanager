/** @vitest-environment jsdom */
// Die Befunde von der Oberfläche bis ins Schema.
//
// Geprüft werden die Aussagen, für die es die Auswertungen überhaupt gibt — nicht die
// Formulierungen: dass „fest" wirklich an der Vertragszuordnung hängt, dass eine Ausgabe
// ohne Vertrag, Budget und Rücklage unter „Ungeplant" erscheint (dieselbe Menge wie in der
// Übersicht, aufklappbar bis zur Buchung), und dass eine Erstattung die
// Ausgabe senkt statt sie zu erhöhen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import { sqliteRuecklagenRepository as ruecklagen } from "../../persistence/sqliteRuecklagenRepository";
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

/**
 * Warten, bis die Karte dieses Befunds gerendert ist — geklickt wird nichts mehr.
 *
 * `findAllByText`, weil ein Kartentitel und eine Spaltenüberschrift gleich heissen dürfen
 * („Empfänger"): dass ein Wort zweimal dasteht, ist hier kein Fehler, sondern der Beleg,
 * dass die Karte samt Tabelle da ist.
 */
async function block(name: string) {
  // Die Befunde stehen seit 2026-11-08 in einem eigenen Register der Analyse.
  fireEvent.click(await screen.findByRole("tab", { name: text("analyse.register.befunde") }));
  await screen.findAllByText(text(`befunde.block.${name}.name`));
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
    await block("fest");

    // Nur die Miete hängt an einem Vertrag; das Kino steht als frei daneben. Ohne die
    // Zuordnung wären beide frei — „gebunden" ist keine Eigenschaft des Betrags.
    await waitFor(() => expect(document.body.textContent).toMatch(/1\.200,00/));
    expect(document.body.textContent).toMatch(/20,00/);
  });

  // Der Fall, der ohne diese Sicht nie auffällt: wer auf seine Budgets schaut, sieht
  // ausschliesslich das, was er schon geplant hat.
  it("meldet eine Ausgabe ohne Vertrag, Budget und Rücklage als ungeplant", async () => {
    await grunddaten();
    await buchung("spontan", tag(0), -45600, { kategorieId: "kat-freizeit" });

    rendere(<AnalyseScreen />);
    await block("ungeplant");
    await waitFor(() => expect(document.body.textContent).toMatch(/456,00/));
  });

  // Die alte Rechnung (`blindeFlecken`) kannte keine Rücklagen: eine Ausgabe, die eine
  // Rücklage trug, stand hier als ungeplant, während die Übersicht sie als Entnahme
  // führte. Jetzt fragt die Karte die Einordnung, wie die Übersicht.
  it("lässt heraus, was eine Rücklage trägt — und klappt eine Kategorie bis zur Buchung auf", async () => {
    await grunddaten();
    await ruecklagen.speichern({
      id: "r1", bezeichnung: "Lindqvist", rate: 5000, beginn: tag(11), kategorieId: "kat-wohnen", findetAb: tag(11),
    } as never);
    await buchung("getragen", tag(1), -77700, { kategorieId: "kat-wohnen" });
    await buchung("offen", tag(1), -12300, { kategorieId: "kat-freizeit", notiz: "Hallström" });

    rendere(<AnalyseScreen />);
    await block("ungeplant");
    // Titel → Kopf → Kopfzeile → Karte; der Untertitel steht darin und belegt, dass es die richtige ist.
    const titel = (await screen.findAllByText(text("befunde.block.ungeplant.name"))).find(
      (el) => el.parentElement?.textContent?.includes(text("befunde.block.ungeplant.untertitel")),
    ) as HTMLElement;
    const karte = titel.parentElement!.parentElement!.parentElement as HTMLElement;
    await waitFor(() => expect(karte.textContent).toMatch(/123,00/));
    expect(karte.textContent).not.toMatch(/777,00/);
    expect(karte.textContent).not.toContain("Wohnen");

    // Zu: die Buchung steht noch nicht da. Auf: sie steht unter der Tabelle.
    expect(karte.textContent).not.toContain("Hallström");
    fireEvent.click(await within(karte).findByText("Freizeit"));
    await within(karte).findByText("Hallström");
  });

  // Die Rangliste greift auf den Empfänger zu; bei einer von Hand erfassten Buchung ist
  // das die Notiz. Ohne diesen Rückgriff fiele eine ganze Sorte Buchung heraus.
  it("führt Empfänger auch für von Hand erfasste Buchungen", async () => {
    await grunddaten();
    await buchung("a", tag(2), -1000, { kategorieId: "kat-freizeit", notiz: "Vibora" });
    await buchung("b", tag(1), -3000, { kategorieId: "kat-freizeit", notiz: "Vibora" });

    rendere(<AnalyseScreen />);
    await block("empfaenger");

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
    // Die Ausgaben-Kennzahl steht seit 2026-11-09 im Register Verlauf, dem ersten.
    await screen.findByRole("tab", { name: text("analyse.register.verlauf") });

    await waitFor(() => expect(document.body.textContent).toMatch(/150,00/));
    expect(document.body.textContent).not.toMatch(/250,00/);
  });
});
