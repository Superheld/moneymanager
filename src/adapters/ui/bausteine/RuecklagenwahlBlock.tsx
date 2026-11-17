// Welche Rücklage diese Ausgabe trägt — nur, wo es etwas zu wählen gibt.
//
// Hängen mehrere Rücklagen an der Kategorie einer Buchung, wartet sie, bis jemand sagt,
// welche es war (ADR-0006, Entscheidung 5). Hier wird das gesagt: je Anteil eine Auswahl
// aus den Rücklagen, die an seiner Kategorie hängen, dazu „keine Rücklage". Welche das
// sind und ob es überhaupt etwas zu wählen gibt, entscheidet die Sicht
// (`ruecklagenwahlJeBuchung`); diese Datei zeigt es nur und meldet die Wahl.
//
// Gespeichert wird sofort, nicht mit dem Formular: die Wahl ändert weder Betrag noch
// Kategorie, und die Einordnung darüber soll gleich danach den neuen Satz sagen.
// Vorbelegt wird nichts — eine Vorbelegung sähe aus wie eine Entscheidung.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ruecklagenwahl } from "../../../application";
import { ruecklageZuordnen } from "../../dienste";
import { Button, FormField } from ".";
import { Auswahl } from "./Auswahl";
import { Feldzeile } from "./Feldzeile";
import { fehlerNachricht } from "./einstellungenKontext";

/** Der Wert der Auswahl für „ausdrücklich keine Rücklage" — keine ID kann so heissen. */
const KEINE = "\u0000keine";

export function RuecklagenwahlBlock({
  buchungId,
  wahl,
  kategorieNamen,
  onGewaehlt,
}: {
  buchungId: string;
  wahl: readonly Ruecklagenwahl[];
  kategorieNamen: ReadonlyMap<string, string>;
  onGewaehlt: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [fehler, setFehler] = useState<string | null>(null);
  if (wahl.length === 0) return null;

  async function waehlen(kategorieId: string, wert: string) {
    setFehler(null);
    try {
      await ruecklageZuordnen({ istbuchungId: buchungId, kategorieId, ruecklageId: wert === KEINE ? null : wert });
      await onGewaehlt();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function loesen(kategorieId: string) {
    setFehler(null);
    try {
      await ruecklageZuordnen({ istbuchungId: buchungId, kategorieId, loesen: true });
      await onGewaehlt();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="abschnitt" role="group" aria-label={t("buchungRuecklage.titel")}>
      {wahl.map((w) => {
        const wert = w.gewaehlt === undefined ? "" : w.gewaehlt === null ? KEINE : w.gewaehlt;
        const label = wahl.length > 1
          ? t("buchungRuecklage.feldAnteil", { kategorie: kategorieNamen.get(w.kategorieId) ?? "—" })
          : t("buchungRuecklage.feld");
        return (
          <FormField key={w.kategorieId} label={label} hint={w.wartet ? t("buchungRuecklage.wartetHinweis") : undefined}>
            <Feldzeile
              feld={
                <Auswahl
                  ariaLabel={label}
                  wert={wert}
                  platzhalter={t("buchungRuecklage.offen")}
                  aufAenderung={(v) => void waehlen(w.kategorieId, v)}
                  optionen={[
                    ...w.ruecklagen.map((r) => ({ wert: r.id, text: r.bezeichnung })),
                    { wert: KEINE, text: t("buchungRuecklage.keine") },
                  ]}
                />
              }
              knopf={w.gewaehlt !== undefined ? <Button variant="link" onClick={() => void loesen(w.kategorieId)}>{t("buchungRuecklage.loesen")}</Button> : null}
            />
          </FormField>
        );
      })}
      {fehler && <div className="err" style={{ marginTop: 6 }}>{fehler}</div>}
    </div>
  );
}
