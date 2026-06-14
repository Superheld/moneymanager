import * as React from 'react';

export interface RadioCardProps {
  title: React.ReactNode;
  /** Explainer line under the title. */
  desc?: React.ReactNode;
  selected?: boolean;
  /** Optional right-aligned node (e.g. a Pill). */
  tag?: React.ReactNode;
  onClick?: () => void;
}

/**
 * Selectable explainer card for choices that need teaching — Charakter (Aufwand/Ertrag/
 * Umschichtung), Topf-Art (Spartopf/Puffer), Budget-Glättung. Selected = teal wash.
 * @startingPoint section="Forms" subtitle="Explainer radio card" viewport="700x180"
 */
export function RadioCard(props: RadioCardProps): React.JSX.Element;
