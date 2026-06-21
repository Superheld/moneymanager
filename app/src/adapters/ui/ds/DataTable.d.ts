import * as React from 'react';

export interface DataColumn {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'right';
  /** Optional custom cell renderer receiving the row object. */
  render?: (row: any) => React.ReactNode;
  /** Bei aktivierter Tabellen-Sortierung: Sortierwert (sonst row[key]). */
  sortValue?: (row: any) => string | number;
  /** Diese Spalte von der Sortierung ausnehmen. */
  sortable?: boolean;
}
export interface DataTableProps {
  columns: DataColumn[];
  rows: any[];
  /** Optional: macht Zeilen anklickbar; erhält das Zeilen-Objekt. */
  onRowClick?: (row: any) => void;
  /** Optional: markiert die aktive Zeile (Hervorhebung). */
  istAktiv?: (row: any) => boolean;
  /** Spaltenkopf-Klick sortiert (auf → ab → original). Pro Spalte via sortable abschaltbar. */
  sortable?: boolean;
}

/**
 * Hairline data table with tabular numerals on right-aligned columns. First column is bold.
 * Use a `render` for amount cells (color by Aufwand/Ertrag/Umschichtung) and Pills.
 * @startingPoint section="Data" subtitle="Hairline table" viewport="700x260"
 */
export function DataTable(props: DataTableProps): React.JSX.Element;
