// Die Karte „Damit die Zahlen stimmen" — was dem Haushalt noch fehlt, als Fragen.
//
// Sie steht ganz oben und nur, solange etwas fehlt. Die Monatskarten darunter rechnen
// auch ohne Verträge und Budgets, zeigen dann aber alles unter „Ungeplant" — richtig
// gerechnet und für jemanden, der die App zum ersten Mal öffnet, nicht zu deuten. Diese
// Karte sagt deshalb zuerst, WAS die App wissen muss, und führt in den Bereich, in dem
// man es ihr sagt.
//
// **Fragen statt Fachwörter.** Ein Schritt heisst nicht „Verträge anlegen", sondern „Was
// geht jeden Monat fest ab?". Das Fachwort steht erst im Knopf, weil der Bereich so
// heisst und man ihn in der Navigation wiederfinden soll.
//
// **Kein Assistent mit eigenem Zustand.** Die Karte merkt sich nichts: was erledigt ist,
// folgt aus dem Bestand (`einrichtungsstand` im Kern, über `uebersichtLaden`). Ein
// abgehakter Schritt, der in einer Einstellung stünde, bliebe abgehakt, wenn jemand das
// einzige Budget wieder löscht.
//
// Die Karte RECHNET NICHTS und entscheidet nur, wohin ein Schritt führt — das ist
// Navigation und gehört in die Oberfläche.

import { useTranslation } from "react-i18next";
import type { Einrichtungsschritt, EinrichtungsschrittId, Einrichtungsstand } from "../../../application";
import { Button, Card, Pill } from "../bausteine";
import type { ScreenId } from "../bausteine/AppShell";
import { Stapel } from "../bausteine/Anordnung";

/** In welchem Bereich man den Schritt erledigt. */
const ZIEL: Record<EinrichtungsschrittId, ScreenId> = {
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

export interface EinrichtungKarteProps {
  readonly stand: Einrichtungsstand;
  /** Fehlt er (Tests, Vorschau ohne Shell), stehen die Schritte ohne Knopf da. */
  readonly onNavigate?: (id: ScreenId) => void;
}

export function EinrichtungKarte({ stand, onNavigate }: EinrichtungKarteProps) {
  const { t } = useTranslation();
  if (stand.fertig) return null;

  const erledigt = stand.schritte.filter((s) => s.status === "erledigt").length;

  return (
    <Card
      title={t("einrichtung.titel")}
      subtitle={t("einrichtung.untertitel", { erledigt, gesamt: stand.schritte.length })}
    >
      <Stapel abstand={4}>
        {stand.schritte.map((s) => (
          <Schritt key={s.id} schritt={s} onNavigate={onNavigate} />
        ))}
      </Stapel>
    </Card>
  );
}

function Schritt({ schritt, onNavigate }: { schritt: Einrichtungsschritt; onNavigate?: (id: ScreenId) => void }) {
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
        <Button groesse="klein" onClick={() => onNavigate(ZIEL[id])}>
          {t("einrichtung.zuBereich", { bereich: t(ZIEL_NAME[id]) })}
        </Button>
      )}
    </div>
  );
}
