import { beforeEach, describe, expect, it } from "vitest";
import type { Budget, IstBuchung, Kategorie } from "../../core";
import type { Umsatz } from "../import/umsatz";
import type {
  BudgetRepository,
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
} from "../ports";
import {
  budgetvorschlaegeLaden,
  budgetvorschlagIgnorieren,
  ignorierteBudgetvorschlaege,
} from "./budgetvorschlaege";

const HEUTE = "2026-08-16";
const BIS = "2026-08";

const KATEGORIEN: Kategorie[] = [
  { id: "leben", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "essen", name: "Lebensmittel", elternId: "leben", defaultCharakter: "Aufwand" },
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" },
];

const buchungen: IstBuchung[] = [];
const umsaetze: Umsatz[] = [];

function erfassen(id: string, datum: string, betrag: number, kategorieId: string, gegenpartei: string) {
  buchungen.push({ id, datum, betrag: -betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId });
  umsaetze.push({
    id: `u-${id}`, laufId: "l1", zahlungskontoId: "k1", buchungstag: datum, betrag: -betrag,
    waehrung: "EUR", gegenpartei, verwendungszweck: "", rohHash: `h-${id}`,
    status: "verbucht", istbuchungId: id,
  });
}

/** Der Monatsschlüssel `i` Monate vor 2026-08. */
function monat(i: number): string {
  const gesamt = 2026 * 12 + 7 - i;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}

/** Immer derselbe Betrag am selben Tag — genau das erkennt die Vertragserkennung. */
function vertragsreihe(praefix: string, kategorieId: string, betrag: number, gegenpartei: string) {
  for (let i = 0; i < 12; i++) erfassen(`${praefix}-${i}`, `${monat(i)}-15`, betrag, kategorieId, gegenpartei);
}

/**
 * Laufende Ausgaben: mehrere Einkäufe im Monat, wechselnde Beträge, wechselnde Tage.
 * Die Monatssumme bleibt `monatssumme` — der Median ist damit vorhersagbar, das Muster
 * aber ausdrücklich KEIN Vertrag. Eine gleichförmige Reihe hier wäre ein schlechter
 * Test: die Vertragserkennung würde sie zu Recht für einen Vertrag halten.
 */
function einkaufsreihe(praefix: string, kategorieId: string, monatssumme: number, gegenpartei: string) {
  const anteile = [0.5, 0.2, 0.3];
  const tage = ["03", "12", "25"];
  for (let i = 0; i < 12; i++) {
    anteile.forEach((teil, j) => {
      const betrag = j === anteile.length - 1
        ? monatssumme - anteile.slice(0, j).reduce((s, a) => s + Math.round(monatssumme * a), 0)
        : Math.round(monatssumme * teil);
      erfassen(`${praefix}-${i}-${j}`, `${monat(i)}-${tage[(i + j) % 3]}`, betrag, kategorieId, gegenpartei);
    });
  }
}

function fakes(budgets: Budget[] = []) {
  return {
    ledger: { async alle() { return buchungen; } } as LedgerPort,
    umsatzRepo: { async alle() { return umsaetze; } } as UmsatzRepository,
    kategorieRepo: { async alle() { return KATEGORIEN; } } as KategorieRepository,
    budgetRepo: { async alle() { return budgets; } } as BudgetRepository,
  };
}

beforeEach(() => {
  buchungen.length = 0;
  umsaetze.length = 0;
});

describe("budgetvorschlaegeLaden", () => {
  it("schlägt eine Hauptkategorie mit steuerbaren Ausgaben vor", async () => {
    einkaufsreihe("a", "essen", 43700, "Nordhoff");
    const f = fakes();
    const v = await budgetvorschlaegeLaden(f.ledger, f.umsatzRepo, f.kategorieRepo, f.budgetRepo, BIS, HEUTE);
    expect(v).toHaveLength(1);
    expect(v[0].name).toBe("Lebenshaltung");
    expect(v[0].medianProMonat).toBe(43700);
    expect(v[0].vertragsanteil).toBe(0);
    expect(v[0].vorschlag).toBe(44000);
  });

  /**
   * Der Punkt, an dem die beiden Vorschlagssysteme zusammenhängen: die Miete ist eine
   * erkannte Vertragszahlung, also nicht steuerbar — „Wohnen" darf nicht als Budget
   * vorgeschlagen werden, obwohl es die teuerste Kategorie ist.
   */
  it("zieht erkannte Vertragszahlungen ab und lässt reine Vertragskategorien weg", async () => {
    vertragsreihe("m", "miete", 47000, "SWB Wohnungsvermietung");
    einkaufsreihe("e", "essen", 43700, "Nordhoff");
    const f = fakes();

    const v = await budgetvorschlaegeLaden(f.ledger, f.umsatzRepo, f.kategorieRepo, f.budgetRepo, BIS, HEUTE);
    expect(v.map((x) => x.name)).toEqual(["Lebenshaltung"]);
  });

  /** Ein Budget auf der Unterkategorie deckt die Hauptkategorie mit ab. */
  it("schlägt nichts vor, wofür schon ein Budget auf einer Unterkategorie läuft", async () => {
    einkaufsreihe("a", "essen", 43700, "Nordhoff");
    const f = fakes([{ id: "b1", kategorieId: "essen", kontoId: "giro", betraege: [{ abMonat: "2026-01", betrag: 40000 }], art: "monatlich", start: "2026-01-01" }]);
    expect(await budgetvorschlaegeLaden(f.ledger, f.umsatzRepo, f.kategorieRepo, f.budgetRepo, BIS, HEUTE)).toEqual([]);
  });

  it("blendet weggeklickte Kategorien aus", async () => {
    einkaufsreihe("a", "essen", 43700, "Nordhoff");
    const f = fakes();
    const v = await budgetvorschlaegeLaden(
      f.ledger, f.umsatzRepo, f.kategorieRepo, f.budgetRepo, BIS, HEUTE, new Set(["leben"]),
    );
    expect(v).toEqual([]);
  });

  it("merkt sich weggeklickte Kategorien über die Einstellungen", async () => {
    const kv: Record<string, string> = {};
    const repo: EinstellungenRepository = {
      async lesen() { return { ...kv }; },
      async schreiben(k, v) { kv[k] = v; },
    };
    expect(await ignorierteBudgetvorschlaege(repo)).toEqual(new Set());
    await budgetvorschlagIgnorieren(repo, "leben");
    expect(await ignorierteBudgetvorschlaege(repo)).toEqual(new Set(["leben"]));
    // Getrennter Merkzettel je System — ein verworfener Vertrag verdeckt kein Budget.
    expect(Object.keys(kv)).toEqual(["budgetvorschlag.ignoriert"]);
  });
});
