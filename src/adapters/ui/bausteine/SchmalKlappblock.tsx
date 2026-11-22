// Ein Stück Seite, das schmal hinter einer Zeile einklappt und breit einfach dasteht.
//
// Am Handy steht in den Bereichen Buchungen und Rücklagen oben, womit man arbeitet; was
// man nachsieht (die Kontenliste, Tacho, „Wo das Geld liegt" …), rückt darunter und
// klappt ein (seit 2026-11-22, `ui/CLAUDE.md` unter „Mobile first"). Breit ändert sich
// nichts: dort ist Platz, und die Karten stehen wie vorher offen.
//
// **Kein zweiter Mechanismus.** Die Zeile ist `Klappblock` — derselbe Titel mit ▸/▾,
// dieselbe Base-UI-Mechanik, derselbe Knopf, der schmal schon 44 px hoch ist (`.btn`).
// Dazu kommt nur, was `Klappblock` bewusst nicht hat: eigener Zustand (hier lädt nichts
// beim ersten Öffnen nach) und die Frage nach der Breite.
//
// **Der Inhalt steht neben der Zeile, nicht in einer Karte.** Was einklappt, sind selbst
// Karten; eine Karte um sie wäre eine Karte in der Karte (`kartenschachtelung.test.tsx`).
//
// Baustein, weil es zwei Bereiche benutzen (`kontoauszug/`, `ruecklagen/`).

import { useState, type ReactNode } from "react";
import { Klappblock } from "./Klappblock";
import { useSchmal } from "./useSchmal";

export function SchmalKlappblock({
  titel,
  zusatz,
  children,
}: {
  /** Die Überschrift der Karte(n) darin — kein neuer Name für dieselbe Sache. */
  titel: ReactNode;
  /** Gedämpft hinter dem Titel, etwa eine Anzahl. */
  zusatz?: ReactNode;
  children: ReactNode;
}) {
  const schmal = useSchmal();
  const [offen, setOffen] = useState(false);
  if (!schmal) return <>{children}</>;
  return (
    <Klappblock titel={titel} zusatz={zusatz} offen={offen} onUmschalten={() => setOffen((o) => !o)}>
      <div className="schmal-klappblock-inhalt">{children}</div>
    </Klappblock>
  );
}
