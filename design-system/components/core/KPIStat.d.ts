import * as React from 'react';

export interface KPIStatProps {
  /** Short label above the figure. */
  label: React.ReactNode;
  /** The figure itself, pre-formatted (de-DE), e.g. "4.180" or "+3.100". */
  value: React.ReactNode;
  /** Unit suffix, e.g. "€" or "%". */
  unit?: string;
  /** Muted line under the figure. */
  meta?: React.ReactNode;
  /** Value color. plan=teal, warn=amber, ok=green, default=ink. */
  tone?: 'default' | 'plan' | 'warn' | 'ok';
  /** hero = the one big focus number; tile = mid; chip = compact bordered tile. */
  size?: 'hero' | 'tile' | 'chip';
  /** Optional <Pill> rendered inline after the label. */
  tag?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A single headline figure (label · value · meta) with tabular numerals.
 * Use `hero` for the screen's one focus number, `chip` for the supporting trio.
 * @startingPoint section="Core" subtitle="Headline figure" viewport="700x180"
 */
export function KPIStat(props: KPIStatProps): React.JSX.Element;
