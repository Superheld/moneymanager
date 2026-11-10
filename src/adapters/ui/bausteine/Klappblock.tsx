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

import type { ReactNode } from "react";

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
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      <button className="linkbtn" onClick={onUmschalten} aria-expanded={offen}>
        {offen ? "▾" : "▸"} {titel}
        {zusatz != null && <> <span className="muted">{zusatz}</span></>}
      </button>
      {offen && <div style={{ marginTop: "var(--sp-2)" }}>{children}</div>}
    </div>
  );
}
