// Konfiguration exportieren — heute die Kategorien, später mehr.
//
// **Was das ist und was es nicht ist.** Exportiert wird, wie der Haushalt ORDNET, nicht
// was in ihm passiert ist: Kategorien, später Budgets, Verträge, Kontogruppen,
// Erkennungsregeln. Keine Buchungen, keine Salden, keine Kontonummern. Die Trennung ist
// nicht Bequemlichkeit, sondern der Grund, warum es diese Datei überhaupt geben darf: eine
// Ordnung lässt sich weitergeben, ein Kontoauszug nicht.
//
// **Warum nur Kategorien, obwohl die Form auf mehr ausgelegt ist.** Ein Export ist erst
// dann etwas wert, wenn es einen Import dazu gibt, und der ist die schwierigere Hälfte:
// eingelesene Kategorien treffen auf vorhandene, IDs kollidieren, Bäume müssen
// zusammengeführt werden. Diese Fragen sind offen. Was hier steht, ist der Teil, der ohne
// sie schon nützt — und die Form (`fassung`, benannte Abschnitte) ist so gewählt, dass der
// Rest daneben wachsen kann, ohne dass eine erste Datei ungültig wird.
//
// **Es ist ein Experiment** (`experiment.export`), und die Schalterstellung sagt genau das:
// die Form ist nicht zugesichert. Wer eine Datei von heute in einem halben Jahr einlesen
// will, hat `fassung` — mehr Versprechen gibt es nicht.

import type { Kategorie } from "../core";
import type { KategorieRepository } from "./ports";

/**
 * Wohin eine Exportdatei geht.
 *
 * Der Port kennt keinen Pfad, nur einen Dateinamen: WO exportiert wird, entscheidet der
 * Adapter (und dahinter das Rust-Kommando), nicht der Use-Case. Ein Use-Case, der ein
 * Verzeichnis benennt, hätte eine Meinung über das Dateisystem — und die gehört nicht in
 * die Anwendungsschicht.
 */
export interface ExportZiel {
  /** Schreibt die Datei und meldet, wo sie gelandet ist. */
  schreiben(name: string, inhalt: string): Promise<string>;
}

/** Die Fassung der Exportform. Steigt, sobald sich die Bedeutung eines Feldes ändert. */
export const EXPORT_FASSUNG = 1;

/** Eine Kategorie, wie sie in der Datei steht. */
export interface ExportKategorie {
  readonly id: string;
  readonly name: string;
  readonly elternId: string | null;
  readonly defaultCharakter: string;
}

/** Die Datei als Ganzes. Weitere Abschnitte kommen als weitere Felder dazu. */
export interface Konfigurationsexport {
  readonly fassung: number;
  readonly erzeugt: string;
  readonly kategorien: readonly ExportKategorie[];
}

/**
 * Die Kategorien in Exportform — sortiert, damit zwei Exporte vergleichbar sind.
 *
 * **Eltern vor Kindern**, und darin liegt der eigentliche Zweck der Sortierung: wer die
 * Liste von oben nach unten einliest, findet jede Elternkategorie bereits angelegt vor.
 * Eine nach Namen sortierte Liste zwänge jeden Importeur, zweimal zu laufen — und die
 * Datei ist auch für den lesbar, der sie mit den Augen durchgeht.
 */
export function inExportform(kategorien: readonly Kategorie[]): ExportKategorie[] {
  const nachName = [...kategorien].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const erledigt = new Set<string>();
  const ergebnis: ExportKategorie[] = [];

  function anhaengen(k: Kategorie) {
    if (erledigt.has(k.id)) return;
    erledigt.add(k.id);
    ergebnis.push({
      id: k.id,
      name: k.name,
      elternId: k.elternId ?? null,
      defaultCharakter: k.defaultCharakter,
    });
    for (const kind of nachName.filter((x) => x.elternId === k.id)) anhaengen(kind);
  }

  for (const k of nachName.filter((x) => !x.elternId)) anhaengen(k);
  // Wessen Eltern es nicht gibt, bleibt sonst liegen. Das sollte nicht vorkommen — aber
  // ein Export, der stillschweigend Zeilen weglässt, ist schlimmer als einer mit einer
  // Waise darin.
  for (const k of nachName) anhaengen(k);
  return ergebnis;
}

/** Der Dateiname zu einem Tag. Ein Export je Tag, der neuere ersetzt den älteren. */
export function exportDateiname(erzeugt: Date): string {
  return `konfiguration-${erzeugt.toISOString().slice(0, 10)}.json`;
}

/**
 * Schreibt die Konfiguration und meldet, wo sie liegt.
 *
 * Der Zeitpunkt kommt herein und wird nicht hier geholt — dieselbe Regel wie überall:
 * die Anwendungsschicht hat keine Uhr.
 */
export async function konfigurationExportieren(
  repo: KategorieRepository,
  ziel: ExportZiel,
  erzeugt: Date,
): Promise<string> {
  const inhalt: Konfigurationsexport = {
    fassung: EXPORT_FASSUNG,
    erzeugt: erzeugt.toISOString(),
    kategorien: inExportform(await repo.alle()),
  };
  return ziel.schreiben(exportDateiname(erzeugt), JSON.stringify(inhalt, null, 2) + "\n");
}
