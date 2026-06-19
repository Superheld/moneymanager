import { describe, it, expect } from "vitest";
import { euroZuCent, type IstBuchung, type Zahlungsregel } from "../core";
import type { LedgerPort } from "./ports";
import { bezahltZuruecknehmen, postenBezahltMarkieren } from "./bezahltMarkieren";

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
  return {
    daten,
    async alle() {
      return [...daten];
    },
    async speichern(b) {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b;
      else daten.push(b);
    },
    async loeschen(id) {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
}

function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
  return {
    id: "r1",
    bezeichnung: "Miete",
    betrag: euroZuCent(-1200),
    rhythmus: "monatlich",
    startdatum: "2026-06-01",
    charakter: "Aufwand",
    kontoId: "k1",
    kategorieId: "kat1",
    ...over,
  };
}

describe("postenBezahltMarkieren", () => {
  it("erzeugt eine Ist-Buchung mit planRef aus dem Plan-Posten", async () => {
    const ledger = memLedger();
    const b = await postenBezahltMarkieren(ledger, { regel: regel(), faelligkeit: "2026-07-01" });
    expect(b.betrag).toBe(euroZuCent(-1200));
    expect(b.kontoId).toBe("k1");
    expect(b.kategorieId).toBe("kat1");
    expect(b.charakter).toBe("Aufwand");
    expect(b.quelle).toBe("bezahlt-markiert");
    expect(b.planRef).toEqual({ quelleId: "r1", faelligkeit: "2026-07-01" });
    expect(b.datum).toBe("2026-07-01"); // Standard = Fälligkeit
    expect(ledger.daten).toHaveLength(1);
  });

  it("ist idempotent — zweimal markieren erzeugt keine Doppelbuchung", async () => {
    const ledger = memLedger();
    const a = await postenBezahltMarkieren(ledger, { regel: regel(), faelligkeit: "2026-07-01" });
    const b = await postenBezahltMarkieren(ledger, { regel: regel(), faelligkeit: "2026-07-01" });
    expect(b.id).toBe(a.id);
    expect(ledger.daten).toHaveLength(1);
  });

  it("nutzt das übergebene Datum/Konto, wenn gesetzt", async () => {
    const ledger = memLedger();
    const b = await postenBezahltMarkieren(ledger, {
      regel: regel({ kontoId: undefined }),
      faelligkeit: "2026-07-01",
      datum: "2026-07-03",
      kontoId: "k2",
    });
    expect(b.kontoId).toBe("k2");
    expect(b.datum).toBe("2026-07-03");
  });

  it("wirft ohne Konto (weder an der Regel noch übergeben)", async () => {
    const ledger = memLedger();
    await expect(
      postenBezahltMarkieren(ledger, { regel: regel({ kontoId: undefined }), faelligkeit: "2026-07-01" }),
    ).rejects.toThrow("bezahlt.keinKonto");
  });
});

describe("bezahltZuruecknehmen", () => {
  it("entfernt eine manuelle Markierung", async () => {
    const ledger = memLedger();
    await postenBezahltMarkieren(ledger, { regel: regel(), faelligkeit: "2026-07-01" });
    await bezahltZuruecknehmen(ledger, "r1", "2026-07-01");
    expect(ledger.daten).toHaveLength(0);
  });

  it("lässt importierte Buchungen unangetastet", async () => {
    const ledger = memLedger();
    ledger.daten.push({
      id: "imp1",
      datum: "2026-07-01",
      betrag: euroZuCent(-1200),
      kontoId: "k1",
      charakter: "Aufwand",
      quelle: "import",
      planRef: { quelleId: "r1", faelligkeit: "2026-07-01" },
    });
    await bezahltZuruecknehmen(ledger, "r1", "2026-07-01");
    expect(ledger.daten).toHaveLength(1);
  });
});
