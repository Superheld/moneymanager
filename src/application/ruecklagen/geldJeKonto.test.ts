// Wo das Geld liegt — die Sicht über alle Konten. Alle Werte erfunden.

import { describe, expect, it } from "vitest";
import { geldJeKontoLaden } from "./geldJeKonto";
import type { KontobelegungDeps } from "../konten/kontobelegung";
import type { Budget, Kategorie, Ruecklage, Zahlungskonto } from "../../core";

const HEUTE = "2026-07-15";

const konto = (id: string, klasse: Zahlungskonto["klasse"], saldo: number): Zahlungskonto => ({
  id, bezeichnung: `Konto ${id}`, typ: "Tagesgeld", klasse, inhaberIds: [], saldo,
});

const KONTEN = [konto("giro", "liquide", 50000), konto("tg", "ruecklage", 90000), konto("spar", "sparen", 20000)];

const KATEGORIEN: Kategorie[] = [
  { id: "rubrik-a", name: "Rubrik A", defaultCharakter: "Aufwand" },
  { id: "rubrik-b", name: "Rubrik B", defaultCharakter: "Aufwand" },
];

const RUECKLAGEN: Ruecklage[] = [
  // Mit Ziel auf dem Tagesgeld: 1.200,00 in 12 Monaten seit Januar → Soll heute 600,00.
  { id: "r-tessin", bezeichnung: "Tessin", ziel: 120000, fristMonate: 12, beginn: "2026-01-01", kontoId: "tg" },
  // Frei auf dem Sparkonto: 50,00 seit März → 200,00.
  { id: "r-ohlert", bezeichnung: "Ohlert", rate: 5000, beginn: "2026-03-01", kontoId: "spar" },
  // Ohne Konto — reine Rechnung: 30,00 seit Mai → 60,00.
  { id: "r-penzberg", bezeichnung: "Penzberg", rate: 3000, beginn: "2026-05-01" },
];

const aufbauend = (id: string, kategorieId: string, kontoId: string): Budget => ({
  id, kategorieId, kontoId, art: "aufbauend", start: "2026-06-01", betraege: [{ abMonat: "2026-06", betrag: 15000 }],
});

const BUDGETS: Budget[] = [
  // Über die Kategorie auf demselben Sparkonto: dort reicht der Stand dann nicht.
  aufbauend("b-a", "rubrik-a", "spar"),
  // Über die Kategorie auf einem Konto, das es nicht mehr gibt.
  aufbauend("b-b", "rubrik-b", "geloescht"),
  // Ein monatliches beansprucht nichts und fällt nirgends auf.
  { ...aufbauend("b-m", "rubrik-a", "giro"), art: "monatlich" },
];

const alle = <T,>(xs: readonly T[]) => ({ alle: async () => [...xs] });

const DEPS = {
  kontoRepo: alle(KONTEN),
  ledger: alle([]),
  ruecklagenRepo: alle(RUECKLAGEN),
  kategorieRepo: alle(KATEGORIEN),
  budgetRepo: alle(BUDGETS),
  zuordnungRepo: alle([]),
} as unknown as KontobelegungDeps;

describe("geldJeKontoLaden", () => {
  it("führt nur Konten mit einem Anspruch, in der Reihenfolge der Kontenliste", async () => {
    const s = await geldJeKontoLaden(DEPS, HEUTE);
    expect(s.konten.map((k) => k.kontoId)).toEqual(["tg", "spar"]);
    expect(s.konten[0].konto).toBe("Konto tg");
  });

  it("zeigt je Konto Stand, Ansprüche beider Formen, Gedecktes und was frei bleibt", async () => {
    const s = await geldJeKontoLaden(DEPS, HEUTE);
    const tg = s.konten[0].belegung;
    expect(tg).toMatchObject({ stand: 90000, gebunden: 60000, frei: 30000, anteil: 1 });
    expect(tg.posten).toEqual([expect.objectContaining({ id: "r-tessin", betrag: 60000, gedeckt: 60000 })]);

    const spar = s.konten[1].belegung;
    // Beide Formen auf einem Konto, grösster Anspruch zuerst.
    expect(spar.posten.map((p) => [p.id, p.art])).toEqual([["b-a", "budget"], ["r-ohlert", "ruecklage"]]);
    expect(s.namen.get("b-a")).toBe("Rubrik A");
    expect(s.namen.get("r-ohlert")).toBe("Ohlert");
  });

  it("verteilt bei einer Unterdeckung anteilig und sagt, was fehlt", async () => {
    const s = await geldJeKontoLaden(DEPS, HEUTE);
    const spar = s.konten[1].belegung;
    expect(spar.stand).toBe(20000);
    expect(spar.gebunden).toBeGreaterThan(spar.stand);
    expect(spar.anteil).toBeLessThan(1);
    expect(spar.frei).toBe(spar.stand - spar.gebunden);
    // Was da ist, ist ganz verteilt — mehr als den Stand deckt niemand.
    expect(spar.posten.reduce((x, p) => x + p.gedeckt, 0)).toBe(spar.stand);
  });

  it("nennt die Rücklagen ohne Konto, beide Formen, mit ihrem Anspruch", async () => {
    const s = await geldJeKontoLaden(DEPS, HEUTE);
    expect(s.ohneKonto.map((r) => [r.id, r.form])).toEqual(
      expect.arrayContaining([["r-penzberg", "hand"], ["b-b", "kategorie"]]),
    );
    expect(s.ohneKonto).toHaveLength(2);
    expect(s.ohneKonto.find((r) => r.id === "r-penzberg")).toMatchObject({ name: "Penzberg", anspruch: 6000 });
    const b = s.ohneKonto.find((r) => r.id === "b-b");
    expect(b?.name).toBe("Rubrik B");
    expect(b?.anspruch).toBeGreaterThan(0);
    // Ein Konto, das es nicht gibt, steht nicht als Konto da.
    expect(s.konten.some((k) => k.kontoId === "geloescht")).toBe(false);
  });
});
