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
// Die Zeile je Schritt samt ihrem Ziel steht in `bausteine/Einrichtungsschritt.tsx` —
// das Ende des Imports zeigt den nächsten Schritt mit derselben Zeile.

import { useTranslation } from "react-i18next";
import type { Einrichtungsstand } from "../../../application";
import { Card } from "../bausteine";
import type { ScreenId } from "../bausteine/AppShell";
import { Stapel } from "../bausteine/Anordnung";
import { EinrichtungsschrittZeile } from "../bausteine/Einrichtungsschritt";

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
          <EinrichtungsschrittZeile key={s.id} schritt={s} onNavigate={onNavigate} />
        ))}
      </Stapel>
    </Card>
  );
}
