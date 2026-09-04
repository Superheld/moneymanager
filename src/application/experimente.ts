// Experimentelle Funktionen — standardmäßig aus, einzeln zuschaltbar.
//
// Manches ist fertig genug, um es zu benutzen, aber nicht fertig genug, um es jedem
// hinzustellen: es setzt Handarbeit bei der Einrichtung voraus, hängt an einer
// Schnittstelle, die niemand zugesichert hat, und kann in Wochen wieder kaputt sein. Ein
// Schalter sagt das dem Benutzer, statt es ihn herausfinden zu lassen — und er sagt es
// VOR dem ersten Versuch, nicht in einer Fehlermeldung danach.
//
// **Warum nicht in `Haushaltseinstellungen`:** dort steht, was der Haushalt IST — eine
// Region, aus der Sprache, Zahlenformat und Währung folgen. Ein Experiment ist keine
// Eigenschaft des Haushalts, sondern eine des Programms, und die Region-Datei sagt
// ausdrücklich, dass sie genau eine Sache hält. Zwei Fragen, zwei Orte.
//
// **Warum trotzdem dieselbe Tabelle:** `einstellung` ist Key/Value und genau dafür da.
// Migration 22 hat das für die Merkmal-Herkünfte schon entschieden — „eine eigene Tabelle
// für fünf Zeilen mit festen Schlüsseln wäre Schema ohne Gegenwert". Für Schalter gilt
// dasselbe, und es spart eine Migration.
//
// **Warum ein Präfix:** `experiment.<id>` hält die Schlüssel zusammen und macht später
// eine generische Liste in der Oberfläche möglich, ohne dass die gespeicherten Werte
// wandern müssten. Solange es ein Experiment gibt, ist die Oberfläche fest verdrahtet —
// eine Registry für einen einzigen Eintrag wäre Spekulation.

import type { EinstellungenRepository } from "./ports";

/**
 * Die Kennungen aller Experimente. Ein neues Experiment ist ein Wert mehr — und der
 * Typ zwingt dazu, es unten in `EXPERIMENTE_AUS` mitzuführen.
 */
export type ExperimentId = "hanseatic" | "export" | "training";

/** Alle Kennungen, für Schleifen über den Bestand. */
export const EXPERIMENTE: readonly ExperimentId[] = ["hanseatic", "export", "training"];

/** Welche Experimente eingeschaltet sind. */
export type Experimente = Readonly<Record<ExperimentId, boolean>>;

/**
 * Der Ausgangszustand: alles aus.
 *
 * Er ist auch die Antwort, wenn nichts gespeichert ist oder ein gespeicherter Wert nicht
 * gelesen werden kann. Ein Experiment schaltet sich nie von selbst ein — die Voreinstellung
 * ist die einzige, die ohne Zutun des Benutzers gilt, und sie muss die vorsichtige sein.
 */
export const EXPERIMENTE_AUS: Experimente = { hanseatic: false, export: false, training: false };

const PRAEFIX = "experiment.";

/** Der einzige Wert, der als „an" zählt. Alles andere — auch Müll — heißt aus. */
const AN = "an";

function schluessel(id: ExperimentId): string {
  return `${PRAEFIX}${id}`;
}

/** Liest den Stand aller Experimente. Fehlende Schlüssel bedeuten „aus". */
export async function experimenteLaden(repo: EinstellungenRepository): Promise<Experimente> {
  const kv = await repo.lesen();
  const stand: Record<string, boolean> = { ...EXPERIMENTE_AUS };
  for (const id of EXPERIMENTE) stand[id] = kv[schluessel(id)] === AN;
  return stand as Experimente;
}

/** Schaltet ein Experiment ein oder aus. */
export async function experimentSchalten(
  repo: EinstellungenRepository,
  id: ExperimentId,
  an: boolean,
): Promise<void> {
  await repo.schreiben(schluessel(id), an ? AN : "aus");
}
