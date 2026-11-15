// Die Einordnung einer Buchung, wie sie in einer Zeile und im Dialog steht.
//
// **Hier wird nichts sortiert.** Was eine Buchung IST, sagt allein `core/einordnung.ts`
// (`einordner`), mit demselben Kontext, aus dem die Ergebnisrechnung der Übersicht
// rechnet (`einordnungskontext`). Diese Datei macht daraus nur das, was eine Oberfläche
// zeigen kann: die Art, dazu die NAMEN von Budget und Vertrag statt ihrer Schlüssel.
//
// Der Grund für die Strenge: der Kontoauszug ist die Stelle, an der jemand nachsieht,
// WARUM eine Zahl in der Übersicht so aussieht. Sortierte er selbst, stünde an der Zeile
// irgendwann „Laufende Kosten", während die Ergebnisrechnung sie als Fixkosten zählt —
// und dann erklärte die Zeile eine Rechnung, die es nicht gibt.
//
// Eingeordnet wird der ANTEIL, nicht die Buchung. Eine geteilte Buchung kann deshalb
// mehrere Einordnungen tragen; heraus kommen die VERSCHIEDENEN, in der Reihenfolge der
// Anteile. Zwei Anteile, die beide aus demselben Budget kommen, sind eine Aussage und
// stehen einmal da.

import {
  einordner,
  einordnungskontext,
  type Ruecklagenzyklus,
  type Budget,
  type Einordnungsart,
  type IstBuchung,
  type Kategorie,
  type Vertrag,
  type Vertragszuordnung,
  type Zahlungskonto,
} from "../../core";

/** Eine Einordnung, wie sie angezeigt wird — je Buchung eine oder (geteilt) mehrere. */
export interface Buchungseinordnung {
  readonly art: Einordnungsart;
  /**
   * Der Name des tragenden Budgets, also der seiner Kategorie — bei `laufend` und `topf`.
   * Fehlt, wenn die Kategorie des Budgets nicht mehr existiert.
   */
  readonly budgetName?: string;
  /**
   * Der Anbieter des zugeordneten Vertrags. Bei `fixkosten` ist er die Begründung; er
   * fehlt dort nur, wenn die Zuordnung auf einen Vertrag zeigt, den es nicht mehr gibt.
   */
  readonly vertragsname?: string;
  /**
   * Hat die Buchung ein Gegenbein auf einem erfassten Konto? Unterscheidet bei `vorsorge`
   * die Überweisung auf ein Vorsorgekonto von der Umschichtung, die die App verlässt —
   * dieselbe Art, zwei verschiedene Begründungen.
   */
  readonly intern: boolean;
}

export interface EinordnungssichtEingabe {
  readonly buchungen: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  readonly budgets: readonly Budget[];
  readonly konten: readonly Zahlungskonto[];
  /** Roh aus `VertragszuordnungRepository.alle()`; gezählt werden nur die mit `vertragId`. */
  readonly zuordnungen: readonly Vertragszuordnung[];
  readonly vertraege: readonly Vertrag[];
  /** Roh aus `RuecklagenRepository.ausbuchungen()` — welche Käufe eine Rücklage trug. */
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
}

const LEER: readonly Buchungseinordnung[] = [];

/**
 * Buchungs-ID → ihre Einordnungen. Jede Buchung des Bestands hat einen Eintrag.
 *
 * Die Vertragszuordnung wird genau so gelesen wie in `uebersichtLaden`: jede Zuordnung
 * mit `vertragId` zählt, auch wenn der Vertrag dahinter fehlt. Wer hier strenger filterte
 * (wie die Vertragspille im Auszug, die ohne Namen nichts zu zeigen hat), bekäme für
 * dieselbe Buchung eine andere Art als die Ergebnisrechnung.
 */
export function einordnungJeBuchung(
  e: EinordnungssichtEingabe,
): ReadonlyMap<string, readonly Buchungseinordnung[]> {
  const vertragJeBuchung = new Map<string, string>();
  for (const z of e.zuordnungen) if (z.vertragId) vertragJeBuchung.set(z.istbuchungId, z.vertragId);

  const ordne = einordner(
    einordnungskontext({
      kategorien: e.kategorien,
      budgets: e.budgets,
      konten: e.konten,
      vertragJeBuchung,
      ausbuchungen: e.ausbuchungen,
    }),
  );

  const kategorieNamen = new Map(e.kategorien.map((k) => [k.id, k.name]));
  const budgetNamen = new Map(e.budgets.map((b) => [b.id, kategorieNamen.get(b.kategorieId)]));
  const anbieter = new Map(e.vertraege.map((v) => [v.id, v.anbieter]));

  const ergebnis = new Map<string, readonly Buchungseinordnung[]>();
  for (const buchung of e.buchungen) {
    const gesehen = new Set<string>();
    const liste: Buchungseinordnung[] = [];
    for (const x of ordne(buchung)) {
      // Art UND Budget: zwei Anteile aus zwei verschiedenen Töpfen sind zwei Aussagen.
      const schluessel = `${x.art}|${x.budgetId ?? ""}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      liste.push({
        art: x.art,
        budgetName: x.budgetId ? budgetNamen.get(x.budgetId) : undefined,
        vertragsname: x.vertragId ? anbieter.get(x.vertragId) : undefined,
        intern: x.intern,
      });
    }
    ergebnis.set(buchung.id, liste);
  }
  return ergebnis;
}

/** Die Einordnungen einer Buchung aus der Abbildung — leer, wenn sie dort (noch) fehlt. */
export function einordnungVon(
  einordnungen: ReadonlyMap<string, readonly Buchungseinordnung[]>,
  buchungId: string | undefined,
): readonly Buchungseinordnung[] {
  return (buchungId ? einordnungen.get(buchungId) : undefined) ?? LEER;
}
