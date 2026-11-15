// Ein Schritt der Einrichtung als Zeile — die Frage, warum sie zählt, und der Knopf in
// den Bereich, in dem man sie beantwortet.
//
// Er stand bis 2026-11-15 in `uebersicht/EinrichtungKarte.tsx` und ist hierher gezogen,
// weil ihn ein zweiter Bereich braucht: das Ende des Imports zeigt den nächsten offenen
// Schritt (`import/NaechsterSchritt.tsx`). Zwei Fassungen derselben Zeile hätten bald zwei
// Ziele für denselben Schritt gehabt.
//
// Er RECHNET NICHTS und entscheidet nur, wohin ein Schritt führt — das ist Navigation und
// gehört in die Oberfläche. Was erledigt ist und was als Nächstes dran ist, kommt fertig
// aus `einrichtungsstand` im Kern.

import { useTranslation } from "react-i18next";
import type { Einrichtungsschritt, EinrichtungsschrittId } from "../../../application";
import { Button } from "./Button";
import { Pill } from "./Pill";
import type { ScreenId } from "./AppShell";

/** In welchem Bereich man den Schritt erledigt. */
export const EINRICHTUNG_ZIEL: Record<EinrichtungsschrittId, ScreenId> = {
  konto: "kontenverwaltung",
  buchungen: "import",
  kategorien: "konten",
  vertraege: "vertraege",
  budgets: "budgets",
  ruecklagen: "ruecklagen",
};

/** Der Name des Zielbereichs, wie er in der Navigation steht. */
const ZIEL_NAME: Record<EinrichtungsschrittId, string> = {
  konto: "shell.navKontenVerwalten",
  buchungen: "shell.navImport",
  kategorien: "shell.navBuchungen",
  vertraege: "shell.navVertraege",
  budgets: "shell.navBudgets",
  ruecklagen: "shell.navRuecklagen",
};

export function EinrichtungsschrittZeile({
  schritt,
  onNavigate,
}: {
  schritt: Einrichtungsschritt;
  /** Fehlt er (Tests, Vorschau ohne Shell), steht der Schritt ohne Knopf da. */
  onNavigate?: (id: ScreenId) => void;
}) {
  const { t } = useTranslation();
  const { id, status } = schritt;
  const offen = status === "offen";

  return (
    <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 18rem" }}>
        {/* Nur der offene Schritt trägt Gewicht: er ist das, was als Nächstes zu tun ist.
            Erledigtes und Wartendes tritt zurück, bleibt aber stehen — die Liste zeigt
            den ganzen Weg, nicht nur den Rest. */}
        <div className={offen ? undefined : "muted"} style={{ fontWeight: offen ? "var(--fw-semi)" : undefined }}>
          {t(`einrichtung.schritt.${id}.frage`)}
          {schritt.freiwillig && status !== "erledigt" && (
            <span className="muted" style={{ fontWeight: "normal" }}> · {t("einrichtung.freiwillig")}</span>
          )}
        </div>
        {offen && (
          <div className="hinweis" style={{ marginTop: 2 }}>
            {schritt.anzahl !== undefined
              ? t(`einrichtung.schritt.${id}.warumAnzahl`, { count: schritt.anzahl })
              : t(`einrichtung.schritt.${id}.warum`)}
          </div>
        )}
      </div>
      {status === "erledigt" && <Pill variant="ok">{t("einrichtung.erledigt")}</Pill>}
      {status === "wartet" && <Pill variant="neutral">{t("einrichtung.wartet")}</Pill>}
      {offen && onNavigate && (
        <Button groesse="klein" onClick={() => onNavigate(EINRICHTUNG_ZIEL[id])}>
          {t("einrichtung.zuBereich", { bereich: t(ZIEL_NAME[id]) })}
        </Button>
      )}
    </div>
  );
}
