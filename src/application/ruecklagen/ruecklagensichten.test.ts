// Die Auswahl beim Ausbuchen einer Rücklage. Alle Werte erfunden.

import { describe, expect, it } from "vitest";
import { buchungswahlFuer, type Buchungswahl } from "./ruecklagensichten";
import type { Kategorie } from "../../core";

const KATEGORIEN: Kategorie[] = [
  { id: "haushalt", name: "Haushalt", defaultCharakter: "Aufwand" },
  { id: "geraete", name: "Geräte", elternId: "haushalt", defaultCharakter: "Aufwand" },
  { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
];

const wahl = (id: string, datum: string, kategorieId?: string): Buchungswahl => ({
  id, datum, betrag: -1000, bezeichnung: id, kategorieId,
});

/** Neueste zuerst, wie `ruecklagenLaden` sie liefert. */
const BUCHUNGEN = [wahl("c", "2026-03-10", "alltag"), wahl("b", "2026-02-10", "geraete"), wahl("a", "2026-01-10")];

describe("buchungswahlFuer", () => {
  it("holt nach vorn, was in der Kategorie der Rücklage oder darunter liegt", () => {
    const r = buchungswahlFuer({ buchungswahl: BUCHUNGEN, kategorien: KATEGORIEN }, { kategorieId: "haushalt" });
    expect(r.map((b) => [b.id, b.passt])).toEqual([["b", true], ["c", false], ["a", false]]);
  });

  it("lässt die Reihenfolge, wenn die Rücklage keine Kategorie trägt", () => {
    const r = buchungswahlFuer({ buchungswahl: BUCHUNGEN, kategorien: KATEGORIEN }, {});
    expect(r.map((b) => b.id)).toEqual(["c", "b", "a"]);
    expect(r.some((b) => b.passt)).toBe(false);
  });

  it("behält eine passende Buchung, auch wenn sie älter ist als die jüngsten fünfzig", () => {
    const viele = Array.from({ length: 60 }, (_, i) => wahl(`n${i}`, "2026-05-01", "alltag"));
    const alt = wahl("alt", "2024-01-01", "geraete");
    const r = buchungswahlFuer({ buchungswahl: [...viele, alt], kategorien: KATEGORIEN }, { kategorieId: "geraete" });
    expect(r[0].id).toBe("alt");
    expect(r).toHaveLength(50);
  });
});
