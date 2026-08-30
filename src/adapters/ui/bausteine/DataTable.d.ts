import * as React from 'react';

export interface DataColumn<T = unknown> {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'right';
  /** Optional custom cell renderer receiving the row object. */
  render?: (row: T) => React.ReactNode;
  /** Bei aktivierter Tabellen-Sortierung: Sortierwert (sonst row[key]). */
  sortValue?: (row: T) => string | number;
  /** Diese Spalte von der Sortierung ausnehmen. */
  sortable?: boolean;
  /** Begrenzt die Spaltenbreite; längerer Inhalt wird abgeschnitten statt umzubrechen. */
  maxWidth?: number | string;
}
export interface DataTableProps<T> {
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  /** Optional: macht Zeilen anklickbar; erhält das Zeilen-Objekt. */
  onRowClick?: (row: T) => void;
  /** Optional: markiert die aktive Zeile (Hervorhebung). */
  istAktiv?: (row: T) => boolean;
  /**
   * Optional: Stil je Zeile, zuletzt aufgetragen. Gedacht fuer `opacity` — das daempft
   * den ganzen Teilbaum inklusive der Zellen, die ihre Farbe selbst setzen.
   */
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  /** Spaltenkopf-Klick sortiert (auf → ab → original). Pro Spalte via sortable abschaltbar. */
  sortable?: boolean;
  /** Wenn gesetzt, paginiert die Tabelle mit dieser Seitengröße (Steuerung unten). */
  pageSize?: number;
  /**
   * Beschriftungen der Seitensteuerung. Optional, damit die Komponente selbst sprachfrei
   * bleibt — die App reicht übersetzte Texte durch.
   */
  labelSeite?: string;
  labelErste?: string;
  labelLetzte?: string;
  labelZurueck?: string;
  labelVor?: string;
}

/**
 * Hairline data table with tabular numerals on right-aligned columns. First column is bold.
 * Use a `render` for amount cells (color by Aufwand/Ertrag/Umschichtung) and Pills.
 * @startingPoint section="Data" subtitle="Hairline table" viewport="700x260"
 */
export function DataTable<T>(props: DataTableProps<T>): React.JSX.Element;
