// Ein Abschnitt, der sich auf- und zuklappen lässt — Trennlinie, Titel mit ▸/▾, Inhalt.
//
// Bis 2026-11-09 stand dieses Muster dreimal ausgeschrieben im Buchungsdialog (Herkunft,
// Journal, Merkmale), jedes Mal mit denselben Abständen von Hand — und die nächste Stelle
// hätte es ein viertes Mal gebaut. Baustein, weil es zwei Bereiche benutzen (`buchung/`
// und `training/`).
//
// **Gesteuert von aussen** (`offen`, `onUmschalten`), nicht mit eigenem Zustand: der
// Merkmalsblock lädt beim ersten Aufklappen nach und muss den Moment kennen. Ein Block mit
// innerem Zustand hätte dafür einen zweiten Rückruf gebraucht.
//
// Nicht verwechseln mit `Aufklappflaeche`: die hängt unter einer Tabellenzeile und zeigt
// eine Liste; das hier ist ein Abschnitt in einem Formular oder Dialog.

import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";

// **Mechanik von Base UI `Collapsible`** (seit 2026-11-10): der Knopf trägt
// `aria-expanded` UND `aria-controls`, verweist also auf den Abschnitt, den er öffnet —
// der Eigenbau sagte nur, DASS etwas aufgeht, nicht was. Geschlossen ist der Inhalt nicht
// im Baum, wie vorher: der Merkmalsblock lädt erst beim Öffnen.
export function Klappblock({
  titel,
  zusatz,
  offen,
  onUmschalten,
  children,
}: {
  titel: ReactNode;
  /** Gedämpft hinter dem Titel, etwa eine Anzahl. */
  zusatz?: ReactNode;
  offen: boolean;
  onUmschalten: () => void;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root
      open={offen}
      onOpenChange={onUmschalten}
      style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}
    >
      {/* Aussehen des Link-Knopfs (`Button variant="link"`), Mechanik vom Collapsible. */}
      <Collapsible.Trigger className="btn btn--link">
        {offen ? "▾" : "▸"} {titel}
        {zusatz != null && <> <span className="muted">{zusatz}</span></>}
      </Collapsible.Trigger>
      <Collapsible.Panel style={{ marginTop: "var(--sp-2)" }}>{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
