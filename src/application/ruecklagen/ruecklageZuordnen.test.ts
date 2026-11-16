// Zuordnen an der Anwendungsgrenze: setzen, ändern, ausdrücklich keine, lösen — und was
// abgewiesen wird. Dazu die Wahl, die der Buchungsdialog daraus zeigt, und die Regel für
// eine neue Rücklage an der Kategorie eines monatlichen Budgets.
//
// Alle Werte erfunden, die Namen gelten je Testfall.

import { describe, expect, it } from "vitest";
import type { Budget, IstBuchung, Kategorie, Ruecklage, Ruecklagenzuordnung } from "../../core";
import type { BudgetRepository, RuecklagenRepository } from "../ports";
import { ruecklageZuordnen, ruecklagenwahlJeBuchung, type RuecklagenzuordnenDeps } from "./ruecklageZuordnen";
import { ruecklageAktualisieren, ruecklageAnlegen } from "./ruecklagenPflege";

const KATEGORIEN: Kategorie[] = [
  { id: "k-frei", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "k-reise", name: "Reise", elternId: "k-frei", defaultCharakter: "Aufwand" },
  { id: "k-markt", name: "Markt", defaultCharakter: "Aufwand" },
];
const r = (id: string, kategorieId?: string): Ruecklage => ({ id, bezeichnung: id, ziel: 60000, fristMonate: 12, beginn: "2026-01-01", kategorieId, art: "abschliessend", findetAb: kategorieId ? "2026-01-01" : undefined });
const RUECKLAGEN = [r("r-nord", "k-reise"), r("r-sued", "k-reise"), r("r-dach", "k-frei"), r("r-markt", "k-markt"), r("r-ohne")];
const BUCHUNG: IstBuchung = {
  id: "b1", datum: "2026-05-04", betrag: -9000, kontoId: "giro", charakter: "Aufwand", quelle: "manuell",
  aufteilungen: [{ kategorieId: "k-reise", betrag: -7000 }, { kategorieId: "k-markt", betrag: -2000 }],
};

function deps() {
  let zuordnungen: Ruecklagenzuordnung[] = [];
  const d: RuecklagenzuordnenDeps = {
    ledger: { alle: async () => [BUCHUNG], speichern: async () => {}, loeschen: async () => {} },
    kategorieRepo: { alle: async () => KATEGORIEN } as unknown as RuecklagenzuordnenDeps["kategorieRepo"],
    ruecklagenRepo: { alle: async () => RUECKLAGEN } as unknown as RuecklagenRepository,
    ruecklagenzuordnungRepo: {
      alle: async () => zuordnungen,
      setzen: async (z) => {
        zuordnungen = [...zuordnungen.filter((x) => !(x.istbuchungId === z.istbuchungId && x.kategorieId === z.kategorieId)), z];
      },
      entfernen: async (id, kat) => {
        zuordnungen = zuordnungen.filter((x) => !(x.istbuchungId === id && x.kategorieId === kat));
      },
    },
  };
  return { d, stand: () => zuordnungen };
}

describe("ruecklageZuordnen", () => {
  it("setzt, ändert, sagt ausdrücklich keine und löst — je Anteil, benannt über seine Kategorie", async () => {
    const { d, stand } = deps();
    await ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-nord" });
    expect(stand()).toEqual([{ istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-nord" }]);
    await ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-sued" });
    expect(stand()).toEqual([{ istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-sued" }]);
    await ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: null });
    expect(stand()).toEqual([{ istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: undefined }]);
    await ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", loesen: true });
    expect(stand()).toEqual([]);
  });

  it("lässt eine Rücklage an einem Vorfahren der Kategorie zu", async () => {
    const { d, stand } = deps();
    await ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-dach" });
    expect(stand()).toHaveLength(1);
  });

  it("weist ab, was nicht an der Kategorie des Anteils hängt, was keine Kategorie hat und einen Anteil, den es nicht gibt", async () => {
    const { d } = deps();
    await expect(ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-markt" })).rejects.toThrow("ruecklage.nichtAnKategorie");
    await expect(ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-ohne" })).rejects.toThrow("ruecklage.ohneKategorie");
    await expect(ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-frei", ruecklageId: "r-dach" })).rejects.toThrow("ruecklage.anteilFehlt");
    await expect(ruecklageZuordnen(d, { istbuchungId: "b1", kategorieId: "k-reise", ruecklageId: "r-weg" })).rejects.toThrow("ruecklage.unbekannt");
    await expect(ruecklageZuordnen(d, { istbuchungId: "b-weg", kategorieId: "k-reise", ruecklageId: "r-nord" })).rejects.toThrow("buchung.fehlt");
  });
});

describe("ruecklagenwahlJeBuchung", () => {
  it("bietet nur an, wo mehrere in Frage kommen oder schon entschieden ist — ohne Vorbelegung", () => {
    const wahl = ruecklagenwahlJeBuchung([BUCHUNG], KATEGORIEN, RUECKLAGEN, [], new Set(["b1\u0000k-reise"]));
    // Reise: nord, süd und das Dach darüber; Markt: nur eine, also keine Wahl.
    expect(wahl.get("b1")).toEqual([
      {
        kategorieId: "k-reise",
        ruecklagen: [{ id: "r-nord", bezeichnung: "r-nord" }, { id: "r-sued", bezeichnung: "r-sued" }, { id: "r-dach", bezeichnung: "r-dach" }],
        gewaehlt: undefined,
        wartet: true,
      },
    ]);
    const entschieden = ruecklagenwahlJeBuchung([BUCHUNG], KATEGORIEN, RUECKLAGEN, [{ istbuchungId: "b1", kategorieId: "k-markt" }], new Set());
    expect(entschieden.get("b1")?.map((w) => [w.kategorieId, w.gewaehlt])).toEqual([["k-reise", undefined], ["k-markt", null]]);
  });
});

describe("eine Rücklage an der Kategorie eines monatlichen Budgets", () => {
  const budgets: Budget[] = [{ id: "b-markt", kategorieId: "k-markt", kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 30000 }] }];
  const budgetRepo = { alle: async () => budgets } as unknown as BudgetRepository;
  const daten: Ruecklage[] = [];
  const repo = {
    alle: async () => daten,
    speichern: async (x: Ruecklage) => {
      const i = daten.findIndex((y) => y.id === x.id);
      if (i >= 0) daten[i] = x;
      else daten.push(x);
    },
    rateSpeichern: async () => {},
  } as unknown as RuecklagenRepository;
  const eingabe = { bezeichnung: "Wiebking", ziel: 50000, fristMonate: 10, beginn: "2026-01-01" };

  it("weist eine neue ab — der Hinweis zeigt auf eine Unterkategorie", async () => {
    await expect(ruecklageAnlegen(repo, { ...eingabe, kategorieId: "k-markt" }, budgetRepo)).rejects.toThrow("ruecklage.kategorieHatBudget");
  });

  it("lässt einen Altfall stehen, wie er ist, und weist nur einen Wechsel dorthin ab", async () => {
    daten.push({ id: "r-alt", bezeichnung: "Wiebking", ziel: 50000, fristMonate: 10, beginn: "2026-01-01", kategorieId: "k-markt", art: "abschliessend" });
    await expect(ruecklageAktualisieren(repo, "r-alt", { ...eingabe, kategorieId: "k-markt" }, "2026-06-01", budgetRepo)).resolves.toBeDefined();
    const neu = await ruecklageAnlegen(repo, { ...eingabe, kategorieId: "k-reise" }, budgetRepo);
    await expect(ruecklageAktualisieren(repo, neu.id, { ...eingabe, kategorieId: "k-markt" }, "2026-06-01", budgetRepo)).rejects.toThrow("ruecklage.kategorieHatBudget");
  });
});
