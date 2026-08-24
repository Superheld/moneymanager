// App-Shell — Sidebar + Inhaltsfläche im Design-System-Stil. Minimale Navigation
// per State (kein Router-Dep, solange es wenige Screens sind). Aktive Screens sind
// klickbar; spätere Bereiche (BAUPLAN P2+) sind als deaktiviert sichtbar.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { APP_STADIUM, APP_VERSION } from "../../../version";
import { AktualisierungKnopf } from "./AktualisierungKnopf";

export type ScreenId =
  | "uebersicht"
  | "analyse"
  | "konten"
  | "inventar"
  | "budgets"
  | "vertraege"
  | "kontenverwaltung"
  | "import"
  | "training"
  | "einstellungen";

interface NavEntry {
  id?: ScreenId;
  labelKey: string;
}

interface NavGroup {
  titelKey: string;
  eintraege: NavEntry[];
}

const GRUPPEN: NavGroup[] = [
  {
    titelKey: "shell.gruppeUeberblick",
    eintraege: [
      // Getrennt seit 2026-08-19: „Übersicht" zeigt, was JETZT gilt (drei Monatskarten
      // plus die Budgets des laufenden Monats), „Analyse" wertet Zeiträume aus. Vorher
      // war beides ein Screen, und die Kategorien standen ganz unten.
      // Der frühere Bereich „Planung" (Jahresprojektion, Szenarien) und „Deckung" sind
      // 2026-08-16 entfallen — sie kommen wieder, dann aber anders geschnitten.
      { id: "uebersicht", labelKey: "shell.navUebersicht" },
      { id: "konten", labelKey: "shell.navKonten" },
      { id: "budgets", labelKey: "shell.navBudgets" },
      { id: "analyse", labelKey: "shell.navAnalyse" },
      { id: "inventar", labelKey: "shell.navInventar" },
      { id: "vertraege", labelKey: "shell.navVertraege" },
    ],
  },
  {
    titelKey: "shell.gruppeVerwaltung",
    eintraege: [
      { id: "kontenverwaltung", labelKey: "shell.navKontenVerwalten" },
      { id: "import", labelKey: "shell.navImport" },
      { id: "training", labelKey: "shell.navTraining" },
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
                  </a>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="foot">
          {/* Das Stadium steht neben der Version, nicht darin: wer hier hinsieht, soll
              wissen, dass Schema und Daten noch nicht festgeschrieben sind. */}
          <div>
            Moneymanager {APP_VERSION} <span className="bdg">{APP_STADIUM}</span>
          </div>
          <div>{t("shell.footLokal")}</div>
          {/* Erscheint nur, wenn wirklich etwas bereitliegt — sonst rendert er nichts. */}
          <AktualisierungKnopf />
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
