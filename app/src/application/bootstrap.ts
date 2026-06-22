// App-Bootstrap — einmalige Initialisierung beim Start, bevor die Screens Daten laden.
// Stellt die Standardkategorien sicher: legt FEHLENDE an (idempotent, per Name-Abgleich),
// nicht nur beim allerersten leeren Start. So werden spätere Taxonomie-Erweiterungen
// (neue Standardkategorien) bei bestehenden DBs nachgezogen.
//
// Bewusster Trade-off: eine vom Nutzer gelöschte Standardkategorie taucht wieder auf —
// akzeptabel, weil die Standardliste der Baseline-Kontenplan ist. Eigene Kategorien
// bleiben unberührt; ergänzt werden nur fehlende Standardnamen.
//
// WICHTIG: als Singleton ausgeführt. React StrictMode (Dev) ruft Effekte doppelt auf;
// die gecachte Promise stellt sicher, dass der Bootstrap genau einmal läuft.

import type { KategorieRepository } from "./ports";
import { standardkategorienAnlegen } from "./standardkategorien";

let laeuft: Promise<void> | null = null;

async function doBootstrap(kategorieRepo: KategorieRepository): Promise<void> {
  await standardkategorienAnlegen(kategorieRepo);
}

export function appBootstrap(kategorieRepo: KategorieRepository): Promise<void> {
  if (!laeuft) laeuft = doBootstrap(kategorieRepo);
  return laeuft;
}
