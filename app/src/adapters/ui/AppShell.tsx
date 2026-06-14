// App-Shell — Sidebar + Inhaltsfläche im Design-System-Stil. In P0 ist nur
// „Übersicht" aktiv; die übrigen Punkte deuten die spätere Navigation an (BAUPLAN
// P1+), sind aber bewusst deaktiviert. Kein Router nötig, solange es einen Screen gibt.

import type { ReactNode } from "react";

const UEBERBLICK = ["Liquidität", "Töpfe", "Budgets", "Verträge", "Deckung", "Analysen"];

export function AppShell({ children }: { children: ReactNode }) {
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

        <div>
          <span className="nlbl">Überblick</span>
          <nav className="nav">
            <a className="on">
              <span className="dot" />
              Übersicht
            </a>
            {UEBERBLICK.map((label) => (
              <a key={label} className="disabled" title="kommt in einer späteren Phase">
                <span className="dot" />
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="foot">
          <div>P0 · Walking Skeleton</div>
          <div>Lokal · keine Cloud</div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
