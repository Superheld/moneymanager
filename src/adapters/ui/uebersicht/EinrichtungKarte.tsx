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
//
// **Schmal steht sie als EINE Zeile da, die aufklappt** (`alsZeile`, seit 2026-11-22): am
// Handy unter dem laufenden Monat, und dort nähme die ganze Liste zwei Bildschirmhöhen,
// bevor die erste Zahl kommt. Eingeklappt wird nach „Drei Ränge" (`../CLAUDE.md`): die
// Fragen und ihr Warum sind ERKLÄRUNG und dürfen hinter die Zeile. Der Satz zu den
// Zahlungen ohne Kategorie ist es nicht — er sagt, dass „Ungeplant" in der Karte darüber
// Zahlungen enthält, die woanders hingehören. Er ist eine EINSCHRÄNKUNG und bleibt
// deshalb offen unter der Zeile stehen, solange sie zu ist.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible } from "@base-ui/react/collapsible";
import type { Einrichtungsstand } from "../../../application";
import { Card } from "../bausteine";
import type { ScreenId } from "../bausteine/AppShell";
import { Stapel } from "../bausteine/Anordnung";
import { EinrichtungsschrittZeile } from "../bausteine/Einrichtungsschritt";

export interface EinrichtungKarteProps {
  readonly stand: Einrichtungsstand;
  /** Fehlt er (Tests, Vorschau ohne Shell), stehen die Schritte ohne Knopf da. */
  readonly onNavigate?: (id: ScreenId) => void;
  /** Schmal unter dem laufenden Monat: eine Zeile mit dem Stand, die aufklappt. */
  readonly alsZeile?: boolean;
}

export function EinrichtungKarte({ stand, onNavigate, alsZeile = false }: EinrichtungKarteProps) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  if (stand.fertig) return null;

  const erledigt = stand.schritte.filter((s) => s.status === "erledigt").length;

  if (alsZeile) {
    const ohneKategorie = stand.schritte.find((s) => s.id === "kategorien" && s.status === "offen" && s.anzahl !== undefined);
    return (
      <Card>
        <Collapsible.Root open={offen} onOpenChange={setOffen}>
          {/* Die ganze Zeile ist der Schalter — ein Finger trifft keinen Pfeil am Rand. */}
          <Collapsible.Trigger className="einrichtung-zeile">
            <span className="einrichtung-zeile-titel">{t("einrichtung.titel")}</span>
            <span className="muted einrichtung-zeile-stand">
              {t("einrichtung.stand", { erledigt, gesamt: stand.schritte.length })} {offen ? "▾" : "▸"}
            </span>
          </Collapsible.Trigger>
          {!offen && ohneKategorie?.anzahl !== undefined && (
            <div className="hinweis" style={{ marginTop: 2 }}>
              {t("einrichtung.schritt.kategorien.warumAnzahl", { count: ohneKategorie.anzahl })}
            </div>
          )}
          <Collapsible.Panel>
            <Stapel abstand={4} style={{ marginTop: "var(--sp-3)" }}>
              {stand.schritte.map((s) => (
                <EinrichtungsschrittZeile key={s.id} schritt={s} onNavigate={onNavigate} />
              ))}
            </Stapel>
          </Collapsible.Panel>
        </Collapsible.Root>
      </Card>
    );
  }

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
