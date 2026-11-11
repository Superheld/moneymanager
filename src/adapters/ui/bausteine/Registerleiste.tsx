// Registerleiste — die Reiter und darunter das gewählte Register. Mechanik von Base UI
// `Tabs` (seit 2026-11-10).
//
// Herausgelöst aus `Bereich`, als die Analyse Reiter bekam: dort stehen Zeitraum und
// Kennzahlen ZWISCHEN Seitenkopf und Reitern, weil sie für jedes Register gelten, und
// `Bereich` legt den Kopf fest über die Leiste. Eine zweite Leiste daneben hätte beim
// nächsten Feinschliff anders ausgesehen als die erste.
//
// **Warum Base UI darunter.** Der Eigenbau trug die Rollen (`tablist`, `tab`) und sonst
// nichts: keine Pfeiltasten zwischen den Reitern — jede Registerkarte war ein eigener Halt
// für die Tabulatortaste —, und das Register darunter war mit keinem Reiter verbunden.
// `Bereich` setzte ein loses `role="tabpanel"`, die Analyse gar keins. Jetzt ist der
// INHALT ein Kind der Leiste und wird `Tabs.Panel`: er heisst wie sein Reiter, und eine
// Vorlesehilfe weiss, wozu er gehört.
//
// **Es wird nur das aktive Register gerendert**, wie vorher (Grund in `Bereich.tsx`): die
// Inhalte laden in eigenen Effekten, und die sollen erst laufen, wenn jemand hinsieht.
// Deshalb gibt es genau ein Panel, und es zeigt, was der Aufrufer hineingibt.

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export interface Register {
  /** Stabiler technischer Schlüssel — nicht der Anzeigename. */
  readonly id: string;
  readonly label: string;
}

export function Registerleiste({
  register,
  aktiv,
  onWahl,
  children,
  stapeln = false,
}: {
  register: readonly Register[];
  aktiv: string | undefined;
  onWahl: (id: string) => void;
  /** Der Inhalt des aktiven Registers. */
  children?: ReactNode;
  /**
   * Die Kinder des Registers stehen als Karten untereinander und bekommen den
   * Kartenabstand von hier (die Analyse). Ohne die Angabe ordnet der Inhalt sich selbst
   * (`Bereich`: jedes Register ist eine eigene Komponente mit eigenem Aufbau).
   */
  stapeln?: boolean;
}) {
  // Die Wurzel ist selbst ein Stapel mit Kartenabstand: vorher standen Leiste und Inhalt
  // als zwei Kinder in `.screen`, und der Abstand dazwischen kam von dort. Seit beides in
  // EINER Wurzel steht, muss sie ihn selbst tragen — sonst rückt der Inhalt um genau
  // diesen Abstand an die Leiste heran (am Bildschirmvergleich gefunden).
  return (
    <Tabs.Root className="registerbereich" value={aktiv ?? null} onValueChange={(id) => onWahl(String(id))}>
      <Tabs.List className="registerleiste">
        {register.map((r) => (
          <Tabs.Tab key={r.id} value={r.id} className="registerleiste-reiter">
            {r.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {aktiv !== undefined && (
        <Tabs.Panel value={aktiv} className={stapeln ? "registerinhalt--stapel" : undefined}>
          {children}
        </Tabs.Panel>
      )}
    </Tabs.Root>
  );
}
