/** @vitest-environment jsdom */
// Die beiden Export-Karten — geprüft wird, dass sie NICHT dasselbe tun.
//
// Der Fehler, gegen den dieser Test steht, ist nicht ein Absturz, sondern eine
// Verwechslung: ein Knopf, der einen Kontoauszug unter dem Namen `konfiguration-…`
// schreibt (oder umgekehrt), tut genau das, was die Trennung der beiden Exporte
// verhindern soll — und man sähe es der Oberfläche nicht an. Deshalb hängt die Zusicherung
// hier am DATEINAMEN, den der jeweilige Knopf auslöst, und nicht daran, dass etwas passiert.
//
// Die Texte kommen über ihre i18n-Schlüssel und nicht im Wortlaut (src/CLAUDE.md).

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

// Der Weg nach draussen ist ein Tauri-Kommando; im Test wird nur mitgeschrieben, mit
// welchem Dateinamen es gerufen wurde.
const geschrieben = vi.hoisted(() => ({ namen: [] as string[] }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (_kommando: string, args: { name: string }) => {
    geschrieben.namen.push(args.name);
    return `/irgendwo/export/${args.name}`;
  },
}));

import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { sqliteEinstellungenRepository } from "../../persistence/sqliteEinstellungenRepository";
import i18n from "../../../i18n/i18n";

let db: Database;

beforeAll(sqlLaden);
beforeEach(async () => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
  geschrieben.namen = [];
  // Das Register erscheint erst mit dem Experiment — ohne es gäbe es hier nichts zu sehen.
  await sqliteEinstellungenRepository.schreiben("experiment.export", "an");
});

async function registerOeffnen(nutzer: ReturnType<typeof userEvent.setup>) {
  await registerWaehlen(nutzer, i18n.t("einstellungen.export.titel"));
}

describe("Die beiden Export-Karten", () => {
  it("stehen nebeneinander im selben Register", async () => {
    // Der Unterschied wird sichtbar, weil beide da sind: eine Warnung neben dem Fall, in
    // dem sie nicht nötig ist, sagt mehr als eine Warnung allein.
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerOeffnen(nutzer);

    expect(await screen.findByText(i18n.t("einstellungen.export.konfiguration.hinweis"))).toBeInTheDocument();
    expect(await screen.findByText(i18n.t("einstellungen.export.bestand.warnung"))).toBeInTheDocument();
  });

  it("schreibt aus der Ordnungs-Karte eine konfiguration-Datei", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerOeffnen(nutzer);

    await nutzer.click(await screen.findByRole("button", { name: i18n.t("einstellungen.export.konfiguration.knopf") }));

    expect(geschrieben.namen).toHaveLength(1);
    expect(geschrieben.namen[0]).toMatch(/^konfiguration-/);
  });

  it("schreibt aus der Bestands-Karte eine bestand-Datei", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerOeffnen(nutzer);

    await nutzer.click(await screen.findByRole("button", { name: i18n.t("einstellungen.export.bestand.knopf") }));

    expect(geschrieben.namen).toHaveLength(1);
    expect(geschrieben.namen[0]).toMatch(/^bestand-/);
  });
});
