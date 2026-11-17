// Was eine Rücklage von sich aus über ihre Kategorie und ihre Zuordnungen weiss — ohne
// Blick auf ein Budget.
//
// Die Abwägung zwischen beiden („trägt diese Buchung das Budget oder die Rücklage?")
// steht bereichsübergreifend in `../zustaendigkeit.ts`, weil sie keinem der beiden Bereiche
// gehört. Hier bleibt, was nur die Rücklage betrifft: welche Zuordnungen es gibt, an
// welchen Tagen sie ihre Kategorie trägt und welche Rücklagen zur Wahl stehen. Rücklagen
// kennen keine Budgets (`src/architektur.test.ts`, „Modulgrenzen").

import type { Kategorie } from "../kategorien/kategorie";
import type { Ruecklage } from "./ruecklage";
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
export function findetAm(r: Ruecklage, datum: string): boolean {
  if (!r.kategorieId) return false;
  if (r.beendetAm && datum > r.beendetAm) return false;
  if (r.findetAb) return datum >= r.findetAb;
  return ruecklagenart(r) === "fortlaufend";
}

/**
 * Die Rücklagen, denen ein Anteil mit dieser Kategorie zugeordnet werden darf: jede, die
 * an der Kategorie oder an einem ihrer Vorfahren hängt — an der Kategorie samt ihren
 * Unterkategorien, wie sie auch von selbst findet. Nächste Ebene zuerst.
 *
 * Eine Rücklage ohne Kategorie steht nie darin (Teil B des Entwurfs, Abschnitt 1): sie
 * findet nur über ihre Ausbuchung, und eine Zuordnung zu ihr wäre eine zweite, stille
 * Regel daneben. Beendete gehören nicht dazu — ihnen wird nichts mehr zugeordnet.
 *
 * Die eine Stelle für die Prüfung an der Anwendungsgrenze (`ruecklageZuordnen`) und für
 * die Auswahl im Buchungsdialog: was man sieht, ist genau das, was sich speichern lässt.
 */
export function waehlbareRuecklagen(
  kategorien: readonly Kategorie[],
  ruecklagen: readonly Ruecklage[],
  kategorieId: string | undefined,
): Ruecklage[] {
  if (!kategorieId) return [];
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  const raus: Ruecklage[] = [];
  let knoten: string | undefined = kategorieId;
  for (let i = 0; knoten && i < 100; i++) {
    for (const r of ruecklagen) if (!r.beendetAm && r.kategorieId === knoten) raus.push(r);
    knoten = eltern.get(knoten);
  }
  return raus;
}
