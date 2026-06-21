// App-Shell — Sidebar + Inhaltsfläche im Design-System-Stil. Minimale Navigation
// per State (kein Router-Dep, solange es wenige Screens sind). Aktive Screens sind
// klickbar; spätere Bereiche (BAUPLAN P2+) sind als deaktiviert sichtbar.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../../version";

export type ScreenId =
  | "uebersicht"
  | "konten"
  | "toepfe"
  | "inventar"
  | "budgets"
  | "vertraege"
  | "deckung"
  | "import"
  | "einstellungen";

interface NavEntry {
  id?: ScreenId;
  labelKey: string;
  badgeKey?: string;
}

interface NavGroup {
  titelKey: string;
  eintraege: NavEntry[];
}

const GRUPPEN: NavGroup[] = [
  {
    titelKey: "shell.gruppeUeberblick",
    eintraege: [
      { id: "uebersicht", labelKey: "shell.navUebersicht", badgeKey: "shell.badgePlan" },
      { id: "konten", labelKey: "shell.navKonten" },
      { id: "budgets", labelKey: "shell.navBudgets" },
      { id: "toepfe", labelKey: "shell.navToepfe" },
      { id: "inventar", labelKey: "shell.navInventar" },
      { id: "vertraege", labelKey: "shell.navVertraege" },
      { id: "deckung", labelKey: "shell.navDeckung" },
    ],
  },
  {
    titelKey: "shell.gruppeVerwaltung",
    eintraege: [
      { id: "import", labelKey: "shell.navImport" },
      { id: "einstellungen", labelKey: "shell.navEinstellungen" },
    ],
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
  const { t } = useTranslation();
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="mk">M</div>
          <div>
            <div className="nm">Moneymanager</div>
            <div className="sub">{t("shell.brandSub")}</div>
          </div>
        </div>

        {GRUPPEN.map((g) => (
          <div key={g.titelKey}>
            <span className="nlbl">{t(g.titelKey)}</span>
            <nav className="nav">
              {g.eintraege.map((e) => {
                const aktiv = e.id === current;
                const klickbar = !!e.id;
                return (
                  <a
                    key={e.labelKey}
                    className={[aktiv ? "on" : "", klickbar ? "" : "disabled"].join(" ").trim()}
                    title={klickbar ? undefined : t("shell.spaeterePhase")}
                    onClick={klickbar ? () => onNavigate(e.id!) : undefined}
                  >
                    <span className="dot" />
                    {t(e.labelKey)}
                    {e.badgeKey && <span className="bdg">{t(e.badgeKey)}</span>}
                  </a>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="foot">
          <div>Moneymanager {APP_VERSION}</div>
          <div>{t("shell.footLokal")}</div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
