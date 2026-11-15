// LeererZustand — was ein Bereich sagt, solange in ihm nichts steht.
//
// Ein neuer Nutzer kommt über die Karte „Damit die Zahlen stimmen" in einen Bereich und
// fand dort bis 2026-11-15 oft nur eine leere Tabelle oder einen Satz wie „Noch keine
// Verträge." Das sagt, DASS nichts da ist, aber nicht, was hierher gehört, wozu es gut
// ist und was jetzt zu tun ist. Der Bereich Vermögen zeigte, wie es besser geht: ein
// Absatz und die Knöpfe zum Anlegen. Dieser Baustein ist dieselbe Form für alle übrigen.
//
// **Keine Karte.** Der leere Zustand steht meist IN der Karte, die sonst die Tabelle
// trägt (Budgets, Gebucht, Rücklagen) — eine eigene Fläche wäre dort eine Karte in einer
// Karte. Wer ihn allein zeigt, legt eine `Card` darum.
//
// **`kopf` ist der Satz, den es vorher schon gab.** Er bleibt im Wortlaut stehen und wird
// nur ergänzt: vorhandene Texte werden nicht umformuliert.
//
// Er merkt sich nichts. Ob er erscheint, folgt aus dem Bestand — sobald etwas da ist,
// steht die Tabelle an seiner Stelle.

import type { ReactNode } from "react";
import { Stapel, Zeile } from "./Anordnung";

export interface LeererZustandProps {
  /** Der kurze Satz „noch nichts da", falls der Bereich schon einen hatte. */
  readonly kopf?: ReactNode;
  /** Was hierher gehört, wozu es gut ist, was als Nächstes dran ist — zwei, drei Sätze. */
  readonly children: ReactNode;
  /** Die Knöpfe zum nächsten Schritt. Ohne sie (Tests ohne Shell) steht nur der Text da. */
  readonly aktionen?: ReactNode;
}

export function LeererZustand({ kopf, children, aktionen }: LeererZustandProps) {
  return (
    <Stapel abstand={3}>
      {kopf && <div style={{ fontWeight: "var(--fw-semi)" }}>{kopf}</div>}
      <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.55 }}>{children}</p>
      {aktionen && <Zeile abstand={3}>{aktionen}</Zeile>}
    </Stapel>
  );
}
