// Use-Case „Zahlungsregel anlegen" — orchestriert, ohne Geschäftslogik.
// Übersetzt eine Formulareingabe in das Aggregat und speichert über den Port.

import { FachlicherFehler, istCent,
  
  type Cent,
  type Charakter,
  type Rhythmus,
  type Zahlungsregel,
} from "../../core";
import type { ZahlungsregelRepository } from "../ports";

export interface ZahlungsregelEingabe {
  bezeichnung: string;
  /** Positiver Betrag in Minor Units; das Vorzeichen ergibt sich aus dem Charakter. */
  betrag: Cent;
  rhythmus: Rhythmus;
  startdatum: string; // ISO „YYYY-MM-DD"
  charakter: Charakter;
  kontoId?: string;
  kategorieId?: string;
}

/**
 * Ertrag fließt zu (+), Aufwand und Umschichtung fließen ab (−) — und `gegenrichtung`
 * dreht das um.
 *
 * Ohne den dritten Parameter leitet diese Funktion die RICHTUNG aus der EINORDNUNG ab,
 * und das geht nur so lange gut, wie beide dasselbe sagen. Eine Erstattung ist der Fall,
 * wo sie auseinanderfallen: sie gehört in die Kategorie der Ausgabe (also Aufwand), aber
 * das Geld kam herein. Wer sie von Hand erfasste, bekam bis hier zwangsläufig einen
 * Abfluss — die Höhe liess sich eingeben, die Richtung nicht.
 *
 * Beim Import stellt sich die Frage nicht: dort ist das Vorzeichen eine Tatsache vom
 * Beleg und wird nie abgeleitet (siehe `buchungBearbeiten`). Für eine PLANGRÖSSE
 * (Zahlungsregel, Vertragsrate) genügt die Ableitung weiterhin — eine geplante Rate hat
 * genau eine Richtung, sonst wäre sie keine.
 */
export function vorzeichenbehaftet(betrag: Cent, charakter: Charakter, gegenrichtung = false): number {
  const cent = Math.abs(betrag);
  const fliesstZu = charakter === "Ertrag";
  return fliesstZu !== gegenrichtung ? cent : -cent;
}

export async function zahlungsregelAnlegen(
  repo: ZahlungsregelRepository,
  eingabe: ZahlungsregelEingabe,
): Promise<Zahlungsregel> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!istCent(eingabe.betrag) || eingabe.betrag <= 0) throw new FachlicherFehler("betrag.groesserNull");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.startdatum)) {
    throw new FachlicherFehler("startdatum.ungueltig");
  }

  const regel: Zahlungsregel = {
    id: crypto.randomUUID(),
    bezeichnung,
    betrag: vorzeichenbehaftet(eingabe.betrag, eingabe.charakter),
    rhythmus: eingabe.rhythmus,
    startdatum: eingabe.startdatum,
    charakter: eingabe.charakter,
    kontoId: eingabe.kontoId || undefined,
    kategorieId: eingabe.kategorieId || undefined,
  };
  await repo.speichern(regel);
  return regel;
}
