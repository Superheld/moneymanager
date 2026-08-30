// Ein Feld und der Knopf, der dazugehört — nebeneinander statt untereinander.
//
// **Wann diese Zeile richtig ist:** wenn der Knopf eine ZWEITE MÖGLICHKEIT an derselben
// Stelle anbietet — „wähl einen Vertrag ODER leg einen neuen an", „stell die Sperre ODER
// sperre sofort". Untereinander liest sich derselbe Knopf als Abschluss eines Formulars,
// und das ist er nicht: er schickt nichts ab.
//
// **Wann sie falsch ist:** wenn der Knopf das Formular tatsächlich abschliesst. Dafür gibt
// es `.form-actions`, und dort gehört er auch hin — unter alle Felder, nicht neben eines.
//
// Die Regel, nach der man im Zweifel entscheidet: **steht über dem Knopf noch ein Feld,
// das er nicht meint, gehört er nach unten.** Meint er genau das eine Feld daneben, gehört
// er daneben.
//
// Das Aussehen steckt in `.feldzeile` (app.css) — dort steht auch, warum `flex-end` und
// `min-width: 0` die eigentliche Arbeit tun.

import type { ReactNode } from "react";

export function Feldzeile({ feld, knopf }: { feld: ReactNode; knopf: ReactNode }) {
  return (
    <div className="feldzeile">
      <div className="feldzeile-feld">{feld}</div>
      <div className="feldzeile-knopf">{knopf}</div>
    </div>
  );
}
