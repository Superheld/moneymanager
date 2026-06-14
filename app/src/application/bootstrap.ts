// App-Bootstrap — einmalige Initialisierung beim Start, bevor die Screens Daten laden.
// Aktuell: Standardkategorien anlegen, wenn der Bestand leer ist (Auto-Seed). Bewusst
// idempotent und ergänzbar (spätere Defaults hier andocken).

import type { KategorieRepository } from "./ports";
import { standardkategorienAnlegen } from "./standardkategorien";

export async function appBootstrap(kategorieRepo: KategorieRepository): Promise<void> {
  const kategorien = await kategorieRepo.alle();
  if (kategorien.length === 0) {
    await standardkategorienAnlegen(kategorieRepo);
  }
}
