// Am Ende des Imports: was als Nächstes dran ist.
//
// Wer zum ersten Mal Buchungen hereinholt, steht danach in einer leeren Inbox und weiss
// nicht, wohin. Die Karte „Damit die Zahlen stimmen" in der Übersicht wüsste es — hier
// steht deshalb ihr nächster offener Schritt, mit derselben Zeile und demselben Knopf.
//
// **Keine zweite Liste, kein Assistent.** Der Schritt kommt aus `einrichtungsstand` im
// Kern (`naechster`), über denselben Weg wie die Karte der Übersicht. Gemerkt wird
// nichts: ist die Einrichtung fertig, steht hier nichts — auch nicht „alles erledigt".
//
// **Nie zurück in den Import.** Zeigte der nächste Schritt auf diesen Bereich (es kam
// nichts in die Buchungen), wäre der Knopf ein Weg dorthin, wo man schon ist.

import { useTranslation } from "react-i18next";
import type { Einrichtungsstand } from "../../../application";
import { Card } from "../bausteine";
import type { ScreenId } from "../bausteine/AppShell";
import { EINRICHTUNG_ZIEL, EinrichtungsschrittZeile } from "../bausteine/Einrichtungsschritt";

export function NaechsterSchritt({
  stand,
  onNavigate,
}: {
  stand: Einrichtungsstand | null;
  onNavigate?: (id: ScreenId) => void;
}) {
  const { t } = useTranslation();
  const schritt = stand?.naechster;
  if (!schritt || EINRICHTUNG_ZIEL[schritt.id] === "import") return null;
  return (
    // Der Abstand steht an der Karte, weil die Inbox kein stapelndes Register ist —
    // dieselbe Lösung wie bei der Fehlerkarte daneben.
    <Card title={t("review.naechsterSchritt")} style={{ marginBottom: "var(--sp-4)" }}>
      <EinrichtungsschrittZeile schritt={schritt} onNavigate={onNavigate} />
    </Card>
  );
}
