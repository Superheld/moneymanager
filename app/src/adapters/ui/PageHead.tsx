// PageHead — Titel + Untertitel links, optionale Aktion (z. B. „+ anlegen") rechts.
// Vereinheitlicht den Kopf aller Fachscreens (overview-first).

import type { ReactNode } from "react";

export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="phead" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-4)" }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="psub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
