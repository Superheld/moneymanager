import { describe, expect, it } from "vitest";
import type { IstBuchung, Vertrag } from "../core";
import type { Umsatz } from "./import/umsatz";
import type {
  EinstellungenRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
} from "./ports";
import {
  ignorierteSchluessel,
  ignorierteZuruecksetzen,
  vertragsvorschlaege,
  vorschlagIgnorieren,
} from "./vertragsvorschlaege";

const HEUTE = "2026-08-16";

/** Zwölf monatliche Abbuchungen samt zugehörigen Umsätzen. */
function monatsreihe(
  praefix: string,
  gegenpartei: string,
  betrag: number,
  opts: { n?: number; bis?: string; glaeubigerId?: string } = {},
): { buchungen: IstBuchung[]; umsaetze: Umsatz[] } {
  const bis = Date.parse(opts.bis ?? HEUTE);
  const buchungen: IstBuchung[] = [];
  const umsaetze: Umsatz[] = [];
  for (let i = 0; i < (opts.n ?? 12); i++) {
    const id = `${praefix}-${i}`;
    buchungen.push({
      id,
      datum: new Date(bis - i * 30 * 86_400_000).toISOString().slice(0, 10),
      betrag: -betrag,
      kontoId: "k1",
      charakter: "Aufwand",
      quelle: "import",
    });
    umsaetze.push({
      id: `u-${id}`,
      laufId: "l1",
      zahlungskontoId: "k1",
      buchungstag: buchungen[i].datum,
      betrag: -betrag,
      waehrung: "EUR",
      gegenpartei,
      verwendungszweck: "",
      glaeubigerId: opts.glaeubigerId,
      rohHash: `h-${id}`,
      status: "verbucht",
      istbuchungId: id,
    });
  }
  return { buchungen, umsaetze };
}

function fakes(buchungen: IstBuchung[], umsaetze: Umsatz[], vertraege: Vertrag[] = []) {
  const ledger = { async alle() { return buchungen; } } as LedgerPort;
  const umsatzRepo = { async alle() { return umsaetze; } } as UmsatzRepository;
  const vertragRepo = { async alle() { return vertraege; } } as VertragRepository;
  return { ledger, umsatzRepo, vertragRepo };
}

function vertrag(anbieter: string): Vertrag {
  return { id: `v-${anbieter}`, anbieter, beginn: "2025-01-01", verlaengerung: "automatisch", status: "aktiv" };
}

describe("vertragsvorschlaege", () => {
  it("verbindet Buchung und Umsatz über istbuchungId", async () => {
    const { buchungen, umsaetze } = monatsreihe("a", "[anonymisiert] GmbH", 1650, { glaeubigerId: "[anonymisiert]" });
    const { ledger, umsatzRepo, vertragRepo } = fakes(buchungen, umsaetze);

    const k = await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].anbieter).toBe("[anonymisiert] GmbH");
    expect(k[0].glaeubigerId).toBe("[anonymisiert]");
    expect(k[0].betrag).toBe(1650);
  });

  /**
   * Ohne diesen Join wäre jede Gegenpartei leer und die Erkennung fände nichts: der
   * Empfänger steht am Umsatz, nicht an der Buchung (Import-Kontext, CLAUDE.md).
   */
  it("findet nichts, wenn zu den Buchungen keine Umsätze gehören", async () => {
    const { buchungen } = monatsreihe("a", "[anonymisiert]", 1650);
    const { ledger, umsatzRepo, vertragRepo } = fakes(buchungen, []);
    expect(await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE)).toEqual([]);
  });

  it("blendet aus, was schon als Vertrag erfasst ist", async () => {
    const a = monatsreihe("a", "[anonymisiert] GmbH", 1650);
    const b = monatsreihe("b", "Octopus Energy", 5135);
    const { ledger, umsatzRepo, vertragRepo } = fakes(
      [...a.buchungen, ...b.buchungen],
      [...a.umsaetze, ...b.umsaetze],
      // Schreibweise bewusst anders als im Auszug — der Abgleich läuft normalisiert.
      [vertrag("netcup")],
    );

    const k = await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE);
    expect(k.map((x) => x.anbieter)).toEqual(["Octopus Energy"]);
  });

  it("blendet weggeklickte Vorschläge aus", async () => {
    const a = monatsreihe("a", "[anonymisiert] GmbH", 1650);
    const b = monatsreihe("b", "Octopus Energy", 5135);
    const { ledger, umsatzRepo, vertragRepo } = fakes(
      [...a.buchungen, ...b.buchungen],
      [...a.umsaetze, ...b.umsaetze],
    );

    const alle = await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE);
    expect(alle).toHaveLength(2);
    const uebrig = await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE, {
      ignoriert: new Set([alle[0].schluessel]),
    });
    expect(uebrig.map((k) => k.anbieter)).toEqual([alle[1].anbieter]);
  });

  it("merkt sich weggeklickte Vorschläge über die Einstellungen", async () => {
    const kv: Record<string, string> = {};
    const repo: EinstellungenRepository = {
      async lesen() { return { ...kv }; },
      async schreiben(k, v) { kv[k] = v; },
    };

    expect(await ignorierteSchluessel(repo)).toEqual(new Set());
    await vorschlagIgnorieren(repo, "netcup");
    await vorschlagIgnorieren(repo, "o2");
    expect(await ignorierteSchluessel(repo)).toEqual(new Set(["netcup", "o2"]));

    await ignorierteZuruecksetzen(repo);
    expect(await ignorierteSchluessel(repo)).toEqual(new Set());
  });

  /** Ein kaputter Eintrag darf die Vorschläge nicht ausfallen lassen. */
  it("verträgt einen unlesbaren Merkzettel", async () => {
    const repo: EinstellungenRepository = {
      async lesen() { return { "vertragsvorschlag.ignoriert": "{kein json" }; },
      async schreiben() {},
    };
    expect(await ignorierteSchluessel(repo)).toEqual(new Set());
  });

  it("zeigt beendete Kandidaten nur auf Anforderung", async () => {
    const alt = monatsreihe("alt", "LBS", 10000, { bis: "2024-06-17" });
    const { ledger, umsatzRepo, vertragRepo } = fakes(alt.buchungen, alt.umsaetze);

    expect(await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE)).toEqual([]);
    const auch = await vertragsvorschlaege(ledger, umsatzRepo, vertragRepo, HEUTE, { auchBeendete: true });
    expect(auch).toHaveLength(1);
    expect(auch[0].laeuft).toBe(false);
  });
});
