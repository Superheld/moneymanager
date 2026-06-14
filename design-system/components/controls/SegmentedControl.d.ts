import * as React from 'react';

export interface SegmentedControlProps {
  /** Options as strings or {value,label} objects. */
  options: (string | { value: string; label: React.ReactNode })[];
  value: string;
  onChange?: (value: string) => void;
}

/**
 * Pill-bordered exclusive toggle (Gesamt/je Konto, Monat/Jahr, Alle/Ausgaben/…). Active = teal wash.
 * @startingPoint section="Controls" subtitle="Segmented toggle" viewport="700x150"
 */
export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
