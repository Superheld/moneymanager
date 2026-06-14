import * as React from 'react';

export interface ButtonProps {
  variant?: 'default' | 'primary' | 'ghost';
  /** Show a leading "+" (for create actions). */
  plus?: boolean;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Button — primary teal fill for the main create action, default hairline otherwise.
 * @startingPoint section="Controls" subtitle="Button variants" viewport="700x150"
 */
export function Button(props: ButtonProps): React.JSX.Element;
