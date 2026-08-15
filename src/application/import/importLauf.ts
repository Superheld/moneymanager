// ImportLauf — dünnes Protokoll-Aggregat (TAKTIK-IMPORT §1): Klammer um die Umsätze eines
// Imports und Statistik (eingelesen/neu/duplikate). Bewusst ohne Fachlogik.

export interface ImportLauf {
  readonly id: string;
  /** Quellen-Adapter-id, z. B. „finanzguru". */
  readonly quelle: string;
  /** Zeitpunkt des Imports (ISO-Datetime; wird vom Use-Case gesetzt). */
  readonly zeitpunkt: string;
  readonly dateiname?: string;
  readonly eingelesen: number;
  readonly neu: number;
  readonly duplikate: number;
}
