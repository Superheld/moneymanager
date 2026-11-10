import React from 'react';

/** Native Felder, die ein <label> per htmlFor benennen kann. */
var FELDER = { input: true, select: true, textarea: true };

/**
 * FormField — label (with optional required asterisk) over an input slot, with optional hint.
 * Pass a real input. (Die Vorlage brachte ausserdem ein `Input` mit — ein Kasten, der
 * wie ein Feld aussah und keines war. Niemand benutzte ihn; entfernt 2026-11-10.)
 *
 * Das Label ist mit dem Feld VERKNÜPFT (htmlFor/id). Ohne das hat ein Feld für
 * Screenreader keinen Namen: das <label> steht nur daneben, und die Beschriftung, die man
 * sieht, existiert für die Vorlesehilfe nicht — sie meldet „Eingabefeld". Die Lücke fiel
 * lange nicht auf, weil einzelne Felder ein eigenes `aria-label` tragen; an der Mehrzahl
 * fehlte es.
 *
 * Verknüpft wird nur ein einzelnes NATIVES Feld. Bei einer eigenen Komponente als Kind
 * (etwa CategoryPicker) zeigte ein htmlFor auf eine id, die dort niemand setzt — ins Leere
 * gezeigt ist nicht besser als gar nicht gezeigt. Solche Komponenten benennen sich selbst.
 * Eine bereits gesetzte `id` gewinnt: der Aufrufer weiss besser, wofür er sie braucht.
 */
export function FormField({ label, required = false, hint, children, style }) {
  var eigeneId = React.useId();
  var einzeln = React.isValidElement(children) && FELDER[children.type] === true;
  var feldId = einzeln ? (children.props.id || eigeneId) : undefined;
  var feld = einzeln && !children.props.id ? React.cloneElement(children, { id: feldId }) : children;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, ...style }}>
      {label && <label htmlFor={feldId} style={{ fontSize:'var(--fs-2xs)', fontWeight:'var(--fw-bold)', textTransform:'uppercase',
        letterSpacing:'.04em', color:'var(--ink-3)' }}>{label}{required && <span style={{ color:'var(--accent-deep)' }}> *</span>}</label>}
      {feld}
      {hint && <span style={{ fontSize:'12px', color:'var(--ink-3)' }}>{hint}</span>}
    </div>
  );
}
