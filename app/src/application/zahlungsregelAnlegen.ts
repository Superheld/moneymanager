// Use-Case „Zahlungsregel anlegen" — orchestriert, ohne Geschäftslogik.
// Übersetzt eine Formulareingabe in das Aggregat und speichert über den Port.

import {
  euroZuCent,
  type Charakter,
  type Rhythmus,
  type Zahlungsregel,
} from "../core";
import type { ZahlungsregelRepository } from "./ports";

export interface ZahlungsregelEingabe {
  bezeichnung: string;
  /** Positiver Euro-Betrag; das Vorzeichen ergibt sich aus dem Charakter. */
  betragEuro: number;
  rhythmus: Rhythmus;
  startdatum: string; // ISO „YYYY-MM-DD"
  charakter: Charakter;
  kontoId?: string;
  kategorieId?: string;
}

/** Ertrag fließt zu (+), Aufwand und Umschichtung fließen ab (−). */
export function vorzeichenbehaftet(betragEuro: number, charakter: Charakter): number {
  const cent = euroZuCent(Math.abs(betragEuro));
  return charakter === "Ertrag" ? cent : -cent;
}

export async function zahlungsregelAnlegen(
  repo: ZahlungsregelRepository,
  eingabe: ZahlungsregelEingabe,
): Promise<Zahlungsregel> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new Error("Bitte eine Bezeichnung angeben.");
  if (!(eingabe.betragEuro > 0)) throw new Error("Der Betrag muss größer als 0 sein.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.startdatum)) {
    throw new Error("Bitte ein gültiges Startdatum angeben.");
  }

  const regel: Zahlungsregel = {
    id: crypto.randomUUID(),
    bezeichnung,
    betrag: vorzeichenbehaftet(eingabe.betragEuro, eingabe.charakter),
    rhythmus: eingabe.rhythmus,
    startdatum: eingabe.startdatum,
    charakter: eingabe.charakter,
    kontoId: eingabe.kontoId || undefined,
    kategorieId: eingabe.kategorieId || undefined,
  };
  await repo.speichern(regel);
  return regel;
}
