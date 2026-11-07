/** @vitest-environment jsdom */
// Der Abruf-Dialog — was er fragt, bevor eine Banksitzung überhaupt beginnt.
//
// Geprüft wird ausdrücklich NICHT der Abruf selbst: der spricht mit einer Bank, und was
// er dabei tut, hängt an `application/fints` und ist dort geprüft. Hier geht es um das,
// was davor entschieden wird — und das ist mehr, als der Dialog aussieht:
//
//  • Ohne hinterlegten Zugang darf er gar nicht erst nach einer PIN fragen.
//  • Die Zugangswahl erscheint erst ab ZWEI Zugängen; bei einem wäre sie eine Frage mit
//    einer Antwortmöglichkeit.
//  • Der Zeitraum kennt eine Grenze, und die kommt aus dem gespeicherten Bankprofil —
//    ohne Anmeldung, allein aus dem, was die Bank beim letzten Mal über sich gesagt hat.
//
// Der dritte Punkt ist der eigentliche Grund für diese Datei. Bittet jemand um mehr, als
// die Bank vorhält, ist das KEIN Fehler: sie liefert schlicht weniger. Ohne den Satz
// daneben liest sich das Ergebnis wie ein vollständiger Abruf, und die fehlenden Monate
// fallen erst auf, wenn man sie sucht.
//
// Alle Werte sind erfunden, auch die Bankleitzahl (Bereich 999999xx — es gibt sie nicht).

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Bankprofil, Bankzugang } from "../../../application";
import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { AbrufDialog } from "./AbrufDialog";
import { sqliteBankzugangRepository } from "../../persistence/sqliteBankzugangRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Eine Bank, die 90 Tage vorhält — die knappere der beiden Angaben zählt hier nicht. */
const PROFIL_90_TAGE: Bankprofil = {
  standAm: "2026-08-20",
  tanVerfahren: [],
  vorfaelle: [{ segment: "HKKAZ", version: 7, speicherzeitraumTage: 90 }],
  kontoVorfaelle: {},
  nationaleFelderErlaubt: false,
};

function zugang(over: Partial<Bankzugang> = {}): Bankzugang {
  return {
    id: "z1",
    bezeichnung: "Kesselmann Bank",
    art: "fints",
    url: "https://fints.example/fints",
    blz: "99999901",
    benutzer: "10203040",
    ...over,
  };
}

/** Rendert den Dialog und wartet, bis der Einstellungs-Provider seine Kinder freigibt. */
async function oeffnen() {
  rendere(<AbrufDialog onClose={() => {}} onFertig={() => {}} />);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

describe("Abruf-Dialog", () => {
  it("fragt ohne hinterlegten Zugang gar nicht erst nach einer PIN", async () => {
    await oeffnen();
    // Ein PIN-Feld ohne Zugang wäre eine Sackgasse: man tippt etwas ein und der Knopf
    // tut nichts, weil `abrufen` ohne Zugang sofort zurückkehrt.
    await waitFor(() => expect(screen.queryByLabelText(/PIN/i)).toBeNull());
  });

  it("zeigt die Zugangswahl erst ab zwei Zugängen", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    await oeffnen();

    expect(await screen.findByLabelText(/PIN/i)).toBeTruthy();
    // Eine Auswahl mit einem Eintrag ist eine Frage ohne Antwortmöglichkeit.
    expect(screen.queryByRole("combobox", { name: "Bankzugang" })).toBeNull();
  });

  it("bietet bei zwei Zugängen beide an", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    await sqliteBankzugangRepository.speichern(zugang({ id: "z2", bezeichnung: "Ohlert Bank", blz: "99999902" }));
    await oeffnen();

    const wahl = await screen.findByRole("combobox", { name: "Bankzugang" });
    expect(wahl).toBeTruthy();
  });

  it("blendet ein freies Feld ein, wenn der Zeitraum eigen gewählt wird", async () => {
    await sqliteBankzugangRepository.speichern(zugang());
    const nutzer = userEvent.setup();
    await oeffnen();
    await screen.findByLabelText(/PIN/i);

    // Die festen Stufen decken die üblichen Fälle ab, aber nicht den, um den es beim
    // Ersetzen eines Dateibestands geht: dessen Zeitraum ist eine beliebige Zahl.
    expect(screen.queryByLabelText("Zeitraum in Tagen")).toBeNull();
    await auswahlWaehlen(nutzer, "Zeitraum", /eigener Zeitraum/i);

    expect(await screen.findByLabelText("Zeitraum in Tagen")).toBeTruthy();
  });

  /**
   * Der eigentliche Punkt: die Grenze steht im gespeicherten Profil und gilt OHNE
   * Anmeldung. Ein Zugang, der noch nie geprüft wurde, hat keins — dann steht dort nur
   * der allgemeine Hinweis, und das ist richtig: „unbekannt" ist nicht „unbegrenzt".
   */
  it("nennt die Grenze der Bank aus dem gespeicherten Profil", async () => {
    await sqliteBankzugangRepository.speichern(zugang({ profil: JSON.stringify(PROFIL_90_TAGE) }));
    await oeffnen();
    await screen.findByLabelText(/PIN/i);

    await waitFor(() => expect(document.body.textContent).toMatch(/90/));
  });

  it("sagt es, wenn der Wunsch über den Speicherzeitraum der Bank hinausgeht", async () => {
    await sqliteBankzugangRepository.speichern(zugang({ profil: JSON.stringify(PROFIL_90_TAGE) }));
    const nutzer = userEvent.setup();
    await oeffnen();
    await screen.findByLabelText(/PIN/i);

    // 360 Tage gewünscht, 90 vorhanden. Kein Fehler — eine Ansage. Ohne sie liest sich
    // das Ergebnis wie ein vollständiger Abruf.
    await auswahlWaehlen(nutzer, "Zeitraum", /360/);

    await waitFor(() => expect(document.body.textContent).toMatch(/mehr|weiter zurück|nur/i));
  });

  it("hält einen kaputten Profil-Eintrag aus, statt den Dialog zu zerlegen", async () => {
    // Das Profil ist serialisiertes JSON aus einer früheren Sitzung. Ist es beschädigt,
    // muss der Dialog trotzdem bedienbar bleiben — die Grenze ist dann eben unbekannt.
    await sqliteBankzugangRepository.speichern(zugang({ profil: "{kein json" }));
    await oeffnen();

    expect(await screen.findByLabelText(/PIN/i)).toBeTruthy();
  });
});
