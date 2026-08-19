// „Kein Duplikat" — die Entscheidung von Hand, und ihr Rückweg.
//
// Der Finder rechnet mit Punkten und liegt manchmal daneben. Ohne diesen Weg bliebe eine
// Fehleinschätzung für immer stehen: die Prüfung läuft bei JEDEM Hinsehen neu, also käme
// dieselbe Mahnung nach jedem Neuladen wieder. Was hier geschrieben wird, ist deshalb
// keine Kosmetik an der Anzeige, sondern der einzige Ort, an dem „ich habe das geprüft"
// überhaupt Platz hat.
//
// Zurücknehmen gehört dazu. Wer sich vertut, hätte sonst zwei Zeilen im Saldo und keine
// Markierung mehr, die darauf zeigt.

import { FachlicherFehler } from "../core";
import { freigabeAus, type Dublettenfreigabe } from "./dublettensicht";
import type { DublettenfreigabeRepository } from "./ports";

export async function dublettenFreigeben(
  repo: DublettenfreigabeRepository,
  umsatzA: string,
  umsatzB: string,
  jetzt: () => string = () => new Date().toISOString(),
): Promise<Dublettenfreigabe> {
  if (!umsatzA || !umsatzB) throw new FachlicherFehler("dublette.freigabe.unvollstaendig");
  // Eine Zeile ist nie ihr eigener Zwilling — das wäre ein Aufrufer-Fehler, der sich
  // still als „nie wieder gemeldet" auswirken würde.
  if (umsatzA === umsatzB) throw new FachlicherFehler("dublette.freigabe.selbst");
  const freigabe = freigabeAus(umsatzA, umsatzB, jetzt());
  await repo.speichern(freigabe);
  return freigabe;
}

export async function dublettenFreigabeAufheben(
  repo: DublettenfreigabeRepository,
  umsatzA: string,
  umsatzB: string,
): Promise<void> {
  await repo.entfernen(umsatzA, umsatzB);
}
