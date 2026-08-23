// Enter bestätigt — der Handgriff, der sonst an jedem Feld einzeln fehlt.
//
// Wer eine PIN oder TAN tippt, hat beide Hände auf der Tastatur. Zur Maus zu greifen, um
// einen Knopf zu treffen, ist genau an dieser Stelle der unnötigste Weg — und es fällt
// erst auf, wenn man es zum zwanzigsten Mal tut.
//
// **Leere Eingabe tut nichts.** Ein Abbruch geschieht über das Schliessen, nicht über ein
// leeres Enter, das wie ein Versehen aussieht: der Dialog verschwände, und niemand wüsste,
// ob abgebrochen oder abgeschickt wurde. Deshalb `aktiv`, und deshalb ist die Vorgabe
// `true` nur für Fälle ohne Eingabefeld gedacht.

import type { KeyboardEvent } from "react";

export function beiEnter(handler: () => void, aktiv = true) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !aktiv) return;
    // Sonst schickt der Browser ein umgebendes Formular ab — und in einem Modal ist das
    // ein Neuladen der ganzen Seite.
    e.preventDefault();
    handler();
  };
}
