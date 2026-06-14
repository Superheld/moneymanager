// App-Shell — Sidebar + Inhaltsfläche im Design-System-Stil. Minimale Navigation
// per State (kein Router-Dep, solange es wenige Screens sind). Aktive Screens sind
// klickbar; spätere Bereiche (BAUPLAN P2+) sind als deaktiviert sichtbar.

import type { ReactNode } from "react";
import { APP_VERSION } from "../../version";

export type ScreenId =
  | "uebersicht"
  | "toepfe"
  | "inventar"
  | "budgets"
  | "vertraege"
  | "deckung"
  | "stammdaten";

interface NavEntry {
  id?: ScreenId;
  label: string;
  badge?: string;
}

interface NavGroup {
  titel: string;
  eintraege: NavEntry[];
}

const GRUPPEN: NavGroup[] = [
  {
    titel: "Überblick",
    eintraege: [
      { id: "uebersicht", label: "Übersicht", badge: "Plan" },
      { id: "toepfe", label: "Töpfe" },
      { id: "inventar", label: "Inventar" },
      { id: "budgets", label: "Budgets" },
      { id: "vertraege", label: "Verträge" },
      { id: "deckung", label: "Deckung" },
    ],
  },
  {
    titel: "Verwaltung",
    eintraege: [{ id: "stammdaten", label: "Stammdaten" }],
  },
];

export function AppShell({
  current,
  onNavigate,
  children,
}: {
  current: ScreenId;
  onNavigate: (id: ScreenId) => void;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="mk">M</div>
          <div>
            <div className="nm">Moneymanager</div>
            <div className="sub">deine private Bilanz</div>
          </div>
        </div>

        {GRUPPEN.map((g) => (
          <div key={g.titel}>
            <span className="nlbl">{g.titel}</span>
            <nav className="nav">
              {g.eintraege.map((e) => {
                const aktiv = e.id === current;
                const klickbar = !!e.id;
                return (
                  <a
                    key={e.label}
                    className={[aktiv ? "on" : "", klickbar ? "" : "disabled"].join(" ").trim()}
                    title={klickbar ? undefined : "kommt in einer späteren Phase"}
                    onClick={klickbar ? () => onNavigate(e.id!) : undefined}
                  >
                    <span className="dot" />
                    {e.label}
                    {e.badge && <span className="bdg">{e.badge}</span>}
                  </a>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="foot">
          <div>Moneymanager {APP_VERSION}</div>
          <div>Lokal · keine Cloud</div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
