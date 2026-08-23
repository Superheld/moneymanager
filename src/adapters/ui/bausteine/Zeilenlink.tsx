// Der Bezeichner einer Tabellenzeile, der weiterführt.
//
// **Warum nicht `onRowClick`.** `DataTable` kann die ganze Zeile klickbar machen, und das
// sieht man ihr nicht an — der Cursor wechselt, sonst nichts. Wer eine Tabelle vor sich
// hat, probiert nicht jede Zeile durch; er sieht keine Möglichkeit und geht davon aus,
// dass es keine gibt. Genau so ist die Verwaltung lange dagesessen: vier Register voller
// Tabellen, in denen nichts zu klicken schien.
//
// Ein Link im Bezeichner zeigt sich dagegen selbst an. Er ist die kleinere Trefferfläche
// und trotzdem der bessere Weg, weil man ihn überhaupt erst findet.
//
// **Nicht zu verwechseln mit `.linkbtn`.** Die Klasse gibt es schon, und sie ist für das
// Gegenteil gedacht: eine gedämpfte Nebenaktion in einer Zeile („Profil ansehen"), die
// sich zurückhalten soll. Dies hier ist der Weg weiter und muss sich zeigen.
//
// **Es ist ein `button`, kein `a`.** Innerhalb der App wird nicht navigiert, sondern ein
// Register gewechselt und etwas ausgewählt — es gibt keine Adresse, die man kopieren oder
// in einem neuen Fenster öffnen könnte. Ein `a` ohne `href` wäre für eine Vorlesehilfe
// gar nichts, eines mit `href="#"` ein Versprechen, das die App nicht hält.

import type { ReactNode } from "react";

export interface ZeilenlinkProps {
  /** Was dasteht — meist der Bezeichner der Zeile. */
  readonly children: ReactNode;
  readonly onKlick: () => void;
  /**
   * Wohin es führt, als ganzer Satz.
   *
   * Pflicht, und das ist der Grund: „Girokonto" allein sagt einer Vorlesehilfe nicht, dass
   * hier etwas passiert, und dem Sehenden nicht, WAS passiert. Beides steht im Titel.
   */
  readonly titel: string;
}

export function Zeilenlink({ children, onKlick, titel }: ZeilenlinkProps) {
  return (
    <button type="button" className="zeilenlink" onClick={onKlick} title={titel} aria-label={titel}>
      {children}
    </button>
  );
}
