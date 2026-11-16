// Zuständigkeit — wer einen Anteil einer Ausgabe trägt: ein monatliches Budget, eine
// Rücklage, mehrere (dann wartet er auf eine Zuordnung) oder niemand.
//
// Seit Paket 3 des Umbaus fragen hier die Einordnung (`core/einordnung.ts`) UND der
// Verbrauch eines Budgets (`budgetBuchungen`) — EINE Antwort für beide, sonst rechnete der
// Verbrauch eines Dachs anders als das Ergebnis.
//
// Gefragt wird nur für Ausgaben, die keine Umbuchung, keine Umschichtung, kein Ertrag und
// keine Vertragszahlung sind: diese Schritte bleiben, wie sie sind, und kommen vorher.

import type { Budget } from "../budgets/budget";
import type { Kategorie } from "../kategorien/kategorie";
import type { Ruecklage, Ruecklagenzyklus } from "./ruecklage";
import { ruecklagenart } from "./topf";

/**
 * Eine ausdrückliche Zuordnung: welche Rücklage einen Anteil einer Buchung trägt (seit
 * Migration 79, Tabelle `ruecklage_zuordnung`).
 *
 * Gebraucht wird sie nur, wo die Kategorie allein nicht entscheidet — wenn mehrere
 * Rücklagen an ihr hängen. Der Anteil wird über seine KATEGORIE benannt und nicht über
 * seinen Index: die Aufteilungen bekommen bei jedem Speichern neue IDs, die Kategorie
 * bleibt. Ändert jemand sie, passt die Zuordnung zu keinem Anteil mehr, und die Buchung
 * wird neu eingeordnet — eine neue Kategorie ist eine neue Frage.
 */
export interface Ruecklagenzuordnung {
  readonly istbuchungId: string;
  /** Der Anteil mit dieser Kategorie; fehlt sie, gilt die Zuordnung der ganzen Buchung. */
  readonly kategorieId?: string;
  /** Fehlt sie, heisst das „ausdrücklich keine Rücklage" — nicht „noch offen". */
  readonly ruecklageId?: string;
}

/** Der Anteil, nach dem gefragt wird. */
export interface Anteilsfrage {
  readonly istbuchungId: string;
  readonly kategorieId?: string;
  readonly datum: string;
  /** Wie an der Buchung; fehlt es, ist sie budgetrelevant (Vorgabe 1). */
  readonly budgetrelevant?: boolean;
}

export type Zustaendig =
  /** Ein monatliches Budget trägt ihn: laufende Kosten. */
  | { readonly art: "laufend"; readonly budgetId: string }
  /** Eine Rücklage trägt ihn: eine Entnahme nach der max-Regel. */
  | { readonly art: "ruecklage"; readonly ruecklageId: string }
  /**
   * Eine Entnahme über eine ALTE Verknüpfung: eine Ausbuchung nennt die Buchung. Ihre
   * Kosten rechnet `altabschlussKosten`, nicht die max-Regel — deshalb eine eigene Art.
   */
  | { readonly art: "ausgebucht"; readonly ruecklageIds: readonly string[] }
  /** Mehrere Rücklagen kämen in Frage: bis jemand zuordnet, ungeplant und offen. */
  | { readonly art: "wartet"; readonly kandidaten: readonly string[] }
  | { readonly art: "ungeplant" };

/**
 * Trägt die Rücklage ihre Kategorie an diesem Tag?
 *
 * Nur in ihrem Fenster [`findetAb`, `beendetAm`]. Fehlt `findetAb`, unterscheidet die
 * Sorte: eine `abschliessend`e findet dann gar nichts über die Kategorie (eine Rücklage
 * von Hand vor der Umstellung), eine `fortlaufend`e gilt „ohne Anfang" — so behandelt die
 * Einordnung heute ein aufbauendes Budget, auch VOR seinem Start. Dass eine solche
 * Buchung dann Entnahme ist und trotzdem nichts kostet (die Kosten zählen erst ab
 * `beginn`), ist ein bekannter Befund und wird bewusst nachgebildet, nicht behoben.
 */
function traegtAm(r: Ruecklage, datum: string): boolean {
  if (!r.kategorieId) return false;
  if (r.beendetAm && datum > r.beendetAm) return false;
  if (r.findetAb) return datum >= r.findetAb;
  return ruecklagenart(r) === "fortlaufend";
}

/**
 * Baut die Zuständigkeit für einen Bestand; zurück kommt eine Funktion, weil die Vorarbeit
 * (wer hängt an welcher Kategorie) einmal anfällt und nicht je Anteil.
 *
 * `ruecklagen` sind ALLE, beendete eingeschlossen: eine beendete trägt ihre Kategorie bis
 * zu ihrem Ende, und ein Monat davor soll nicht anders aussehen, nur weil sie inzwischen
 * beendet ist. `budgets` sind alle: ein monatliches trägt als laufende Kosten, ein
 * aufbauendes als Rücklage mit seiner eigenen ID. Am selben Knoten gehen beide jeder
 * Rücklage von Hand vor — das monatliche, weil eine neue Rücklage dort nicht angelegt
 * werden darf (der Altfall), das aufbauende bis Paket 4 aus dem Grund oben.
 *
 * Die Reihenfolge (Teil B des Entwurfs, Abschnitt 2):
 *
 *   1. Ausdrückliche Zuordnung — erst die für die Kategorie des Anteils, dann die für die
 *      ganze Buchung. Eine Zeile ohne Rücklage heisst „ausdrücklich keine": weiter, aber
 *      ohne Rücklagen.
 *   2. `budgetrelevant = false`: mit alter Verknüpfung über eine Ausbuchung →
 *      `ausgebucht`, sonst `ungeplant` (eine von Hand aus den Budgets genommene Ausgabe
 *      kostet ihren Monat).
 *   3. Der nächste Vorfahr der Kategorie, an dem etwas hängt. Ein Budget gewinnt dort
 *      gegen eine Rücklage von Hand (siehe oben).
 *      Eine Rücklage hängt dort nur, wenn ihr Fenster den Tag enthält — sonst fällt der
 *      Anteil zum Dach durch, wie heute vor der Umstellung. Eine → `ruecklage`, mehrere
 *      → `wartet`.
 *   4. Sonst `ungeplant`.
 *
 * Beispiel: Freizeit > Urlaub, an Freizeit ein monatliches Budget, an Urlaub zwei
 * Rücklagen ab 01.01. Eine Urlaubsbuchung ohne Zuordnung wartet auf beide; mit Zuordnung
 * gehört sie der einen; am 20.12. des Vorjahres gehört sie dem Budget Freizeit.
 */
export function zustaendigkeit(
  kategorien: readonly Kategorie[],
  budgets: readonly Budget[],
  ruecklagen: readonly Ruecklage[],
  zuordnungen: readonly Ruecklagenzuordnung[],
  abschluesse: readonly Ruecklagenzyklus[],
): (anteil: Anteilsfrage) => Zustaendig {
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  // Monatliche UND aufbauende: ein aufbauendes Budget ist bis Migration 81 noch ein Budget
  // und trägt seine Kategorie VOR jeder Rücklage von Hand am selben Knoten. Liefe es als
  // gewöhnliche Rücklage mit, wartete jede Buchung dort auf eine Zuordnung, die sich nicht
  // speichern lässt — `ruecklage_zuordnung` verweist auf `ruecklage`, und dort steht das
  // Budget erst ab Paket 4.
  const budgetAn = new Map<string, Budget>();
  for (const b of budgets) budgetAn.set(b.kategorieId, b);
  const ruecklagenAn = new Map<string, Ruecklage[]>();
  for (const r of ruecklagen) {
    if (!r.kategorieId) continue;
    const liste = ruecklagenAn.get(r.kategorieId);
    if (liste) liste.push(r);
    else ruecklagenAn.set(r.kategorieId, [r]);
  }
  const bekannt = new Set(ruecklagen.map((r) => r.id));
  const zuordnung = new Map<string, Ruecklagenzuordnung>();
  for (const z of zuordnungen) zuordnung.set(`${z.istbuchungId}\u0000${z.kategorieId ?? ""}`, z);
  const ausgebucht = new Map<string, string[]>();
  for (const a of abschluesse) {
    if (!a.istbuchungId) continue;
    const liste = ausgebucht.get(a.istbuchungId);
    if (liste) liste.push(a.ruecklageId);
    else ausgebucht.set(a.istbuchungId, [a.ruecklageId]);
  }

  return (anteil) => {
    const ausdruecklich =
      (anteil.kategorieId ? zuordnung.get(`${anteil.istbuchungId}\u0000${anteil.kategorieId}`) : undefined) ??
      zuordnung.get(`${anteil.istbuchungId}\u0000`);
    // Eine Zuordnung auf eine Rücklage, die es nicht (mehr) gibt, sagt nichts — CASCADE
    // räumt sie in der App ab, hier wird sie nur nicht geglaubt.
    if (ausdruecklich?.ruecklageId && bekannt.has(ausdruecklich.ruecklageId)) {
      return { art: "ruecklage", ruecklageId: ausdruecklich.ruecklageId };
    }
    const ohneRuecklagen = !!ausdruecklich && !ausdruecklich.ruecklageId;

    // Eine alte Verknüpfung gilt nur, solange die Buchung aus den Budgets genommen ist —
    // so fragte die Einordnung vor der Umstellung, und wer einen ausgebuchten Kauf von
    // Hand wieder budgetrelevant stellt, hat ihn damit zurück in seine Kategorie gelegt.
    if (anteil.budgetrelevant === false) {
      const alt = ausgebucht.get(anteil.istbuchungId);
      return alt ? { art: "ausgebucht", ruecklageIds: alt } : { art: "ungeplant" };
    }

    let knoten = anteil.kategorieId;
    // Der Zähler schützt gegen einen Zyklus im Baum, wie in `elternBudget`.
    for (let i = 0; knoten && i < 100; i++) {
      const budget = budgetAn.get(knoten);
      if (budget?.art === "monatlich") return { art: "laufend", budgetId: budget.id };
      // „Ausdrücklich keine Rücklage" gilt auch für das aufbauende Budget: für den Nutzer
      // ist es eine Rücklage.
      if (budget && !ohneRuecklagen) return { art: "ruecklage", ruecklageId: budget.id };
      const kandidaten = ohneRuecklagen
        ? []
        : (ruecklagenAn.get(knoten) ?? []).filter((r) => traegtAm(r, anteil.datum)).map((r) => r.id);
      if (kandidaten.length === 1) return { art: "ruecklage", ruecklageId: kandidaten[0] };
      if (kandidaten.length > 1) return { art: "wartet", kandidaten };
      knoten = eltern.get(knoten);
    }
    return { art: "ungeplant" };
  };
}
