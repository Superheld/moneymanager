import * as React from 'react';

export interface NavItemProps {
  /** Visible label. */
  label: React.ReactNode;
  /** Highlights the row with the teal wash. */
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * One row in the left sidebar nav. Active = teal wash + filled marker.
 * @startingPoint section="Core" subtitle="Sidebar nav row" viewport="700x150"
 */
export function NavItem(props: NavItemProps): React.JSX.Element;
