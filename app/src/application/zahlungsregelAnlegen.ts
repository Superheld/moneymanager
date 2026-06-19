// Use-Case „Zahlungsregel anlegen" — orchestriert, ohne Geschäftslogik.
// Übersetzt eine Formulareingabe in das Aggregat und speichert über den Port.

import {
  FachlicherFehler,
  type Cent,
  type Charakter,
  type Rhythmus,
  type Zahlungsregel,
} from "../core";
import type { ZahlungsregelRepository } from "./ports";

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

/** Ertrag fließt zu (+), Aufwand und Umschichtung fließen ab (−). */
export function vorzeichenbehaftet(betrag: Cent, charakter: Charakter): number {
  const cent = Math.abs(betrag);
  return charakter === "Ertrag" ? cent : -cent;
}

export async function zahlungsregelAnlegen(
  repo: ZahlungsregelRepository,
  eingabe: ZahlungsregelEingabe,
): Promise<Zahlungsregel> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!(eingabe.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");
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
