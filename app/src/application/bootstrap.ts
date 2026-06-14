// App-Bootstrap — einmalige Initialisierung beim Start, bevor die Screens Daten laden.
// Aktuell: Standardkategorien anlegen, wenn der Bestand leer ist (Auto-Seed).
//
// WICHTIG: als Singleton ausgeführt. React StrictMode (Dev) ruft Effekte doppelt auf;
// ohne Schutz würden zwei gleichzeitige Läufe beide „leer" sehen und doppelt seeden.
// Die gecachte Promise stellt sicher, dass der Bootstrap genau einmal läuft.

import type { KategorieRepository } from "./ports";
import { standardkategorienAnlegen } from "./standardkategorien";

let laeuft: Promise<void> | null = null;

async function doBootstrap(kategorieRepo: KategorieRepository): Promise<void> {
  const kategorien = await kategorieRepo.alle();
  if (kategorien.length === 0) {
    await standardkategorienAnlegen(kategorieRepo);
  }
}

export function appBootstrap(kategorieRepo: KategorieRepository): Promise<void> {
  if (!laeuft) laeuft = doBootstrap(kategorieRepo);
  return laeuft;
}
