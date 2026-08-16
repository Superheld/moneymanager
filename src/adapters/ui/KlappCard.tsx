// Eine Karte, die eingeklappt startet — der Baustein, aus dem die Einstellungen bestehen.

import { useState, type ReactNode } from "react";
import { Card } from "./ds";

/**
 * Eine Karte, die eingeklappt startet. Der Einstellungs-Screen ist eine Sammlung von
 * Bereichen, von denen man fast immer genau einen will — ausgeklappt scrollt man an vier
 * Listen vorbei, um an die fünfte zu kommen.
 *
 * Der Inhalt wird erst gerendert, wenn jemand aufklappt. Das ist mehr als eine Anzeige-
 * frage: die Kinder laden ihre Daten in eigenen Effekten, und die laufen damit erst bei
 * Bedarf. Die Lernmaterial-Karte zieht den gesamten Ledger (5280 Zahlungen) und rechnet
 * die Merkmale darüber — das beim Öffnen der Einstellungen zu tun, obwohl jemand nur
 * eine Person umbenennen will, ist Arbeit für nichts.
 *
 * `action` erscheint nur im offenen Zustand: ein „+"-Knopf über einer eingeklappten
 * Liste lädt zum versehentlichen Klick ein.
 */
export function KlappCard({
  titel,
  untertitel,
  action,
  beiOeffnen,
  children,
}: {
  titel: string;
  untertitel?: ReactNode;
  action?: ReactNode;
  /** Läuft beim ERSTEN Aufklappen — der Haken, an dem teures Nachladen hängt. */
  beiOeffnen?: () => void;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [jeGeoeffnet, setJeGeoeffnet] = useState(false);

  function umschalten() {
    if (!jeGeoeffnet) {
      setJeGeoeffnet(true);
      beiOeffnen?.();
    }
    setOffen((o) => !o);
  }

  return (
    <Card
      title={
        <button
          type="button"
          onClick={umschalten}
          aria-expanded={offen}
          style={{
            background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer",
            font: "inherit", color: "inherit", display: "flex", alignItems: "center",
            gap: "var(--sp-2)", textAlign: "left",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "0.8em", opacity: 0.6 }}>{offen ? "▾" : "▸"}</span>
          {titel}
        </button>
      }
      subtitle={untertitel}
      action={offen ? action : undefined}
    >
      {offen && children}
    </Card>
  );
}
