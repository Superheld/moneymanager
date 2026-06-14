import * as React from 'react';

export interface PillProps {
  /** Semantic variant. `um` (Umschichtung) and `plan` carry the teal accent. */
  variant?: 'neutral' | 'plan' | 'ist' | 'um' | 'ertrag' | 'aufwand' | 'warn' | 'ok';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Rounded semantic tag. Use for a payment's character (Aufwand/Ertrag/Umschichtung),
 * Plan vs. Ist marking, coverage status, or the active scenario chip.
 * @startingPoint section="Core" subtitle="Semantic rounded tag" viewport="700x150"
 */
export function Pill(props: PillProps): React.JSX.Element;
