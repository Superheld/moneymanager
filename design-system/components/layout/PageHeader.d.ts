import * as React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Context-bar date line. */
  date?: string;
  /** Active scenario name shown in the chip. */
  scenario?: string;
  /** Right-aligned controls (SegmentedControl, Buttons, …). */
  right?: React.ReactNode;
}

/**
 * Standard screen header: context bar (date + ScenarioChip) over a title/subtitle + controls row.
 * Put it at the top of every screen for a consistent frame.
 * @startingPoint section="Layout" subtitle="Screen header + context bar" viewport="900x180"
 */
export function PageHeader(props: PageHeaderProps): React.JSX.Element;
