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
  /**
   * Der Bankzugang, aus dem dieser Lauf kam. Fehlt bei Dateiimporten — und bei allen
   * Läufen von vor der Einführung, denen ihn niemand nachträglich zuweisen kann.
   */
  readonly zugangId?: string;
  /**
   * Das Konto, für das abgerufen wurde.
   *
   * Ein ABRUF gilt immer genau einem Konto. Eine DATEI kann mehrere betreffen, deshalb
   * bleibt das Feld dort leer — welche Konten sie berührt hat, steht an ihren Umsätzen.
   */
  readonly zahlungskontoId?: string;
  /** Welches Umsatzformat getragen hat („CAMT" oder „MT940"). */
  readonly format?: string;
  /**
   * Die Bank hat die Trefferzahl gedeckelt — es gibt mehr, als hier ankam.
   *
   * Ohne diese Angabe sieht ein abgeschnittener Abruf aus wie ein vollständiger: er
   * meldet eine Zahl, und niemand erfährt, dass dahinter noch etwas liegt.
   */
  readonly abgeschnitten?: boolean;
}

/**
 * Quellen, die ein ABRUF sind und keine Datei.
 *
 * Der Unterschied hat Folgen, deshalb steht er hier am Lauf und nicht in einer Sicht:
 * eine Datei ist ein Stapel, den jemand ausgewählt hat, ein Abruf ist die Aussage der
 * Bank über den Stand ihres Kontos. Was von der Bank kam, wird deshalb nicht gelöscht,
 * sondern verworfen — die Zeile bleibt als Entscheidung stehen, sonst holt der nächste
 * Abruf sie zurück.
 */
export const ABRUF_QUELLEN: ReadonlySet<string> = new Set(["fints"]);
