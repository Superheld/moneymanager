import * as React from 'react';

export interface LiveResultProps {
  /** Uppercase label, e.g. "Ansparrate (berechnet)". */
  label: React.ReactNode;
  /** The big derived figure, e.g. "+150 €". */
  value?: React.ReactNode;
  /** Explanation of the calculation. */
  sub?: React.ReactNode;
  /** Extra rows (e.g. a CoverageTrack or Pill explanation). */
  children?: React.ReactNode;
}

/**
 * The teal live-computed box in create dialogs — shows the derived figure (Ansparrate,
 * Plan-Wirkung, geglätteter Abfluss) updating as the user fills the form. The key teaching moment.
 * @startingPoint section="Forms" subtitle="Live computed result" viewport="700x170"
 */
export function LiveResult(props: LiveResultProps): React.JSX.Element;
