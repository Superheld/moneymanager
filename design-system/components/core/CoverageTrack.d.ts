import * as React from 'react';

export interface CoverageTrackProps {
  /** Current value (e.g. amount covered / spent). */
  value: number;
  /** Target value the track fills against (default 100). */
  max?: number;
  /** Optional label on the left of the header row. */
  label?: React.ReactNode;
  /** Optional right-aligned text, e.g. "520 / 600 €". */
  right?: React.ReactNode;
  /** Force the over-budget (amber) state; otherwise inferred from value>max. */
  over?: boolean;
  style?: React.CSSProperties;
}

/**
 * Slim rounded progress bar for Deckungsgrad (is the Topf financed?) and Budgets.
 * Fills teal up to target, amber when exceeded.
 * @startingPoint section="Core" subtitle="Coverage / budget bar" viewport="700x150"
 */
export function CoverageTrack(props: CoverageTrackProps): React.JSX.Element;
