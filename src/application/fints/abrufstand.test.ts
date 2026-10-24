// Wann ein Zugang als veraltet gilt — die Regel hinter dem Hinweis in der Übersicht.
//
// Alle Werte sind erfunden, auch die Bankleitzahl (Bereich 999999xx — es gibt sie nicht).

import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../../core";
import { ABRUF_VERALTET_TAGE, abrufstandLaden } from "./abrufstand";
import type { Bankzugang } from "./abrufPort";
import type { Kontozuordnung } from "./bankzugangPort";

const HEUTE = "2026-10-24";

function zugang(id: string, bezeichnung: string): Bankzugang {
  return { id, bezeichnung, art: "fints", url: "https://fints.example/fints", blz: "99999901", benutzer: "u" };
}

function konto(id: string, aktiv?: boolean): Zahlungskonto {
  return { id, bezeichnung: id, typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0, aktiv } as Zahlungskonto;
}

function zuordnung(zugangId: string, kontoId: string, letzterAbrufBis?: string): Kontozuordnung {
  return { zugangId, schluessel: `${kontoId}|`, zahlungskontoId: kontoId, letzterAbrufBis };
}

function laden(zugaenge: Bankzugang[], zuordnungen: Kontozuordnung[], konten: Zahlungskonto[]) {
  return abrufstandLaden(HEUTE, {
    zugangRepo: { alle: async () => zugaenge, speichern: async () => {}, loeschen: async () => {} },
    zuordnungRepo: {
      alle: async () => zuordnungen,
      nachZugang: async (id) => zuordnungen.filter((z) => z.zugangId === id),
      speichern: async () => {},
      loeschen: async () => {},
    },
    kontoRepo: { alle: async () => konten, speichern: async () => {}, aktivSetzen: async () => {}, loeschen: async () => {} },
  });
}

describe("abrufstandLaden", () => {
  it("meldet einen Zugang erst ab der Schwelle als veraltet", async () => {
    const stand = await laden(
      [zugang("a", "Ohlert"), zugang("b", "Vibora")],
      [zuordnung("a", "k1", "2026-10-18"), zuordnung("b", "k2", "2026-10-17")],
      [konto("k1"), konto("k2")],
    );
    expect(ABRUF_VERALTET_TAGE).toBe(7);
    expect(stand.zugaenge.map((z) => [z.zugangId, z.veraltet])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("nimmt das am weitesten zurückliegende Konto eines Zugangs", async () => {
    const stand = await laden(
      [zugang("a", "Ohlert")],
      [zuordnung("a", "k1", "2026-10-23"), zuordnung("a", "k2", "2026-09-30")],
      [konto("k1"), konto("k2")],
    );
    expect(stand.zugaenge[0]).toMatchObject({ letzterAbrufBis: "2026-09-30", veraltet: true });
  });

  it("zählt ein nie abgerufenes Konto als veraltet, ohne Datum", async () => {
    const stand = await laden(
      [zugang("a", "Ohlert")],
      [zuordnung("a", "k1", "2026-10-23"), zuordnung("a", "k2")],
      [konto("k1"), konto("k2")],
    );
    expect(stand.zugaenge[0]).toMatchObject({ letzterAbrufBis: undefined, veraltet: true });
  });

  it("übergeht stillgelegte Konten — sonst bliebe die Warnung für immer stehen", async () => {
    const stand = await laden(
      [zugang("a", "Ohlert")],
      [zuordnung("a", "k1", "2026-10-23"), zuordnung("a", "k2", "2025-01-01")],
      [konto("k1"), konto("k2", false)],
    );
    expect(stand.zugaenge[0]).toMatchObject({ letzterAbrufBis: "2026-10-23", veraltet: false });
  });

  it("führt einen Zugang ohne aktives Konto nicht auf, zählt ihn aber als Zugang", async () => {
    const stand = await laden([zugang("a", "Ohlert")], [], []);
    expect(stand).toEqual({ hatZugang: true, zugaenge: [] });
  });
});
