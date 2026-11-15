// Einordnung — was eine Buchung kaufmännisch IST. Eine Antwort für die ganze App.
//
// Bis 2026-11-15 beantwortete das jede Sicht selbst: die Monatskarte über Betragsnähe zu
// einem Plan-Posten, die Budgetliste über Kategorie und Vertragszuordnung, die Analyse
// über den Charakter. Dieselbe Buchung zählte deshalb an drei Stellen als drei
// verschiedene Dinge, und keine der Stellen wusste von den anderen.
//
// Hier steht die Frage EINMAL. Wer auswertet — Ergebnis, Budgets, Analyse, der
// Kontoauszug —, fragt hier und sortiert nicht selbst. Die Begriffe dazu stehen in
// `core/CLAUDE.md` unter „Auszahlung und Kosten".
//
// Eingeordnet wird der ANTEIL, nicht die Buchung: eine geteilte Buchung kann zur Hälfte
// laufende Kosten sein und zur anderen aus einem Topf kommen.
//
// Die Reihenfolge der Fragen ist die Regel, und sie ist dieselbe, die `budgetBuchungen`
// für den Verbrauch eines Budgets anlegt — sonst zeigte die Budgetliste einen Verbrauch,
// den die Ergebnisrechnung woanders verbucht:
//
//   1. Zwei Beine (`transferId`)  → Umbuchung; führt sie auf ein Vorsorgekonto, Vorsorge.
//   2. Umschichtung ohne Gegenbein → Vorsorge. Das Geld verlässt die erfassten Konten,
//      bleibt aber Vermögen (der Wertpapierkauf, die Tilgung).
//   3. Ertrag                      → Einnahme.
//   4. Aufwand mit Vertrag         → Fixkosten.
//   5. Aufwand, nicht budgetrelevant → Entnahme aus einer Rücklage, WENN für die
//      Buchung eine ausgebucht wurde; sonst ungeplant (ausserhalb der Budgets).
//   6. Kategorie unter einem Budget → laufende Kosten (monatlich) oder Entnahme aus
//      dem Topf (aufbauend).
//   7. sonst                       → ungeplant.
//
// **Schritt 5 fragt nach der AUSBUCHUNG, nicht nach `budgetrelevant` allein.** Das Feld
// sagt „zählt in kein Budget" und wird beim Ausbuchen gesetzt — aber auch von Hand.
// Zunächst galt es allein als „aus Erspartem bezahlt"; damit kostete eine von Hand
// markierte Ausgabe nie etwas, obwohl niemand dafür zurückgelegt hatte. Entnahme ist
// deshalb nur, wofür eine Rücklage ausgebucht wurde (`ruecklagenKaeufe`); deren Raten
// waren die Kosten davor.
//
// Keine Migration, kein neues Feld: die Einordnung ist ABGELEITET. Ein gespeicherter Wert
// könnte der Kategorie, dem Vertrag oder dem Budget widersprechen, aus denen er folgt.

import type { Cent } from "./basis/geld";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import { budgetKategorien, type Budget } from "./budgets/budget";
import type { Kategorie } from "./kategorien/kategorie";

export type Einordnungsart =
  | "einnahme"
  | "fixkosten"
  | "laufend"
  | "topf"
  | "ruecklage"
  | "vorsorge"
  | "umbuchung"
  | "ungeplant";

/** Ein eingeordneter Anteil einer Buchung. */
export interface Einordnung {
  readonly buchung: IstBuchung;
  /** Index des Anteils in der Buchung — mit `buchung.id` zusammen der Schlüssel. */
  readonly anteil: number;
  readonly kategorieId?: string;
  /** Vorzeichenbehaftet wie die Buchung (Abfluss negativ). */
  readonly betrag: Cent;
  readonly art: Einordnungsart;
  /** Bei `laufend` und `topf`: das Budget, das den Anteil trägt. */
  readonly budgetId?: string;
  /** Der Vertrag der Buchung, falls zugeordnet — bei jeder Art, nicht nur Fixkosten. */
  readonly vertragId?: string;
  /**
   * Hat die Buchung ein Gegenbein auf einem erfassten Konto? Dann ändert sie die Summe
   * aller Kontostände nicht. Bei `umbuchung` immer, bei `vorsorge` nur, wenn das Geld
   * auf ein eigenes Vorsorgekonto ging.
   */
  readonly intern: boolean;
}

export interface Einordnungskontext {
  readonly kategorien: readonly Kategorie[];
  readonly budgets: readonly Budget[];
  /**
   * Buchungs-ID → Vertrags-ID, nur für zugeordnete Buchungen. Pflichtfeld aus demselben
   * Grund wie `vertragsBuchungen` in der `BudgetSicht`: eine leere Abbildung ist eine
   * Aussage und muss hingeschrieben werden.
   */
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  /** Die Konten, die der Vorsorge dienen (`istVorsorgekonto`). */
  readonly vorsorgeKonten: ReadonlySet<string>;
  /**
   * Die Buchungen, mit denen eine Rücklage ausgebucht wurde.
   *
   * Nur sie gelten als Entnahme. `budgetrelevant === false` allein genügt seit
   * 2026-11-15 nicht mehr: das Feld sagt „zählt in kein Budget", und wer es von Hand
   * setzt, ohne dass eine Rücklage dahintersteht, hat damit nichts angespart. Eine
   * solche Ausgabe kostet ihren Monat (ungeplant) — sonst hätte sie nie etwas gekostet.
   */
  readonly ruecklagenKaeufe: ReadonlySet<string>;
}

/**
 * Baut die Einordnung für einen Bestand. Zurück kommt eine Funktion, weil die
 * Vorarbeit (welche Kategorie gehört welchem Budget) einmal anfällt und nicht je Buchung.
 */
export function einordner(kontext: Einordnungskontext): (b: IstBuchung) => Einordnung[] {
  const budgetJeKategorie = new Map<string, Budget>();
  for (const budget of kontext.budgets) {
    // `budgetKategorien` nimmt die Unterbäume eingebetteter Budgets heraus — jede
    // Kategorie gehört damit höchstens einem Budget, und die Reihenfolge ist egal.
    for (const id of budgetKategorien(budget, kontext.budgets, kontext.kategorien)) {
      budgetJeKategorie.set(id, budget);
    }
  }

  return (b) => {
    const vertragId = kontext.vertragJeBuchung.get(b.id);
    const intern = b.transferId != null;
    const alsGanzes = (art: Einordnungsart, i = intern): Einordnung[] =>
      kategorieAnteile(b).map((a, anteil) => ({
        buchung: b,
        anteil,
        kategorieId: a.kategorieId,
        betrag: a.betrag,
        art,
        vertragId,
        intern: i,
      }));

    if (intern) {
      const aufVorsorge =
        !!b.gegenkontoId &&
        kontext.vorsorgeKonten.has(b.gegenkontoId) &&
        !kontext.vorsorgeKonten.has(b.kontoId);
      return alsGanzes(aufVorsorge ? "vorsorge" : "umbuchung");
    }
    if (b.charakter === "Umschichtung") return alsGanzes("vorsorge");
    if (b.charakter === "Ertrag") return alsGanzes("einnahme");
    if (vertragId) return alsGanzes("fixkosten");
    if (b.budgetrelevant === false) {
      return alsGanzes(kontext.ruecklagenKaeufe.has(b.id) ? "ruecklage" : "ungeplant");
    }

    return kategorieAnteile(b).map((a, anteil): Einordnung => {
      const budget = a.kategorieId ? budgetJeKategorie.get(a.kategorieId) : undefined;
      return {
        buchung: b,
        anteil,
        kategorieId: a.kategorieId,
        betrag: a.betrag,
        art: !budget ? "ungeplant" : budget.art === "aufbauend" ? "topf" : "laufend",
        budgetId: budget?.id,
        vertragId,
        intern: false,
      };
    });
  };
}

/** Alle Anteile eines Bestands, eingeordnet. */
export function einordnen(
  buchungen: readonly IstBuchung[],
  kontext: Einordnungskontext,
): Einordnung[] {
  return buchungen.flatMap(einordner(kontext));
}
