// Szenario-Use-Cases. Wichtigste Zusicherung: die Zusatzposten landen in der getrennten
// Szenario-Schicht und nie im Plan — ein Szenario ist verwerfbar, der Plan nicht.

import { describe, expect, it } from "vitest";
import type { Szenario, Zahlungsregel } from "../core";
import type { SzenarioRepository } from "./ports";
import { szenarioAnlegen, szenarioPostenAnlegen, type SzenarioPostenEingabe } from "./szenarioAnlegen";
import { projektionLaden } from "./projektionLaden";

function memSzenarien() {
  const szenarien: Szenario[] = [];
  const posten: { szenarioId: string; regel: Zahlungsregel }[] = [];
  const repo: SzenarioRepository = {
    alle: async () => szenarien,
    speichern: async (s: Szenario) => {
      szenarien.push(s);
    },
    loeschen: async (id: string) => {
      const i = szenarien.findIndex((x) => x.id === id);
      if (i >= 0) szenarien.splice(i, 1);
    },
    postenSpeichern: async (szenarioId: string, regel: Zahlungsregel) => {
      posten.push({ szenarioId, regel });
    },
    posten: async (szenarioId: string) =>
      posten.filter((p) => p.szenarioId === szenarioId).map((p) => p.regel),
    postenLoeschen: async (id: string) => {
      const i = posten.findIndex((p) => p.regel.id === id);
      if (i >= 0) posten.splice(i, 1);
    },
  } as unknown as SzenarioRepository;
  return { repo, szenarien, posten };
}

const gueltig: SzenarioPostenEingabe = {
  bezeichnung: "Gehaltserhöhung",
  betrag: 20000,
  rhythmus: "monatlich",
  charakter: "Ertrag",
  startdatum: "2026-01-01",
};

describe("szenarioAnlegen", () => {
  it("legt ein Szenario mit getrimmtem Namen an", async () => {
    const { repo, szenarien } = memSzenarien();
    const s = await szenarioAnlegen(repo, "  Umzug  ");
    expect(s.name).toBe("Umzug");
    expect(szenarien).toHaveLength(1);
  });

  it("lehnt einen leeren Namen ab", async () => {
    const { repo } = memSzenarien();
    await expect(szenarioAnlegen(repo, "   ")).rejects.toThrow("name.fehlt");
  });
});

describe("szenarioPostenAnlegen", () => {
  it("hängt den Posten an das Szenario", async () => {
    const { repo, posten } = memSzenarien();
    const s = await szenarioAnlegen(repo, "Umzug");
    await szenarioPostenAnlegen(repo, s.id, gueltig);
    expect(posten).toHaveLength(1);
    expect(posten[0].szenarioId).toBe(s.id);
  });

  it("setzt das Vorzeichen aus dem Charakter — Ertrag positiv, Aufwand negativ", async () => {
    const { repo } = memSzenarien();
    const s = await szenarioAnlegen(repo, "Umzug");
    const ertrag = await szenarioPostenAnlegen(repo, s.id, gueltig);
    const aufwand = await szenarioPostenAnlegen(repo, s.id, {
      ...gueltig,
      bezeichnung: "Höhere Miete",
      charakter: "Aufwand",
    });
    expect(ertrag.betrag).toBe(20000);
    expect(aufwand.betrag).toBe(-20000);
  });

  it("verlangt Bezeichnung, positiven Betrag und gültiges Startdatum", async () => {
    const { repo } = memSzenarien();
    const s = await szenarioAnlegen(repo, "Umzug");
    await expect(szenarioPostenAnlegen(repo, s.id, { ...gueltig, bezeichnung: " " })).rejects.toThrow(
      "bezeichnung.fehlt",
    );
    await expect(szenarioPostenAnlegen(repo, s.id, { ...gueltig, betrag: 0 })).rejects.toThrow(
      "betrag.groesserNull",
    );
    await expect(
      szenarioPostenAnlegen(repo, s.id, { ...gueltig, startdatum: "2026-1-1" }),
    ).rejects.toThrow("startdatum.ungueltig");
  });
});

describe("projektionLaden", () => {
  it("reicht die geladenen Regeln an die Projektion des Kerns weiter", async () => {
    const regeln: Zahlungsregel[] = [
      {
        id: "z1",
        bezeichnung: "Miete",
        betrag: -90000,
        rhythmus: "monatlich",
        startdatum: "2026-01-01",
        charakter: "Aufwand",
      },
    ];
    const verlauf = await projektionLaden(
      { alle: async () => regeln, speichern: async () => {}, loeschen: async () => {} },
      { ab: "2026-01-01", monate: 3, startsaldo: 500000 },
    );
    expect(verlauf).toHaveLength(3);
    expect(verlauf[0].abfluss).toBe(-90000);
    // Startsaldo minus drei Mieten.
    expect(verlauf[2].saldo).toBe(500000 - 3 * 90000);
  });

  it("liefert bei leerem Regelbestand leere Monate statt zu scheitern", async () => {
    const verlauf = await projektionLaden(
      { alle: async () => [], speichern: async () => {}, loeschen: async () => {} },
      { ab: "2026-01-01", monate: 2, startsaldo: 1000 },
    );
    expect(verlauf).toHaveLength(2);
    expect(verlauf[0].netto).toBe(0);
    expect(verlauf[1].saldo).toBe(1000);
  });
});
