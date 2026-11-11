// FormField — Beschriftung (mit optionalem Pflicht-Stern) über einem Feld, darunter ein
// Hinweis. Mechanik von Base UI `Field` (seit 2026-11-10), Aussehen in `app.css`
// (`.formfeld-*`). Das Feld kommt als Kind herein.
//
// **Warum Base UI darunter.** Der Eigenbau verknüpfte die Beschriftung per `htmlFor/id`
// mit einem einzelnen NATIVEN Feld — und sonst nichts. Der Hinweis darunter war mit
// keinem Feld verbunden: eine Vorlesehilfe las ihn nie vor, obwohl er oft die
// Einschränkung trägt, ohne die man das Feld falsch ausfüllt. `Field` verbindet beides:
// Name über das Label, Hinweis über `aria-describedby`.
//
// **`Field` nur um ein einzelnes NATIVES Feld** (`input`, `select`, `textarea`). Es wird
// `Field.Control`, das Label bleibt ein echtes `<label for>` (ein Klick setzt den Fokus),
// und der Hinweis wird seine Beschreibung.
//
// **Alles andere bleibt einfaches Markup ohne `Field`, und das ist gemessen, nicht
// vorsichtig:** `Field` ist für EIN Bedienteil gebaut, und jedes Base-UI-Teil darin meldet
// sich dort an. Um eine Liste herum („Merkmale" mit einer Auswahl und einem Kästchen je
// Zeile, „Inhaber" mit einem Kästchen je Person) hiessen danach ALLE wie das Feld — die
// Auswahl „Merkmale" statt „Art des Merkmals", jedes Kästchen „Inhaber" statt wie die
// Person. Eine eigene Komponente (`CategoryPicker`, `Auswahl`) benennt sich deshalb weiter
// selbst, wie vorher; ein `for` auf eine id, die niemand setzt, gibt es dabei nicht.
//
// **Der Pflicht-Stern ist `aria-hidden`.** Er ist eine Markierung fürs Auge; im Namen
// hiesse das Feld sonst „Konto *", und eine Vorlesehilfe läse „Konto Stern".
//
// Eine bereits gesetzte `id` am Feld gewinnt: der Aufrufer weiss besser, wofür er sie
// braucht. (Die Vorlage brachte ausserdem ein `Input` mit — ein Kasten, der wie ein Feld
// aussah und keines war. Niemand benutzte ihn; entfernt 2026-11-10.)

import { Field } from "@base-ui/react/field";
import { isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

/** Native Felder, die ein `<label>` per `for` benennen kann. */
const FELDER = new Set(["input", "select", "textarea"]);

export interface FormFieldProps {
  label?: ReactNode;
  required?: boolean;
  /** Erklärung unter dem Feld — vorgelesen als Beschreibung des Feldes. */
  hint?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function FormField({ label, required = false, hint, children, style }: FormFieldProps) {
  const nativ = isValidElement(children) && typeof children.type === "string" && FELDER.has(children.type);
  const stern = required && (
    <span className="formfeld-pflicht" aria-hidden="true">
      {" *"}
    </span>
  );

  if (!nativ) {
    return (
      <div className="formfeld" style={style}>
        {label && (
          <label className="formfeld-label">
            {label}
            {stern}
          </label>
        )}
        {children}
        {hint && <span className="formfeld-hinweis">{hint}</span>}
      </div>
    );
  }

  return (
    <Field.Root className="formfeld" style={style}>
      {label && (
        <Field.Label className="formfeld-label">
          {label}
          {stern}
        </Field.Label>
      )}
      <Field.Control render={children as ReactElement<Record<string, unknown>>} />
      {hint && (
        <Field.Description className="formfeld-hinweis" render={<span />}>
          {hint}
        </Field.Description>
      )}
    </Field.Root>
  );
}
