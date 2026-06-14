import * as React from 'react';

export interface LiquidityChartProps {
  /** 12 monthly end-of-month balances (the Plan curve). */
  plan: number[];
  /** Index (0–11) up to which the Ist line is drawn solid. Default 5 (=Juni). */
  istThrough?: number;
  /** Y-axis max in €. Default 5700. */
  max?: number;
  /** Month index of the Engpass dip callout. Default 6 (=Juli). */
  dip?: number;
  /** Show the dip callout. Default true. */
  showDip?: boolean;
  width?: number;
  height?: number;
}

/**
 * The signature liquidity year-curve: solid ink Ist line, dashed teal Plan line,
 * soft fill, "heute" marker and an Engpass dip callout. The core chart of the app.
 * @startingPoint section="Charts" subtitle="Ist/Plan year curve" viewport="900x320"
 */
export function LiquidityChart(props: LiquidityChartProps): React.JSX.Element;
