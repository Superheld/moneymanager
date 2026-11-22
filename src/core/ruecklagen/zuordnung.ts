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

/**
 * Die Rücklagen, denen ein Anteil AUSSERHALB ihrer Kategorie zugeordnet werden darf (seit
 * 2026-11-22, Nachtrag zu ADR-0006): jede, die abgeschlossen wird, noch läuft, eine
 * Kategorie hat und nicht schon über `waehlbareRuecklagen` zur Wahl steht — und deren
 * laufender Zyklus am Tag der Buchung schon begonnen hat. Nach Name.
 *
 * Der Fall dahinter: Fernseher und Rechner stehen beide unter „Elektronik", der Kauf des
 * Fernsehers soll aber die Rücklage „Fernseher" belasten und nicht, was an „Elektronik"
 * hängt. Die Zuordnung gewinnt in `zustaendigkeit` ohnehin vor allem anderen; gesperrt
 * war bis dahin nur die Wahl.
 *
 * Drei Grenzen, alle konservativ:
 *
 *   • **Nur `abschliessend`.** Eine Rücklage, die weiterläuft, trägt eine Art von Ausgaben
 *     auf Dauer (Reparaturen) und findet sie über ihre Kategorie; einzelne Käufe von
 *     woanders hineinzuziehen, machte ihren Stand zu einer Sammlung von Ausnahmen, die
 *     niemand mehr nachvollzieht. Wer das will, hängt sie an eine höhere Kategorie.
 *   • **Nicht vor ihrem Beginn.** Eine Entnahme vor dem Beginn des laufenden Zyklus zählt
 *     in keinem Zyklus (`imFenster` in `topf.ts`): die Einordnung führte sie als Entnahme,
 *     und kosten würde sie nirgends — der Monat sähe besser aus, als er war.
 *   • **Ohne Kategorie nie** — aus demselben Grund wie bei `waehlbareRuecklagen`.
 */
export function fremdeRuecklagen(
  kategorien: readonly Kategorie[],
  ruecklagen: readonly Ruecklage[],
  kategorieId: string | undefined,
  datum: string,
): Ruecklage[] {
  const eigene = new Set(waehlbareRuecklagen(kategorien, ruecklagen, kategorieId).map((r) => r.id));
  return ruecklagen
    .filter((r) => !r.beendetAm && !!r.kategorieId && ruecklagenart(r) === "abschliessend")
    .filter((r) => !eigene.has(r.id) && r.beginn <= datum)
    .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
}
