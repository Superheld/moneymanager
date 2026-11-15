// Einrichtungsstand — was dem Haushalt noch fehlt, damit die Zahlen der Übersicht stimmen.
//
// Die Ergebnisrechnung (`ergebnis.ts`) setzt voraus, dass jemand der App gesagt hat, was
// seine Pflichten sind (Verträge), was er sich im Monat erlaubt (Budgets) und wofür er
// zurücklegt (Rücklagen). Fehlt davon etwas, rechnet sie trotzdem — und zeigt dann jede
// Ausgabe unter „Ungeplant". Das ist richtig gerechnet und liest sich wie ein Fehler.
//
// Diese Datei beantwortet deshalb die Frage davor: WAS fehlt, in der Reihenfolge, in der
// man es am besten nachholt. Sie liegt quer in der Wurzel des Kerns, weil sie über fünf
// Bereiche hinwegsieht und zu keinem gehört.
//
// Sie schätzt nichts und schlägt nichts vor. Ein Schritt ist erledigt, wenn die Sache da
// ist — nicht, wenn sie gut ist. Ob drei Budgets genug sind, weiss nur, wer sie führt.

import { addTage, parseIso, toIso } from "./basis/datum";
import type { Zahlungsregel } from "./basis/zahlungsregel";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import type { Budget } from "./budgets/budget";

/**
 * Die Schritte, in der Reihenfolge, in der sie aufeinander aufbauen: ohne Konto keine
 * Buchung, ohne Buchung nichts zu sortieren, und erst sortierte Buchungen zeigen, welche
 * Verträge und Budgets es braucht.
 */
export const EINRICHTUNGSSCHRITTE = [
  "konto",
  "buchungen",
  "kategorien",
  "vertraege",
  "budgets",
  "ruecklagen",
] as const;
export type EinrichtungsschrittId = (typeof EINRICHTUNGSSCHRITTE)[number];

/**
 * `wartet` heisst: der Schritt davor fehlt noch. Ohne Buchungen gibt es keine ohne
 * Kategorie — das als „erledigt" zu zeigen, wäre ein Haken für nichts.
 */
export type Einrichtungsstatus = "erledigt" | "offen" | "wartet";

export interface Einrichtungsschritt {
  readonly id: EinrichtungsschrittId;
  readonly status: Einrichtungsstatus;
  /** Wie viele Dinge der Schritt betrifft (nur `kategorien`: Buchungen ohne Kategorie). */
  readonly anzahl?: number;
  /**
   * Ein freiwilliger Schritt hält die Einrichtung nicht offen. Rücklagen braucht nicht
   * jeder Haushalt; wer keine führt, soll deshalb nicht dauerhaft erinnert werden.
   */
  readonly freiwillig: boolean;
}

export interface Einrichtungsstand {
  readonly schritte: readonly Einrichtungsschritt[];
  /** Sind alle Schritte erledigt, die nicht freiwillig sind? */
  readonly fertig: boolean;
}

export interface EinrichtungEingabe {
  readonly kontenAnzahl: number;
  readonly buchungen: readonly IstBuchung[];
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  readonly ruecklagenAnzahl: number;
  readonly heute: string;
}

/**
 * Wie weit zurück nach Buchungen ohne Kategorie gesucht wird.
 *
 * Neunzig Tage, weil die Übersicht über den laufenden Monat spricht und die Analyse
 * selten weiter als ein Quartal zurück gelesen wird. Ein importierter Altbestand von
 * mehreren Jahren soll niemanden dazu zwingen, ihn ganz durchzusortieren, bevor die
 * Karte verschwindet.
 */
export const EINRICHTUNG_TAGE = 90;

/**
 * Hat die Buchung einen Anteil ohne Kategorie, der in die Ergebnisrechnung eingeht?
 *
 * Umbuchungen zählen nicht: sie tragen keine Kategorie und brauchen keine, weil sie
 * eigenes Geld bewegen (`einordnung.ts`).
 */
function ohneKategorie(b: IstBuchung): boolean {
  if (b.transferId || b.charakter === "Umschichtung") return false;
  return kategorieAnteile(b).some((a) => !a.kategorieId);
}

export function einrichtungsstand(e: EinrichtungEingabe): Einrichtungsstand {
  const ab = toIso(addTage(parseIso(e.heute), -EINRICHTUNG_TAGE));
  const hatBuchungen = e.buchungen.length > 0;
  const unsortiert = e.buchungen.filter((b) => b.datum >= ab && ohneKategorie(b)).length;
  const da = (ja: boolean): Einrichtungsstatus => (ja ? "erledigt" : "offen");

  const status: Record<EinrichtungsschrittId, Einrichtungsstatus> = {
    konto: da(e.kontenAnzahl > 0),
    buchungen: e.kontenAnzahl > 0 ? da(hatBuchungen) : "wartet",
    kategorien: hatBuchungen ? da(unsortiert === 0) : "wartet",
    // Eine Zahlungsregel entsteht nur zusammen mit einem Vertrag; gezählt wird sie und
    // nicht der Vertrag, weil erst die Regel eine Zeile in der Ergebnisrechnung bildet.
    vertraege: da(e.regeln.length > 0),
    budgets: da(e.budgets.length > 0),
    // Ein aufbauendes Budget ist dieselbe Sache in anderer Form (ein Topf mit Rate).
    ruecklagen: da(e.ruecklagenAnzahl > 0 || e.budgets.some((b) => b.art === "aufbauend")),
  };

  const schritte = EINRICHTUNGSSCHRITTE.map((id): Einrichtungsschritt => ({
    id,
    status: status[id],
    freiwillig: id === "ruecklagen",
    ...(id === "kategorien" && unsortiert > 0 ? { anzahl: unsortiert } : {}),
  }));
  return {
    schritte,
    fertig: schritte.every((s) => s.freiwillig || s.status === "erledigt"),
  };
}
