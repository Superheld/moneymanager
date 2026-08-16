// Kategorie — Querschnittsdimension über allen Strömen, Basis der Analysen
// (KONZEPT §3.5). Als Baum (optionale Elternkategorie), ohne Zyklen. Trägt einen
// Default-Charakter, den Ströme erben können.

import type { Charakter } from "./zahlungsregel";

export interface Kategorie {
  readonly id: string;
  readonly name: string;
  readonly elternId?: string;
  readonly defaultCharakter: Charakter;
}

/**
 * Die Kategorie selbst plus alle ihre Nachfahren, als Menge von IDs.
 *
 * Warum: Budgets und Auswertungen hängen an einer HAUPTkategorie („Lebenshaltung"),
 * gebucht wird aber auf deren Kindern („Lebensmittel", „Drogerie"). Wer nur auf die
 * eine ID prüft, findet nichts — auf echten Daten trafen 0 von 5207 Buchungen ihre
 * Budget-Kategorie direkt, jeder Budget-Verbrauch stand deshalb auf 0.
 *
 * Unbekannte `wurzelId` liefert die einelementige Menge — die Buchungen tragen die ID
 * ja trotzdem. Zyklen sind über `wuerdeZyklusErzeugen` ausgeschlossen; die
 * Besuchsmarkierung hier schützt den Fall trotzdem gegen eine Endlosschleife.
 */
export function kategorieUnterbaum(
  kategorien: readonly Kategorie[],
  wurzelId: string,
): Set<string> {
  const kinder = new Map<string, string[]>();
  for (const k of kategorien) {
    if (!k.elternId) continue;
    const liste = kinder.get(k.elternId);
    if (liste) liste.push(k.id);
    else kinder.set(k.elternId, [k.id]);
  }
  const ergebnis = new Set<string>([wurzelId]);
  const offen = [wurzelId];
  while (offen.length > 0) {
    const aktuell = offen.pop()!;
    for (const kind of kinder.get(aktuell) ?? []) {
      if (ergebnis.has(kind)) continue;
      ergebnis.add(kind);
      offen.push(kind);
    }
  }
  return ergebnis;
}

/**
 * Die Hauptkategorie zu einer Kategorie: der oberste Knoten über ihr, sonst sie selbst.
 *
 * Warum bis zur Wurzel und nicht nur eine Ebene hoch: Auswertungen, die „nach
 * Hauptkategorie" gruppieren, sollen bei einem dreistufigen Baum nicht plötzlich auf der
 * mittleren Ebene stehen bleiben und dieselbe Hauptkategorie zweimal zeigen. In der Praxis
 * ist der Baum zweistufig — dann ist das Ergebnis dasselbe wie beim einfachen Elternblick.
 *
 * Unbekannte `id` liefert `undefined`; Zyklen fängt der Schutzzähler ab
 * (fachlich ausgeschlossen über `wuerdeZyklusErzeugen`).
 */
export function hauptkategorie(
  kategorien: readonly Kategorie[],
  id: string,
): Kategorie | undefined {
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  let aktuell = byId.get(id);
  let schutz = 0;
  while (aktuell?.elternId && schutz++ < 10000) {
    const eltern = byId.get(aktuell.elternId);
    if (!eltern) break;
    aktuell = eltern;
  }
  return aktuell;
}

/**
 * Würde das Setzen von `elternId` für `id` einen Zyklus erzeugen? Reine Funktion
 * über die bestehende Kategorienliste. Zyklus, wenn der neue Elternknoten der
 * Knoten selbst oder ein Nachfahre von ihm ist (d. h. `id` ein Vorfahr von `elternId`).
 */
export function wuerdeZyklusErzeugen(
  kategorien: Kategorie[],
  id: string,
  elternId: string | undefined,
): boolean {
  if (!elternId) return false;
  if (elternId === id) return true;
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  let aktuell = byId.get(elternId);
  let schutz = 0;
  while (aktuell && schutz++ < 10000) {
    if (aktuell.id === id) return true;
    aktuell = aktuell.elternId ? byId.get(aktuell.elternId) : undefined;
  }
  return false;
}
