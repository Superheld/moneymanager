import * as React from 'react';

export interface VesselProps {
  /** Amount currently covered. */
  value: number;
  /** Target value (Soll). */
  target: number;
  /** Topf name. */
  label?: React.ReactNode;
  /** "Spartopf" or "Puffer" — sets the tag color. */
  art?: 'Spartopf' | 'Puffer';
  height?: number;
}

/**
 * The Töpfe "Behälter" fill indicator with a dashed goal line; teal ≥50%, amber below.
 * Use in a grid of cards on the Töpfe screen.
 * @startingPoint section="Data" subtitle="Topf fill vessel" viewport="300x200"
 */
export function Vessel(props: VesselProps): React.JSX.Element;
