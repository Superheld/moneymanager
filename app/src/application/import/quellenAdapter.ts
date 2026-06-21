// Quellen-Port (Hexagonal, TAKTIK-IMPORT §6) + eine kleine Registry.
// Das ist die modulare Naht: ein neuer Importer = ein neues Objekt, das `Quellenadapter`
// erfüllt und sich registriert. Alles andere im System bleibt unberührt.

import type { ImportErgebnis } from "./rohUmsatz";

export interface Quellenadapter {
  /** Stabiler technischer Schlüssel, z. B. „finanzguru". */
  readonly id: string;
  /** Anzeigename für die UI, z. B. „Finanzguru-Export (CSV)". */
  readonly name: string;
  /**
   * Heuristik: Sieht dieser Inhalt nach meinem Format aus? Für Auto-Erkennung beim
   * Datei-Drop. Soll billig und tolerant sein (Header-Fingerabdruck), nicht voll parsen.
   */
  erkennt(inhalt: string): boolean;
  /** Liest den Datei-Inhalt und liefert kanonische RohUmsätze + Warnungen. */
  lies(inhalt: string): ImportErgebnis;
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
 * Wählt automatisch den passenden Adapter für einen Datei-Inhalt (erster, dessen
 * `erkennt` greift). undefined, wenn keiner passt → UI fragt den Nutzer.
 */
export function waehleAdapter(inhalt: string): Quellenadapter | undefined {
  return alleAdapter().find((a) => a.erkennt(inhalt));
}
