// Bereich — ein Navigationspunkt mit mehreren Registern.
//
// Ersetzt die Sammlung aufklappbarer Karten: statt fünf zugeklappter Bereiche
// untereinander, von denen man fast immer genau einen will, steht oben eine Leiste und
// darunter der gewählte. Der Unterschied zum Aufklappen ist, dass immer GENAU EINER
// offen ist — das war beim Klappen nie garantiert und der Grund, warum man am Ende doch
// wieder scrollte.
//
// Wichtig und nicht bloß Kosmetik: Es wird nur das aktive Register gerendert. Die Inhalte
// laden ihre Daten in eigenen Effekten, und die laufen damit erst, wenn jemand das
// Register wählt. Die Trainingsdaten ziehen den gesamten Ledger und rechnen die Merkmale
// darüber — das beim Öffnen des Bereichs zu tun, obwohl jemand nur eine Person umbenennen
// will, wäre Arbeit für nichts. Genau dieselbe Überlegung stand hinter dem verzögerten
// Rendern der alten Klappkarte; sie gilt hier unverändert weiter.

import { useState, type ReactNode } from "react";
import { PageHead } from "./PageHead";

export interface RegisterDef {
  /** Stabiler technischer Schlüssel — nicht der Anzeigename. */
  readonly id: string;
  readonly label: string;
  /** Erklärt das Register; erscheint als Untertitel im Kopf, wenn es aktiv ist. */
  readonly untertitel?: string;
  /** Erst beim Wechsel auf dieses Register aufgerufen. */
  readonly inhalt: () => ReactNode;
}

export function Bereich({
  titel,
  register,
  start,
}: {
  titel: string;
  register: readonly RegisterDef[];
  /** Register, das beim Betreten offen ist. Vorgabe: das erste. */
  start?: string;
}) {
  const [aktiv, setAktiv] = useState(start ?? register[0]?.id);
  const offen = register.find((r) => r.id === aktiv) ?? register[0];

  return (
    <div className="screen">
      <PageHead title={titel} subtitle={offen?.untertitel} />

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "var(--sp-4)",
          borderBottom: "1px solid var(--line)",
          marginBottom: "var(--sp-4)",
          // Die Leiste darf waagerecht rollen, wenn viele Register nebeneinander stehen.
          // `overflow-y` MUSS dabei ausdrücklich dastehen: sobald eine der beiden Achsen
          // nicht mehr `visible` ist, rechnet der Browser die andere zu `auto` um — und
          // die Reiter ragen mit ihrem `marginBottom: -1` genau einen Pixel über den
          // Kasten hinaus. Das reicht für einen senkrechten Rollbalken an einer Leiste,
          // die nur eine Zeile hoch ist.
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {register.map((r) => {
          const istAktiv = r.id === offen?.id;
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={istAktiv}
              onClick={() => setAktiv(r.id)}
              style={{
                background: "none",
                border: 0,
                // Der aktive Reiter trägt die Akzentlinie; das Absetzen um einen Pixel
                // legt sie über die Trennlinie der Leiste, statt daneben.
                borderBottom: `2px solid ${istAktiv ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
                padding: "var(--sp-2) 0",
                cursor: "pointer",
                font: "inherit",
                fontWeight: istAktiv ? "var(--fw-bold)" : "inherit",
                color: istAktiv ? "var(--ink)" : "var(--ink-3)",
                whiteSpace: "nowrap",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{offen?.inhalt()}</div>
    </div>
  );
}
