// Quellen-Port (Hexagonal, TAKTIK-IMPORT §6) + eine kleine Registry.
// Das ist die modulare Naht: ein neuer Importer = ein neues Objekt, das `Quellenadapter`
// erfüllt und sich registriert. Alles andere im System bleibt unberührt.
//
// Der Port reicht ROHE BYTES durch, keinen Text. Binärformate (xlsx = ZIP mit XML) lassen
// sich nicht sinnvoll als String durchreichen, und die Encoding-Frage gehört ohnehin zum
// Format: eine CSV-Quelle entscheidet selbst über UTF-8 oder Latin-1 (`dateiText.ts`),
// eine xlsx-Quelle hat die Frage gar nicht.

import type { ImportErgebnis } from "./rohUmsatz";

export interface Quellenadapter {
  /** Stabiler technischer Schlüssel, z. B. „finanzguru". */
  readonly id: string;
  /** Anzeigename für die UI, z. B. „Finanzguru-Export (CSV)". */
  readonly name: string;
  /**
   * Heuristik: Sieht diese Datei nach meinem Format aus? Für Auto-Erkennung beim
   * Datei-Drop. Soll billig und tolerant sein (Header-Fingerabdruck), nicht voll parsen.
   */
  erkennt(datei: Uint8Array): boolean;
  /** Liest die Datei und liefert kanonische RohUmsätze + Warnungen. */
  lies(datei: Uint8Array): ImportErgebnis;
}

const registry = new Map<string, Quellenadapter>();

/** Registriert (oder ersetzt) einen Adapter. Üblicherweise einmal beim Modul-Laden. */
export function adapterRegistrieren(adapter: Quellenadapter): void {
  registry.set(adapter.id, adapter);
}

/** Alle registrierten Adapter (z. B. für ein „Quelle wählen"-Dropdown). */
export function alleAdapter(): Quellenadapter[] {
  return [...registry.values()];
}

/** Adapter nach id, oder undefined. */
export function adapterNach(id: string): Quellenadapter | undefined {
  return registry.get(id);
}

/**
 * Wählt automatisch den passenden Adapter für eine Datei (erster, dessen `erkennt`
 * greift). undefined, wenn keiner passt → UI fragt den Nutzer.
 */
export function waehleAdapter(datei: Uint8Array): Quellenadapter | undefined {
  return alleAdapter().find((a) => a.erkennt(datei));
}
