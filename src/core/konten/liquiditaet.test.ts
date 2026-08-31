// Läuft ein Konto ins Minus? Die eine Frage, aus der Handlungsbedarf entsteht.

import { describe, expect, it } from "vitest";
import { handlungsbedarf, liquiditaetsvorschau } from "./liquiditaet";
import type { Zahlungskonto } from "./konto";
import type { Zahlungsregel } from "../basis/zahlungsregel";
import type { Budget, BudgetSicht } from "../budgets/budget";
import type { Kategorie } from "../kategorien/kategorie";

const HEUTE = "2026-06-01";

const konto = (over: Partial<Zahlungskonto> = {}): Zahlungskonto => ({
  id: "giro",
  bezeichnung: "Giro",
  typ: "Giro",
  klasse: "liquide",
  inhaberIds: [],
  saldo: 100000,
  ...over,
});

const regel = (over: Partial<Zahlungsregel> = {}): Zahlungsregel => ({
  id: "r1",
  bezeichnung: "Miete",
  betrag: -80000,
  rhythmus: "monatlich",
  startdatum: "2026-06-05",
  charakter: "Aufwand",
  kontoId: "giro",
  ...over,
});

const KATEGORIEN: Kategorie[] = [{ id: "leben", name: "Lebenshaltung", defaultCharakter: "Aufwand" }];

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: "b1",
  kategorieId: "leben",
  kontoId: "giro",
  art: "monatlich",
  start: "2026-01-01",
  betraege: [{ abMonat: "2026-01", betrag: 30000 }],
  ...over,
});

const sicht = (budgets: Budget[]): BudgetSicht => ({
  buchungen: [],
  kategorien: KATEGORIEN,
  budgets,
  vertragsBuchungen: new Set(),
});

describe("liquiditaetsvorschau — die feste Linie", () => {
  it("startet beim realen Kontostand", () => {
    const [v] = liquiditaetsvorschau({ konten: [konto()], buchungen: [], regeln: [], heute: HEUTE, tage: 30 });
    expect(v.start).toBe(100000);
    expect(v.fest.minusAb).toBeUndefined();
  });

  it("zieht die fällige Vertragsrate am richtigen Tag ab", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [regel()], heute: HEUTE, tage: 30,
    });
    expect(v.fest.tiefstand).toBe(20000);
    expect(v.fest.tiefstandAm).toBe("2026-06-05");
  });

  it("meldet den ersten Tag im Minus", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto({ saldo: 50000 })], buchungen: [], regeln: [regel()], heute: HEUTE, tage: 30,
    });
    expect(v.fest.minusAb).toBe("2026-06-05");
    expect(v.fest.tiefstand).toBe(-30000);
  });

  /**
   * Nur die Abflussseite einer geplanten Umbuchung zu rechnen hiesse, das Zielkonto
   * ärmer zu zeigen, als es sein wird — und genau das Rücklagenkonto sähe nach
   * Handlungsbedarf aus, auf das gerade eingezahlt wird.
   */
  it("rechnet eine geplante Umbuchung auf BEIDEN Konten", () => {
    const umbuchung = regel({
      betrag: -20000,
      charakter: "Umschichtung",
      kontoId: "giro",
      gegenkontoId: "tagesgeld",
    });
    const [giro, tagesgeld] = liquiditaetsvorschau({
      konten: [konto(), konto({ id: "tagesgeld", klasse: "ruecklage", saldo: 0 })],
      buchungen: [],
      regeln: [umbuchung],
      heute: HEUTE,
      tage: 30,
    });
    expect(giro.fest.tiefstand).toBe(80000);
    // Das Zielkonto steigt — sein Tiefstand ist der Startwert, nicht ein Abfluss.
    expect(tagesgeld.fest.tiefstand).toBe(0);
    expect(tagesgeld.fest.minusAb).toBeUndefined();
  });

  it("nimmt nur Termine im Fenster", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [regel({ startdatum: "2026-09-05" })], heute: HEUTE, tage: 30,
    });
    expect(v.fest.tiefstand).toBe(100000);
  });
});

describe("liquiditaetsvorschau — die erwartete Linie", () => {
  it("verteilt den Budgetrest über die verbleibenden Tage", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [],
      budgetsicht: sicht([budget()]),
      heute: HEUTE, tage: 29, // bis zum 30.06.
    });
    // 300 € auf 30 Junitage → 10 €/Tag; der laufende Tag zählt mit, also 30 Abzüge.
    expect(v.erwartet.tiefstand).toBe(70000);
    expect(v.fest.tiefstand).toBe(100000);
  });

  /**
   * Seine Rate wird nicht ausgegeben, sie bleibt liegen. Sie mitzurechnen hiesse, Geld
   * abfliessen zu lassen, das auf dem Konto bleibt.
   */
  it("lässt ein aufbauendes Budget aussen vor", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [],
      budgetsicht: sicht([budget({ art: "aufbauend" })]),
      heute: HEUTE, tage: 29,
    });
    expect(v.erwartet.tiefstand).toBe(100000);
  });

  it("ist ohne Budgetsicht identisch mit der festen Linie", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [regel()], heute: HEUTE, tage: 30,
    });
    expect(v.erwartet).toEqual(v.fest);
  });

  /**
   * Was diesen Monat schon ausgegeben wurde, steht im Kontostand. Es noch einmal aus dem
   * Budget abzuziehen zöge es zweimal ab — und aus einem gesunden Konto würde eine
   * Warnung.
   */
  it("zieht im laufenden Monat nur den offenen Rest ab", () => {
    const verbraucht = {
      buchungen: [
        { id: "x", datum: "2026-06-01", betrag: -24000, kontoId: "giro", kategorieId: "leben", charakter: "Aufwand" as const, quelle: "manuell" as const },
      ],
      kategorien: KATEGORIEN,
      budgets: [budget()],
      vertragsBuchungen: new Set<string>(),
    };
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [],
      budgetsicht: verbraucht,
      heute: HEUTE, tage: 29,
    });
    // Von 300 € sind noch 60 € offen → 2 €/Tag über 30 Tage. Der Kontostand bleibt bei
    // 1000 €: die verbrauchte Buchung steht in der Budgetsicht, nicht im Ledger.
    expect(v.erwartet.tiefstand).toBe(94000);
  });

  it("nimmt ein Budget eines anderen Kontos nicht mit", () => {
    const [v] = liquiditaetsvorschau({
      konten: [konto()], buchungen: [], regeln: [],
      budgetsicht: sicht([budget({ kontoId: "anderes" })]),
      heute: HEUTE, tage: 29,
    });
    expect(v.erwartet.tiefstand).toBe(100000);
  });
});

describe("handlungsbedarf", () => {
  // `verlauf` bleibt hier leer: `handlungsbedarf` sortiert und filtert nur, es liest die
  // Linie nicht. Sie mit zu erfinden hiesse, den Test an etwas zu binden, das er nicht prüft.
  const ok = { kontoId: "a", start: 0, fest: { tiefstand: 100, tiefstandAm: HEUTE }, erwartet: { tiefstand: 50, tiefstandAm: HEUTE } , verlauf: [] };
  const weich = { kontoId: "b", start: 0, fest: { tiefstand: 100, tiefstandAm: HEUTE }, erwartet: { tiefstand: -10, tiefstandAm: "2026-06-20", minusAb: "2026-06-20" } , verlauf: [] };
  const hart = { kontoId: "c", start: 0, fest: { tiefstand: -50, tiefstandAm: "2026-06-25", minusAb: "2026-06-25" }, erwartet: { tiefstand: -80, tiefstandAm: "2026-06-25", minusAb: "2026-06-25" } , verlauf: [] };

  it("nennt nur Konten, die ins Minus laufen", () => {
    expect(handlungsbedarf([ok, weich]).map((v) => v.kontoId)).toEqual(["b"]);
  });

  // Das eine ist ein Termin, das andere eine Annahme — und beim Ansehen zählt zuerst,
  // was ohne eigenes Zutun eintritt.
  it("stellt das sichere Minus vor das erwartete", () => {
    expect(handlungsbedarf([weich, hart]).map((v) => v.kontoId)).toEqual(["c", "b"]);
  });

  it("meldet nichts, wenn nichts ansteht", () => {
    expect(handlungsbedarf([ok])).toEqual([]);
  });
});
