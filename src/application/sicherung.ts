// Sicherungskopien pflegen: eine je Tag anlegen, den Rest nach der Staffelung ausdünnen.
//
// **Warum das ein Use-Case ist und kein Adapter-Detail.** Was gesichert wird, ist eine
// fachliche Frage — wie weit zurück man einsteigen können soll. Der Adapter weiss nur,
// wie eine Datei entsteht.
//
// **Ohne Uhr.** Der Stichtag kommt herein, wie überall in diesem Projekt.

import { zuEntfernen, type Aufbewahrung } from "../core/sicherung/rotation";

/** Was die Anwendung vom Dateisystem braucht — mehr nicht. */
export interface SicherungPort {
  /** Legt die Sicherung dieses Stichtags an. `false`, wenn es sie schon gab. */
  anlegen(stichtag: string): Promise<boolean>;
  /** Die Stichtage der vorhandenen Sicherungen. */
  auflisten(): Promise<string[]>;
  /** Entfernt genau diese Stichtage; gibt zurück, wie viele weg sind. */
  entfernen(stichtage: string[]): Promise<number>;
}

export interface Sicherungslauf {
  /** Ob heute tatsächlich eine angelegt wurde. */
  angelegt: boolean;
  /** Wie viele alte weggefallen sind. */
  entfernt: number;
}

/**
 * Ein Lauf: sichern, dann ausdünnen.
 *
 * **Die Reihenfolge ist nicht beliebig.** Erst anlegen, dann aufräumen — andersherum
 * könnte ein Fehler beim Anlegen einen Stand hinterlassen, in dem gerade die älteste
 * Sicherung weggeworfen wurde und keine neue dazukam. Aufgeräumt wird nur, was nach dem
 * Anlegen noch übrig ist.
 *
 * **Ein Fehlschlag ist kein Grund, den Start abzubrechen** — deshalb wirft diese
 * Funktion nicht, sondern meldet, was passiert ist. Eine App, die nicht hochkommt, weil
 * eine Sicherung scheiterte, hat den Zweck der Sicherung verfehlt.
 */
export async function sicherungPflegen(
  port: SicherungPort,
  stichtag: string,
  regel?: Aufbewahrung,
): Promise<Sicherungslauf> {
  const angelegt = await port.anlegen(stichtag);

  const vorhanden = await port.auflisten();
  const weg = zuEntfernen(vorhanden, regel);
  const entfernt = weg.length > 0 ? await port.entfernen(weg) : 0;

  return { angelegt, entfernt };
}
