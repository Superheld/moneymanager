import * as React from 'react';

export interface DialogProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Called on scrim click and close button. */
  onClose?: () => void;
  /** Footer node (buttons). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Centered modal for create/edit flows (Vertrag/Topf/Budget anlegen). Scrim + header + body + footer.
 * Compose with FormField, RadioCard and LiveResult inside.
 * @startingPoint section="Forms" subtitle="Create/edit modal" viewport="700x520"
 */
export function Dialog(props: DialogProps): React.JSX.Element;
