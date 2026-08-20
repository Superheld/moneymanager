import * as React from 'react';

export interface CardProps {
  /** Optional bold card title. */
  title?: React.ReactNode;
  /** Optional muted subtitle under the title. */
  subtitle?: React.ReactNode;
  /** Optional node rendered on the right of the header (e.g. a legend or button). */
  action?: React.ReactNode;
  /** Elevate with a soft shadow instead of the default flat hairline. */
  floating?: boolean;
  /** Apply default inner padding (default true). */
  pad?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Flat surface panel with a hairline border — the default container for content.
 * Stays flat unless `floating`. Pairs a title/subtitle header with arbitrary body.
 * @startingPoint section="Core" subtitle="Flat panel container" viewport="700x220"
 */
export function Card(props: CardProps): React.JSX.Element;
