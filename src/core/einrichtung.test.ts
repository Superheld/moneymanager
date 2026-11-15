// Der Einrichtungsstand — was noch fehlt, und in welcher Reihenfolge.

import { describe, expect, it } from "vitest";
import type { Zahlungsregel } from "./basis/zahlungsregel";
import type { IstBuchung } from "./buchung/istbuchung";
import type { Budget } from "./budgets/budget";
import { einrichtungsstand, type EinrichtungEingabe, type EinrichtungsschrittId } from "./einrichtung";

const HEUTE = "2025-06-15";

let laufend = 0;
function ist(datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: `i${++laufend}`,
    datum,
    betrag,
    kontoId: "giro",
    charakter: betrag >= 0 ? "Ertrag" : "Aufwand",
    quelle: "import",
    ...over,
  };
}

const REGEL = { id: "r1" } as Zahlungsregel;
const budget = (art: Budget["art"]): Budget => ({ id: `b-${art}`, art }) as Budget;

function eingabe(over: Partial<EinrichtungEingabe> = {}): EinrichtungEingabe {
  return { kontenAnzahl: 1, buchungen: [], regeln: [], budgets: [], ruecklagenAnzahl: 0, heute: HEUTE, ...over };
}

function status(e: EinrichtungEingabe, id: EinrichtungsschrittId) {
  return einrichtungsstand(e).schritte.find((s) => s.id === id)!;
}

describe("einrichtungsstand", () => {
  it("lässt im leeren Haushalt alles warten, was ein Konto oder Buchungen braucht", () => {
    const e = eingabe({ kontenAnzahl: 0 });
    expect(status(e, "konto").status).toBe("offen");
    expect(status(e, "buchungen").status).toBe("wartet");
    expect(status(e, "kategorien").status).toBe("wartet");
    expect(einrichtungsstand(e).fertig).toBe(false);
  });

  it("zählt Buchungen ohne Kategorie, auch den Teil eines Splits", () => {
    const e = eingabe({
      buchungen: [
        ist("2025-06-01", -1000),
        ist("2025-06-02", -2000, { kategorieId: "k" }),
        ist("2025-06-03", -3000, {
          kategorieId: "k",
          aufteilungen: [{ betrag: -1000, kategorieId: "k" }, { betrag: -2000 }],
        } as Partial<IstBuchung>),
      ],
    });
    expect(status(e, "kategorien")).toMatchObject({ status: "offen", anzahl: 2 });
  });

  it("verlangt von einer Umbuchung keine Kategorie", () => {
    const e = eingabe({
      buchungen: [
        ist("2025-06-01", -5000, { transferId: "t1", charakter: "Umschichtung" }),
        ist("2025-06-01", -5000, { charakter: "Umschichtung" }),
      ],
    });
    expect(status(e, "kategorien").status).toBe("erledigt");
  });

  it("sieht über den Altbestand hinweg", () => {
    const e = eingabe({ buchungen: [ist("2024-01-10", -1000), ist("2025-06-01", -1000, { kategorieId: "k" })] });
    expect(status(e, "kategorien").status).toBe("erledigt");
  });

  it("ist fertig, sobald Konto, Buchungen, Kategorien, Verträge und Budgets stehen", () => {
    const e = eingabe({
      buchungen: [ist("2025-06-01", -1000, { kategorieId: "k" })],
      regeln: [REGEL],
      budgets: [budget("monatlich")],
    });
    const stand = einrichtungsstand(e);
    // Die Rücklage fehlt noch, hält die Einrichtung aber nicht offen.
    expect(status(e, "ruecklagen")).toMatchObject({ status: "offen", freiwillig: true });
    expect(stand.fertig).toBe(true);
  });

  it("nimmt ein aufbauendes Budget als Rücklage", () => {
    expect(status(eingabe({ budgets: [budget("aufbauend")] }), "ruecklagen").status).toBe("erledigt");
    // … und nicht als Budget: der Bereich Budgets zeigt es nicht mehr.
    expect(status(eingabe({ budgets: [budget("aufbauend")] }), "budgets").status).toBe("offen");
    expect(status(eingabe({ ruecklagenAnzahl: 1 }), "ruecklagen").status).toBe("erledigt");
  });

  it("nennt den ersten offenen Schritt als nächsten, solange die Einrichtung nicht fertig ist", () => {
    expect(einrichtungsstand(eingabe({ kontenAnzahl: 0 })).naechster?.id).toBe("konto");
    expect(einrichtungsstand(eingabe()).naechster?.id).toBe("buchungen");
    // Ohne Kategorie ist der nächste Schritt das Sortieren, nicht der Vertrag danach.
    expect(einrichtungsstand(eingabe({ buchungen: [ist("2025-06-01", -1000)] })).naechster?.id).toBe("kategorien");
  });

  it("nennt keinen nächsten Schritt, wenn nur noch Freiwilliges fehlt", () => {
    const stand = einrichtungsstand(
      eingabe({ buchungen: [ist("2025-06-01", -1000, { kategorieId: "k" })], regeln: [REGEL], budgets: [budget("monatlich")] }),
    );
    expect(stand.fertig).toBe(true);
    expect(stand.naechster).toBeUndefined();
  });
});
