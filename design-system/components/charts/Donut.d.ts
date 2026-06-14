import * as React from 'react';

export interface DonutSegment { value: number; color: string; label?: string; }
export interface DonutProps {
  /** Ring segments; the ring auto-normalizes to the sum of values. */
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  /** Centered headline (e.g. "16k"). */
  center?: React.ReactNode;
  /** Small centered sub-label (e.g. "6 Mt"). */
  sub?: React.ReactNode;
}

/**
 * Proportional ring for allocation (Anlagen) and category breakdowns (Analysen).
 * Pair with a dot legend listing the same colors/labels.
 * @startingPoint section="Charts" subtitle="Allocation ring" viewport="400x220"
 */
export function Donut(props: DonutProps): React.JSX.Element;
