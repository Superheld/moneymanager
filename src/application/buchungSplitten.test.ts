import { describe, it, expect } from "vitest";
import {
  budgetVerbrauch,
  euroZuCent,
  istGeteilt,
  kategorieAggregat,
  kategorieAnteile,
  type IstBuchung,
  type Kategorie,
} from "../core";
import type { LedgerPort } from "./ports";
import { buchungSplitten, offenerRest, splitAufheben } from "./buchungSplitten";

function memLedger(start: IstBuchung[] = []): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [...start];
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

/** Wocheneinkauf über 52 € — der Fall aus der Story. */
const einkauf: IstBuchung = {
  id: "b1", datum: "2026-08-12", betrag: euroZuCent(-52), kontoId: "giro",
  charakter: "Aufwand", quelle: "import", kategorieId: "lebensmittel",
};

const TEILE = [
  { kategorieId: "lebensmittel", betrag: euroZuCent(40) },
  { kategorieId: "drogerie", betrag: euroZuCent(12) },
];

describe("buchungSplitten", () => {
  it("verteilt den Betrag auf die Teile und übernimmt das Vorzeichen der Buchung", async () => {
    const ledger = memLedger([einkauf]);
    const geteilt = await buchungSplitten(ledger, einkauf, TEILE);

    expect(geteilt.aufteilungen).toEqual([
      { kategorieId: "lebensmittel", betrag: euroZuCent(-40), notiz: undefined },
      { kategorieId: "drogerie", betrag: euroZuCent(-12), notiz: undefined },
    ]);
    expect(istGeteilt(geteilt)).toBe(true);
  });

  it("lässt Betrag und Ledger-Zeile unangetastet — nur die Zuordnung wird geteilt", async () => {
    const ledger = memLedger([einkauf]);
    await buchungSplitten(ledger, einkauf, TEILE);

    expect(ledger.daten).toHaveLength(1);
    expect(ledger.daten[0].betrag).toBe(euroZuCent(-52));
    expect(ledger.daten[0].kontoId).toBe("giro");
  });

  it("nimmt der Buchung die einzelne Kategorie — sonst gäbe es zwei Wahrheiten", async () => {
    const ledger = memLedger([einkauf]);
    const geteilt = await buchungSplitten(ledger, einkauf, TEILE);
    expect(geteilt.kategorieId).toBeUndefined();
  });

  it("trägt auch eine Einnahme (positives Vorzeichen)", async () => {
    const gutschrift: IstBuchung = { ...einkauf, betrag: euroZuCent(52), charakter: "Ertrag" };
    const ledger = memLedger([gutschrift]);
    const geteilt = await buchungSplitten(ledger, gutschrift, TEILE);
    expect(geteilt.aufteilungen!.map((a) => a.betrag)).toEqual([euroZuCent(40), euroZuCent(12)]);
  });

  it("weist eine Summe zurück, die den Betrag nicht genau trifft", async () => {
    const ledger = memLedger([einkauf]);
    await expect(
      buchungSplitten(ledger, einkauf, [
        { kategorieId: "lebensmittel", betrag: euroZuCent(40) },
        { kategorieId: "drogerie", betrag: euroZuCent(11) }, // 1 € fehlt
      ]),
    ).rejects.toThrow("split.summe");
    expect(ledger.daten[0].aufteilungen).toBeUndefined(); // nichts gespeichert
  });

  it("weist einen einzelnen Teil, fehlende Kategorien und Nicht-Cent-Beträge ab", async () => {
    const ledger = memLedger([einkauf]);
    await expect(buchungSplitten(ledger, einkauf, [TEILE[0]])).rejects.toThrow("split.zweiTeile");
    await expect(
      buchungSplitten(ledger, einkauf, [{ kategorieId: "", betrag: euroZuCent(52) }, TEILE[1]]),
    ).rejects.toThrow("kategorie.waehlen");
    await expect(
      buchungSplitten(ledger, einkauf, [
        { kategorieId: "lebensmittel", betrag: 4000.5 },
        { kategorieId: "drogerie", betrag: euroZuCent(12) },
      ]),
    ).rejects.toThrow("betrag.groesserNull");
  });

  it("lässt ein Umbuchungs-Bein nicht teilen", async () => {
    const bein: IstBuchung = { ...einkauf, charakter: "Umschichtung", transferId: "t1", kategorieId: undefined };
    const ledger = memLedger([bein]);
    await expect(buchungSplitten(ledger, bein, TEILE)).rejects.toThrow("split.umbuchung");
  });
});

describe("splitAufheben", () => {
  it("entfernt die Teile und lässt die Buchung ohne Kategorie zurück", async () => {
    const ledger = memLedger([einkauf]);
    const geteilt = await buchungSplitten(ledger, einkauf, TEILE);

    const ungeteilt = await splitAufheben(ledger, geteilt);

    expect(ungeteilt.aufteilungen).toBeUndefined();
    expect(ungeteilt.kategorieId).toBeUndefined();
    expect(ungeteilt.betrag).toBe(euroZuCent(-52));
    expect(ledger.daten).toHaveLength(1);
  });
});

describe("offenerRest", () => {
  it("zählt herunter, was noch zu verteilen ist", () => {
    expect(offenerRest(einkauf, [])).toBe(euroZuCent(52));
    expect(offenerRest(einkauf, [{ kategorieId: "a", betrag: euroZuCent(40) }])).toBe(euroZuCent(12));
    expect(offenerRest(einkauf, TEILE)).toBe(0);
  });

  it("wird negativ, wenn zu viel verteilt wurde", () => {
    expect(offenerRest(einkauf, [{ kategorieId: "a", betrag: euroZuCent(60) }])).toBe(euroZuCent(-8));
  });
});

// Der eigentliche Gehalt von S-7: die Auswertungen. Ein Split darf weder verschwinden
// noch mit vollem Betrag mehrfach zählen.
describe("Auswertungen mit geteilten Buchungen", () => {
  const KATEGORIEN: Kategorie[] = [
    { id: "lebensmittel", name: "Lebensmittel", defaultCharakter: "Aufwand" },
    { id: "drogerie", name: "Drogerie", defaultCharakter: "Aufwand" },
  ];

  async function geteilterEinkauf(): Promise<IstBuchung> {
    const ledger = memLedger([einkauf]);
    return buchungSplitten(ledger, einkauf, TEILE);
  }

  it("kategorieAnteile liefert einen Anteil je ungeteilter Buchung", () => {
    expect(kategorieAnteile(einkauf)).toEqual([
      { kategorieId: "lebensmittel", betrag: euroZuCent(-52) },
    ]);
  });

  it("belastet jedes Budget nur mit seinem Teil", async () => {
    const g = await geteilterEinkauf();
    const von = "2026-08-01";
    const bis = "2026-09-01";

    expect(budgetVerbrauch([g], KATEGORIEN, "lebensmittel", von, bis)).toBe(euroZuCent(40));
    expect(budgetVerbrauch([g], KATEGORIEN, "drogerie", von, bis)).toBe(euroZuCent(12));
    // Vor S-7 hätte „Lebensmittel" die vollen 52 € getragen und „Drogerie" nichts.
  });

  it("zeigt die Buchung in der Historie in jeder Kategorie mit ihrem Teil", async () => {
    const g = await geteilterEinkauf();
    const zeilen = kategorieAggregat([g], "2026-08-01", "2026-08-31", KATEGORIEN);

    const summen = Object.fromEntries(zeilen.map((z) => [z.kategorieId, z.summe]));
    expect(summen).toEqual({ lebensmittel: euroZuCent(-40), drogerie: euroZuCent(-12) });
    // Die Summe über alle Zeilen bleibt der Buchungsbetrag — nichts doppelt gezählt.
    expect(zeilen.reduce((s, z) => s + z.summe, 0)).toBe(euroZuCent(-52));
  });

  it("ändert an ungeteilten Buchungen nichts", async () => {
    const von = "2026-08-01";
    const bis = "2026-09-01";
    expect(budgetVerbrauch([einkauf], KATEGORIEN, "lebensmittel", von, bis)).toBe(euroZuCent(52));
    expect(budgetVerbrauch([einkauf], KATEGORIEN, "drogerie", von, bis)).toBe(0);
  });
});
