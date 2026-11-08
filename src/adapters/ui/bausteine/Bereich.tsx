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
import { Registerleiste } from "./Registerleiste";

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

      <Registerleiste register={register} aktiv={offen?.id} onWahl={setAktiv} />

      <div role="tabpanel">{offen?.inhalt()}</div>
    </div>
  );
}
