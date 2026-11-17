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
//
// Direkt in `src/application/`: die Namen kommen aus Budgets, Rücklagen und Verträgen, und
// die Datei wird von Kontoauszug, Buchungsdialog und Rücklagen gelesen. Der Dialog
// bekommt von hier nur fertige Namen; der Typ `Budget` bleibt in dieser Datei, und der
// Bereich Rücklagen, der den Dialog öffnet, kennt dadurch keine Budgets.

import {
  einordner,
  einordnungskontext,
  type Ruecklage,
  type Ruecklagenzuordnung,
  type Ruecklagenzyklus,
  type Budget,
  type Einordnungsart,
  type IstBuchung,
  type Kategorie,
  type Vertrag,
  type Vertragszuordnung,
  type Zahlungskonto,
} from "../core";

/** Eine Einordnung, wie sie angezeigt wird — je Buchung eine oder (geteilt) mehrere. */
export interface Buchungseinordnung {
  readonly art: Einordnungsart;
  /**
   * Der Name dessen, was den Anteil trägt: bei `laufend` und bei einer Rücklage aus einem
   * aufbauenden Budget der Name seiner Kategorie, bei einer Rücklage von Hand ihre
   * Bezeichnung. Fehlt, wenn es nichts zu benennen gibt (eine alte Ausbuchung) oder die
   * Kategorie nicht mehr existiert.
   */
  readonly budgetName?: string;
  /** Bei `ruecklage`: welche Rücklage den Anteil trägt (bei einer alten Ausbuchung keine). */
  readonly ruecklageId?: string;
  /**
   * Bei `ungeplant`: die Rücklagen, zwischen denen zu wählen ist (`Einordnung.wartetAuf`).
   * Gesetzt heisst: die Buchung wartet auf eine Zuordnung.
   */
  readonly wartetAuf?: readonly string[];
  /** Die Kategorie des Anteils — eine Zuordnung gilt je Anteil, benannt über sie. */
  readonly kategorieId?: string;
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
  /** Die laufenden Rücklagen. */
  readonly ruecklagen: readonly Ruecklage[];
  /** Die beendeten — eine beendete trägt ihre Kategorie bis zu ihrem Ende. */
  readonly beendete: readonly Ruecklage[];
  readonly ruecklagenzuordnungen: readonly Ruecklagenzuordnung[];
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
      ruecklagen: e.ruecklagen,
      beendete: e.beendete,
      ruecklagenzuordnungen: e.ruecklagenzuordnungen,
    }),
  );

  const kategorieNamen = new Map(e.kategorien.map((k) => [k.id, k.name]));
  const budgetNamen = new Map<string, string | undefined>(e.budgets.map((b) => [b.id, kategorieNamen.get(b.kategorieId)]));
  const ruecklagenNamen = new Map([...e.ruecklagen, ...e.beendete].map((r) => [r.id, r.bezeichnung]));
  const anbieter = new Map(e.vertraege.map((v) => [v.id, v.anbieter]));

  const ergebnis = new Map<string, readonly Buchungseinordnung[]>();
  for (const buchung of e.buchungen) {
    const gesehen = new Set<string>();
    const liste: Buchungseinordnung[] = [];
    for (const x of ordne(buchung)) {
      // Art UND Träger: zwei Anteile aus zwei verschiedenen Rücklagen sind zwei Aussagen —
      // und ein wartender Anteil ist eine eigene, weil an ihm etwas zu tun ist.
      const traeger = x.ruecklageId ?? x.budgetId ?? "";
      const schluessel = `${x.art}|${traeger}|${x.wartetAuf ? `wartet:${x.kategorieId ?? ""}` : ""}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      liste.push({
        art: x.art,
        budgetName: x.budgetId ? budgetNamen.get(x.budgetId) : x.ruecklageId ? ruecklagenNamen.get(x.ruecklageId) : undefined,
        vertragsname: x.vertragId ? anbieter.get(x.vertragId) : undefined,
        intern: x.intern,
        // Nur, wo es etwas sagt: die Rücklage, die trägt, und beim Warten die Wahl samt dem
        // Anteil, dem sie gilt.
        ...(x.ruecklageId ? { ruecklageId: x.ruecklageId } : {}),
        ...(x.wartetAuf ? { wartetAuf: x.wartetAuf, kategorieId: x.kategorieId } : {}),
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
