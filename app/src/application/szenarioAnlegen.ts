// Use-Cases für Szenarien: Szenario anlegen und Zusatzposten (Zahlungsregeln) ergänzen.
// Die Posten landen in der getrennten Szenario-Schicht, nie im Plan.

import { FachlicherFehler } from "../core";
import type { Cent, Charakter, Rhythmus, Szenario, Zahlungsregel } from "../core";
import type { SzenarioRepository } from "./ports";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";

export async function szenarioAnlegen(repo: SzenarioRepository, name: string): Promise<Szenario> {
  const n = name.trim();
  if (!n) throw new FachlicherFehler("name.fehlt");
  const szenario: Szenario = { id: crypto.randomUUID(), name: n };
  await repo.speichern(szenario);
  return szenario;
}

export interface SzenarioPostenEingabe {
  bezeichnung: string;
  betrag: Cent;
  rhythmus: Rhythmus;
  charakter: Charakter;
  startdatum: string;
}

export async function szenarioPostenAnlegen(
  repo: SzenarioRepository,
  szenarioId: string,
  e: SzenarioPostenEingabe,
): Promise<Zahlungsregel> {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!(e.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startdatum)) throw new FachlicherFehler("startdatum.ungueltig");

  const posten: Zahlungsregel = {
    id: crypto.randomUUID(),
    bezeichnung,
    betrag: vorzeichenbehaftet(e.betrag, e.charakter),
    rhythmus: e.rhythmus,
    startdatum: e.startdatum,
    charakter: e.charakter,
  };
  await repo.postenSpeichern(szenarioId, posten);
  return posten;
}
