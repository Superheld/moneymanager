/** @vitest-environment jsdom */
// Das zuletzt gewählte Konto überlebt den Wechsel in einen anderen Bereich.
//
// Der Bereich Konten ist der, in dem man sich aufhält: hinsehen, woanders etwas
// nachschlagen, zurückkommen. Bis 2026-09-22 stand danach wieder das erste Konto der
// Liste da — und wer das zweite führt, hat bei jedem Besuch denselben Klick gemacht.
//
// Gemerkt wird im BESTAND (`einstellung`), und der erste Versuch tat es in einem Modul-
// `let`. Das war billiger und hat prompt neun fremde Tests umgeworfen: der Harness kann so
// etwas nicht zurücksetzen, und jeder Test, der den Bereich zweimal aufbaut, erbte die
// Wahl des vorigen. Der Test hier fasst die Absicht — zweimal montieren, dazwischen nichts
// von Hand einstellen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KontenScreen } from "./KontenScreen";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Zwei Konten. Das zweite ist das interessante — beim ersten liesse sich nicht
 * unterscheiden, ob es gemerkt wurde oder ob es ohnehin oben steht.
 */
async function zweiKonten() {
  await kontoRepo.speichern({ id: "k1", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
  await kontoRepo.speichern({ id: "k2", bezeichnung: "Zweitkonto", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 0 });
}

/**
 * Welches Konto der Auszug darunter zeigt.
 *
 * Der Name steht dann ZWEIMAL auf der Seite: in der Kontoliste und über dem Auszug. Das
 * ist das Merkmal, an dem die Wahl von aussen sichtbar ist.
 */
function auszugZeigt(name: string): boolean {
  return screen.queryAllByText(name).length > 1;
}

/** Die Zeile in der Kontoliste — sie steht immer oben, auch wenn der Name zweimal dasteht. */
async function zeile(name: string): Promise<HTMLElement> {
  const treffer = await screen.findAllByText(name);
  return treffer[0];
}

describe("Die Kontoauswahl", () => {
  it("steht beim nächsten Besuch wieder auf dem zuletzt gewählten Konto", async () => {
    await zweiKonten();
    const nutzer = userEvent.setup();

    const erster = rendere(<KontenScreen onNavigate={() => {}} />);
    await zeile("Alltagskonto");
    expect(auszugZeigt("Alltagskonto")).toBe(true);

    await nutzer.click(await zeile("Zweitkonto"));
    expect(auszugZeigt("Zweitkonto")).toBe(true);

    // Woanders hin und zurück — im Test ist das ab- und wieder aufbauen.
    erster.unmount();
    rendere(<KontenScreen onNavigate={() => {}} />);

    await zeile("Zweitkonto");
    expect(auszugZeigt("Zweitkonto")).toBe(true);
  });

  it("fällt auf das erste Konto zurück, wenn das gemerkte nicht mehr da ist", async () => {
    await zweiKonten();
    const nutzer = userEvent.setup();

    const erster = rendere(<KontenScreen onNavigate={() => {}} />);
    await nutzer.click(await zeile("Zweitkonto"));
    erster.unmount();

    // Das gemerkte Konto gibt es nicht mehr — gelöscht, während man woanders war.
    await kontoRepo.loeschen("k2");
    rendere(<KontenScreen onNavigate={() => {}} />);

    await zeile("Alltagskonto");
    expect(auszugZeigt("Alltagskonto")).toBe(true);
  });
});
