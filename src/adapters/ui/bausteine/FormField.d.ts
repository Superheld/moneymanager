import * as React from 'react';

export interface FormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Labelled form row (uppercase label, optional required *, hint).
 * @startingPoint section="Forms" subtitle="Labelled field + input" viewport="700x170"
 */
export function FormField(props: FormFieldProps): React.JSX.Element;
