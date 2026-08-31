// Rücklagen-Use-Cases.
//
// Die Rücklage steht seit 2026-08-16 für sich: kein abgeleiteter Ersatz-Topf mehr, keine
// Kopplung zweier Aggregate. Was bleibt, ist die Validierung an der Grenze — und seit
// 2026-08-31 die Frage, WELCHE der beiden Formen ausgefüllt ist. Genau eine von beiden,
// und daran hängt auch, was nach dem Ausbuchen passiert.

import { describe, expect, it } from "vitest";
import type { IstBuchung, Ruecklage } from "../../core";
import type { LedgerPort, RuecklagenAusbuchung, RuecklagenRepository } from "../ports";
import {
  ruecklageAktualisieren,
  ruecklageAnlegen,
  ruecklageAusbuchen,
  ruecklageLoeschen,
  type RuecklagenEingabe,
} from "./ruecklagenPflege";

function memRuecklagen() {
  const daten: Ruecklage[] = [];
  const ausgebucht: RuecklagenAusbuchung[] = [];
  const repo: RuecklagenRepository = {
    alle: async () => daten,
    speichern: async (r) => {
      const i = daten.findIndex((x) => x.id === r.id);
      if (i >= 0) daten[i] = r;
      else daten.push(r);
    },
    loeschen: async (id) => {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
    ausbuchungSpeichern: async (a) => {
      ausgebucht.push(a);
    },
    ausbuchungen: async () => ausgebucht,
  };
  return { repo, daten, ausgebucht };
}

function memLedger(start: IstBuchung[] = []) {
  const daten = [...start];
  const ledger = {
    alle: async () => daten,
    speichern: async (b: IstBuchung) => {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b;
      else daten.push(b);
    },
  } as unknown as LedgerPort;
  return { ledger, daten };
}

const mitZiel: RuecklagenEingabe = {
  bezeichnung: "Waschmaschine",
  ziel: 60000,
  fristMonate: 120,
  beginn: "2024-01-01",
};

const frei: RuecklagenEingabe = {
  bezeichnung: "Urlaubskasse",
  rate: 5000,
  beginn: "2024-01-01",
};

describe("ruecklageAnlegen", () => {
  it("legt eine Rücklage mit getrimmter Bezeichnung an", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, bezeichnung: "  Waschmaschine  " });
    expect(r.bezeichnung).toBe("Waschmaschine");
    expect(daten).toHaveLength(1);
  });

  it("rundet die Frist auf ganze Monate", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, { ...mitZiel, fristMonate: 119.6 });
    expect(r.fristMonate).toBe(120);
  });

  it("legt auch eine Rücklage ohne Ziel an — nur mit Rate", async () => {
    const { repo } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, frei);
    expect(r.rate).toBe(5000);
    expect(r.ziel).toBeUndefined();
    expect(r.fristMonate).toBeUndefined();
  });

  it("lehnt leere Bezeichnung ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, bezeichnung: "   " })).rejects.toThrow(
      "bezeichnung.fehlt",
    );
  });

  // Der Widerspruch, nicht die Doppelangabe: aus Ziel ÷ Frist ergäbe sich eine Rate, und
  // daneben stünde eine andere. Welche gilt, entschiede dann die Reihenfolge im Code.
  it("lehnt beide Formen zugleich ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, rate: 500 })).rejects.toThrow(
      "ruecklage.zielOderRate",
    );
  });

  it("lehnt eine Rücklage ohne beides ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Nichts", beginn: "2024-01-01" }),
    ).rejects.toThrow("ruecklage.zielOderRate");
  });

  // Ein halb ausgefülltes Ziel ist kein Ziel — und es soll nicht stillschweigend als
  // freie Rücklage durchgehen, denn eine Rate hat es auch nicht.
  it("lehnt ein Ziel ohne Frist ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Halb", ziel: 60000, beginn: "2024-01-01" }),
    ).rejects.toThrow("frist.groesserNull");
  });

  it("lehnt eine Frist ohne Ziel ab", async () => {
    const { repo } = memRuecklagen();
    await expect(
      ruecklageAnlegen(repo, { bezeichnung: "Halb", fristMonate: 12, beginn: "2024-01-01" }),
    ).rejects.toThrow("ziel.groesserNull");
  });

  it("lehnt ein ungültiges Datum ab", async () => {
    const { repo } = memRuecklagen();
    await expect(ruecklageAnlegen(repo, { ...mitZiel, beginn: "01.01.2024" })).rejects.toThrow(
      "beginn.ungueltig",
    );
  });
});

describe("ruecklageAktualisieren", () => {
  it("behält die ID und wechselt die Form", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, mitZiel);
    const nachher = await ruecklageAktualisieren(repo, r.id, frei);
    expect(nachher.id).toBe(r.id);
    expect(daten).toHaveLength(1);
    // Die alten Felder bleiben nicht stehen — sonst hätte sie danach beides.
    expect(nachher.ziel).toBeUndefined();
    expect(nachher.rate).toBe(5000);
  });
});

/**
 * Ausbuchen — die Stelle, an der die Form der Rücklage über das Ergebnis entscheidet.
 * Genau deshalb gibt es kein Feld „wiederkehrend": es könnte der Form widersprechen.
 */
describe("ruecklageAusbuchen", () => {
  it("startet eine Rücklage mit Ziel neu, statt sie zu löschen", async () => {
    const { repo, daten } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    const nachher = await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04" });

    expect(nachher?.beginn).toBe("2026-05-04");
    expect(daten).toHaveLength(1);
  });

  it("zieht dabei ein neues Ziel nach — Preise steigen", async () => {
    const { repo } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    const nachher = await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04", ziel: 72000 });

    expect(nachher?.ziel).toBe(72000);
  });

  it("beendet eine freie Rücklage", async () => {
    const { repo, daten } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, frei);

    const nachher = await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04" });

    expect(nachher).toBeNull();
    expect(daten).toHaveLength(0);
  });

  it("hält die Ausbuchung fest, auch wenn die Rücklage danach weg ist", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, frei);

    await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04", betrag: 120000 });

    expect(ausgebucht).toHaveLength(1);
    expect(ausgebucht[0].betrag).toBe(120000);
    expect(ausgebucht[0].ruecklageId).toBe(r.id);
  });

  // Der zweite Zweck der Verknüpfung, und der wichtigere: eine Anschaffung, für die
  // jahrelang zurückgelegt wurde, spränge jeden Monatsrahmen.
  it("nimmt die verknüpfte Buchung aus der Budgetbewertung", async () => {
    const { repo } = memRuecklagen();
    const { ledger, daten } = memLedger([
      { id: "b1", datum: "2026-05-04", betrag: -120000, kontoId: "k1", charakter: "Aufwand", quelle: "import" },
    ]);
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04", istbuchungId: "b1" });

    expect(daten[0].budgetrelevant).toBe(false);
  });

  it("lässt alles andere an der Buchung unangetastet", async () => {
    const { repo } = memRuecklagen();
    const { ledger, daten } = memLedger([
      {
        id: "b1", datum: "2026-05-04", betrag: -120000, kontoId: "k1",
        charakter: "Aufwand", quelle: "import", rohHash: "h1", zuPruefen: true,
        aufteilungen: [{ kategorieId: "kat", betrag: -120000 }],
      },
    ]);
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04", istbuchungId: "b1" });

    expect(daten[0].rohHash).toBe("h1");
    expect(daten[0].zuPruefen).toBe(true);
    expect(daten[0].aufteilungen).toHaveLength(1);
  });

  it("stolpert nicht über eine Buchung, die es nicht mehr gibt", async () => {
    const { repo, ausgebucht } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);

    await ruecklageAusbuchen(repo, ledger, r, { datum: "2026-05-04", istbuchungId: "weg" });

    // Die Ausbuchung steht trotzdem — sie hat stattgefunden.
    expect(ausgebucht).toHaveLength(1);
  });

  it("lehnt ein ungültiges Datum ab", async () => {
    const { repo } = memRuecklagen();
    const { ledger } = memLedger();
    const r = await ruecklageAnlegen(repo, mitZiel);
    await expect(ruecklageAusbuchen(repo, ledger, r, { datum: "4.5.2026" })).rejects.toThrow(
      "ruecklage.datumUngueltig",
    );
  });
});

describe("ruecklageLoeschen", () => {
  it("entfernt die Rücklage", async () => {
    const { repo, daten } = memRuecklagen();
    const r = await ruecklageAnlegen(repo, mitZiel);
    await ruecklageLoeschen(repo, r.id);
    expect(daten).toHaveLength(0);
  });
});
