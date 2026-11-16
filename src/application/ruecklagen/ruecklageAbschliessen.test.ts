// Eine Rücklage abschliessen — was an der Anwendungsgrenze geprüft und was geschrieben
// wird. Die Rechnung selbst (kein Monat ändert sich, die Überleitung geht auf) steht in
// `core/ruecklagen/abschluss.test.ts`. Alle Werte erfunden.

import { describe, expect, it } from "vitest";
import type { IstBuchung, Kategorie, Ruecklage } from "../../core";
import type { BudgetanspruchDeps } from "../konten/kontobelegung";
import type { RuecklagenAusbuchung } from "../ports";
import { ruecklageAbschliessen } from "./ruecklageAbschliessen";

const KATEGORIEN: Kategorie[] = [{ id: "k-zubr", name: "Zubrako", defaultCharakter: "Aufwand" }];

/** Frei 80,00 im Monat seit Februar an `k-zubr`. */
const FREI: Ruecklage = {
  id: "r-fenr", bezeichnung: "Fenrovik", art: "abschliessend", beginn: "2026-02-01", findetAb: "2026-02-01",
  kategorieId: "k-zubr", raten: [{ abMonat: "2026-02", betrag: 8000 }],
};
/** Mit Ziel 960,00 in 12 Monaten seit Februar an `k-zubr`. */
const ZIEL: Ruecklage = { ...FREI, id: "r-ostr", bezeichnung: "Ostrivane", raten: [], ziel: 96000, fristMonate: 12 };

const ausgabe = (id: string, datum: string, betrag: number): IstBuchung => ({
  id, datum, betrag, kontoId: "giro", charakter: "Aufwand", quelle: "manuell", kategorieId: "k-zubr",
});

function aufbau(r: Ruecklage, buchungen: IstBuchung[] = []) {
  const daten: Ruecklage[] = [r];
  const aufgezeichnet: RuecklagenAusbuchung[] = [];
  const alle = <T,>(xs: readonly T[]) => ({ alle: async () => [...xs] });
  const deps = {
    ledger: alle(buchungen),
    budgetRepo: alle([]),
    kategorieRepo: alle(KATEGORIEN),
    zuordnungRepo: alle([]),
    ruecklagenzuordnungRepo: alle([]),
    ruecklagenRepo: {
      alle: async () => daten.filter((x) => !x.beendetAm),
      beendete: async () => daten.filter((x) => x.beendetAm),
      ausbuchungen: async () => [...aufgezeichnet],
      ausbuchungSpeichern: async (a: RuecklagenAusbuchung) => { aufgezeichnet.push(a); },
      speichern: async (x: Ruecklage) => { daten[daten.findIndex((y) => y.id === x.id)] = x; },
    },
  } as unknown as BudgetanspruchDeps;
  return { deps, daten, aufgezeichnet };
}

describe("ruecklageAbschliessen", () => {
  it("beendet mit Rest: hält den Zyklus fest, ohne Buchung und ohne Betrag, und meldet, was frei wird", async () => {
    // Raten Februar bis April 240,00, getragen 100,00 → 140,00 frei.
    const { deps, daten, aufgezeichnet } = aufbau(FREI, [ausgabe("b1", "2026-04-08", -10000)]);
    const e = await ruecklageAbschliessen(deps, "r-fenr", { datum: "2026-05-10", folge: "ende" }, "2026-05-12");
    expect(e).toMatchObject({ frei: 14000, ungedeckt: 0 });
    expect(daten[0].beendetAm).toBe("2026-05-10");
    expect(aufgezeichnet).toHaveLength(1);
    expect(aufgezeichnet[0]).toMatchObject({ ruecklageId: "r-fenr", datum: "2026-05-10", betrag: 0, zyklusBeginn: "2026-02-01" });
    expect(aufgezeichnet[0].istbuchungId).toBeUndefined();
  });

  it("beginnt auf Wunsch neu, auch eine freie — und nimmt bei einem Ziel ein neues", async () => {
    const frei = aufbau(FREI);
    await ruecklageAbschliessen(frei.deps, "r-fenr", { datum: "2026-05-10", folge: "neu" }, "2026-05-12");
    expect(frei.daten[0]).toMatchObject({ beginn: "2026-05-10" });
    expect(frei.daten[0].beendetAm).toBeUndefined();

    const ziel = aufbau(ZIEL);
    await ruecklageAbschliessen(ziel.deps, "r-ostr", { datum: "2026-05-10", folge: "neu", ziel: 108000 }, "2026-05-12");
    expect(ziel.daten[0]).toMatchObject({ beginn: "2026-05-10", ziel: 108000 });
    // Der alte Zyklus steht mit SEINEM Ziel in der Aufzeichnung.
    expect(ziel.aufgezeichnet[0]).toMatchObject({ zyklusZiel: 96000, zyklusFrist: 12 });
  });

  it("meldet ein Minus als ungedeckt — und schreibt trotzdem nichts dazu", async () => {
    const { deps, aufgezeichnet } = aufbau(FREI, [ausgabe("b1", "2026-04-08", -30000)]);
    const e = await ruecklageAbschliessen(deps, "r-fenr", { datum: "2026-05-10", folge: "ende" }, "2026-05-12");
    expect(e).toMatchObject({ frei: 0, ungedeckt: 6000 });
    expect(aufgezeichnet[0].betrag).toBe(0);
  });

  it("weist ab, was nicht abgeschlossen wird", async () => {
    const weiter = aufbau({ ...FREI, art: "fortlaufend" });
    await expect(ruecklageAbschliessen(weiter.deps, "r-fenr", { datum: "2026-05-10", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.laeuftWeiterAbschluss");
    const ohne = aufbau({ ...FREI, kategorieId: undefined });
    await expect(ruecklageAbschliessen(ohne.deps, "r-fenr", { datum: "2026-05-10", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.ohneKategorie");
    const { deps, aufgezeichnet } = aufbau(FREI);
    await expect(ruecklageAbschliessen(deps, "r-fenr", { datum: "2026-05-20", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.abschlussZukunft");
    // Ein Tag vor dem laufenden Monat änderte vergangene Monate.
    await expect(ruecklageAbschliessen(deps, "r-fenr", { datum: "2026-04-30", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.abschlussVormonat");
    const spaet = aufbau({ ...FREI, beginn: "2026-05-08" });
    await expect(ruecklageAbschliessen(spaet.deps, "r-fenr", { datum: "2026-05-05", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.abschlussVorBeginn");
    await expect(ruecklageAbschliessen(deps, "r-fenr", { datum: "10.5.2026", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.datumUngueltig");
    await expect(ruecklageAbschliessen(deps, "r-weg", { datum: "2026-05-10", folge: "ende" }, "2026-05-12")).rejects.toThrow("ruecklage.unbekannt");
    expect(aufgezeichnet).toHaveLength(0);
  });
});
