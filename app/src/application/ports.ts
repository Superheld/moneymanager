// Ports — die Schnittstellen, über die die Anwendungsschicht mit der Außenwelt
// spricht (hexagonal). Implementiert werden sie von Adaptern (z. B. SQLite),
// der Kern kennt sie nicht. So bleibt die Persistenz austauschbar (ADR-0001 §6).

import type { Zahlungsregel } from "../core";

export interface ZahlungsregelRepository {
  alle(): Promise<Zahlungsregel[]>;
  speichern(regel: Zahlungsregel): Promise<void>;
  loeschen(id: string): Promise<void>;
}
