import * as React from 'react';

export interface SparklineProps {
  values: number[];
  /** plan = dashed teal, ist = solid ink (default). */
  variant?: 'ist' | 'plan';
  width?: number;
  height?: number;
}

/**
 * Tiny inline trend line for per-account lanes / list rows.
 * @startingPoint section="Charts" subtitle="Inline trend" viewport="300x120"
 */
export function Sparkline(props: SparklineProps): React.JSX.Element;
