/** @vitest-environment jsdom */
// „Prüfen" an einem Bankzugang — der Weg, den `bankzugaengeScreen.test.tsx` ausspart, weil er
// sich an der Bank anmeldet. Hier steht an der Stelle der Bank eine Attrappe des
// Abrufadapters: geprüft wird nicht das Protokoll (das steckt in `application/fints`), sondern
// was die Oberfläche mit dem Ergebnis tut — Konten zeigen, einen abgelehnten Saldo
// aushalten, das Profil speichern, einen Fehler im Dialog melden.
//
// Alle Werte sind erfunden; die Bankleitzahl liegt im Bereich 999999xx.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

/** Was die Attrappe beim Anmelden tut — je Test gesetzt. */
const anmelden = vi.hoisted(() => ({ aktuell: null as null | ((geheim: string) => Promise<unknown>) }));
vi.mock("../../dienste", async (original) => {
  const echt = await original<typeof import("../../dienste")>();
  return {
    ...echt,
    abrufAdapterFuer: () => ({ anmelden: (_z: unknown, geheim: string) => anmelden.aktuell!(geheim) }),
  };
});

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { BankzugaengeScreen } from "./BankzugaengeScreen";
import { sqliteBankzugangRepository } from "../../persistence/sqliteBankzugangRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const ZUGANG = {
  id: "z1", bezeichnung: "Ohlert Bank", art: "fints" as const, url: "https://fints.example/fints",
  blz: "99999902", benutzer: "40302010",
};

const PROFIL = { standAm: "2026-11-10", tanVerfahren: [], vorfaelle: [], kontoVorfaelle: {}, nationaleFelderErlaubt: false };

function sitzung() {
  return {
    // Die Bankparameter sind ein serialisierter Text (so speichert sie der Zugang).
    bankparameter: () => "{}",
    profil: PROFIL,
    konten: [
      { nummer: "111", schluessel: "111", bezeichnung: "Girokonto Ohlert", waehrung: "EUR" },
      { nummer: "222", schluessel: "222", bezeichnung: "Tagesgeld Ohlert", waehrung: "EUR" },
    ],
    // Das zweite Konto lehnt den Saldo ab — die Anzeige darf daran nicht kippen.
    saldo: async (k: { nummer: string }) => {
      if (k.nummer === "222") throw new Error("Saldo nicht freigegeben");
      return { betrag: 123456 };
    },
    hinweise: [],
    bankNachrichten: [],
    tanVerfahren: "Bildfreigabe",
  };
}

async function pruefenMit(pin: string) {
  const nutzer = userEvent.setup();
  rendere(<BankzugaengeScreen />);
  await nutzer.click(await screen.findByRole("button", { name: i18n.t("bankzugaenge.pruefen") }));
  const dialog = within(await screen.findByRole("dialog"));
  await nutzer.type(dialog.getByLabelText(new RegExp(i18n.t("bankabruf.feldPin"))), pin);
  await nutzer.click(dialog.getByRole("button", { name: i18n.t("bankzugaenge.pruefen") }));
  return nutzer;
}

describe("Bankzugang prüfen", () => {
  it("zeigt die Konten der Bank, auch wenn ein Saldo abgelehnt wird, und speichert das Profil", async () => {
    await sqliteBankzugangRepository.speichern(ZUGANG);
    const pins: string[] = [];
    anmelden.aktuell = async (geheim) => { pins.push(geheim); return sitzung(); };

    await pruefenMit("1234");

    expect(await screen.findByText("Girokonto Ohlert")).toBeInTheDocument();
    expect(screen.getByText("Tagesgeld Ohlert")).toBeInTheDocument();
    expect(pins).toEqual(["1234"]);
    // Der Dialog ist zu, die PIN ist weg.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [z] = await sqliteBankzugangRepository.alle();
    expect(JSON.parse(z.profil!)).toEqual(PROFIL);
  });

  it("meldet eine abgelehnte Anmeldung im Dialog und lässt ihn offen", async () => {
    await sqliteBankzugangRepository.speichern(ZUGANG);
    anmelden.aktuell = async () => { throw new Error("PIN falsch"); };

    await pruefenMit("0000");

    expect(await screen.findByText("PIN falsch")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
