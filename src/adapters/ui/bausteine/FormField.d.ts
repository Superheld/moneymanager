import * as React from 'react';

export interface FormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export interface InputProps {
  value?: string;
  placeholder?: string;
  /** Unit suffix, e.g. "€" or "Jahre". */
  suffix?: string;
  /** Show a ▾ caret (select-like). */
  caret?: boolean;
  /** Dashed teal computed-value styling (for derived fields like Ansparrate). */
  calc?: boolean;
}

/**
 * Labelled form row (uppercase label, optional required *, hint). Pair with Input.
 * @startingPoint section="Forms" subtitle="Labelled field + input" viewport="700x170"
 */
export function FormField(props: FormFieldProps): React.JSX.Element;
/** Styled display field box; `calc` renders the dashed-teal computed look. */
export function Input(props: InputProps): React.JSX.Element;
