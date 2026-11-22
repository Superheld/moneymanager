// Welche Rücklage diese Ausgabe trägt.
//
// Hängen mehrere Rücklagen an der Kategorie einer Buchung, wartet sie, bis jemand sagt,
// welche es war (ADR-0006, Entscheidung 5). Hier wird das gesagt: je Anteil eine Auswahl
// aus den Rücklagen, die an seiner Kategorie hängen, dazu „keine Rücklage". Welche das
// sind und ob es überhaupt etwas zu wählen gibt, entscheidet die Sicht
// (`ruecklagenwahlJeBuchung`); diese Datei zeigt es nur und meldet die Wahl.
//
// **Seit 2026-11-22 auch eine Rücklage von woanders** (Nachtrag zu ADR-0006): eine, die
// abgeschlossen wird, darf eine Ausgabe jeder Kategorie tragen. Sie steht in der Auswahl
// als eigene Gruppe unter denen an der Kategorie (`weitere`). Gibt es an der Kategorie
// nichts zu entscheiden (`noetig`), steht die Wahl hinter einer Zeile, die aufklappt —
// der Normalfall ist, dass die Kategorie entscheidet, und eine Auswahl, die bei jeder
// Ausgabe offen dasteht, läse sich als Frage, die jede Ausgabe beantworten muss.
//
// Gespeichert wird sofort, nicht mit dem Formular: die Wahl ändert weder Betrag noch
// Kategorie, und die Einordnung darüber soll gleich danach den neuen Satz sagen.
// Vorbelegt wird nichts — eine Vorbelegung sähe aus wie eine Entscheidung.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ruecklagenwahl } from "../../../application";
import { ruecklageZuordnen } from "../../dienste";
import { Button, FormField } from ".";
import { Auswahl, type AuswahlOption } from "./Auswahl";
import { Feldzeile } from "./Feldzeile";
import { Klappblock } from "./Klappblock";
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
  const [offen, setOffen] = useState(false);
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

  /** Die Optionen eines Anteils: die an der Kategorie, dann die übrigen, dann „keine". */
  function optionen(w: Ruecklagenwahl): AuswahlOption[] {
    // Überschriften nur, wenn es beide Gruppen gibt — eine einzige Gruppe sagt nichts,
    // was die Liste nicht ohnehin sagt.
    const getrennt = w.ruecklagen.length > 0 && w.weitere.length > 0;
    return [
      ...w.ruecklagen.map((r) => ({ wert: r.id, text: r.bezeichnung, gruppe: getrennt ? t("buchungRuecklage.gruppeKategorie") : undefined })),
      ...w.weitere.map((r) => ({ wert: r.id, text: r.bezeichnung, gruppe: getrennt ? t("buchungRuecklage.gruppeWeitere") : undefined })),
      { wert: KEINE, text: t("buchungRuecklage.keine") },
    ];
  }

  const felder = (
    <>
      {wahl.map((w) => {
        const wert = w.gewaehlt === undefined ? "" : w.gewaehlt === null ? KEINE : w.gewaehlt;
        const label = wahl.length > 1
          ? t("buchungRuecklage.feldAnteil", { kategorie: kategorieNamen.get(w.kategorieId) ?? "—" })
          : t("buchungRuecklage.feld");
        const hint = w.wartet ? t("buchungRuecklage.wartetHinweis") : !w.noetig ? t("buchungRuecklage.weitereHinweis") : undefined;
        return (
          <FormField key={w.kategorieId} label={label} hint={hint}>
            <Feldzeile
              feld={
                <Auswahl
                  ariaLabel={label}
                  wert={wert}
                  platzhalter={t("buchungRuecklage.offen")}
                  aufAenderung={(v) => void waehlen(w.kategorieId, v)}
                  optionen={optionen(w)}
                />
              }
              knopf={w.gewaehlt !== undefined ? <Button variant="link" onClick={() => void loesen(w.kategorieId)}>{t("buchungRuecklage.loesen")}</Button> : null}
            />
          </FormField>
        );
      })}
      {fehler && <div className="err" style={{ marginTop: 6 }}>{fehler}</div>}
    </>
  );

  // Ist an einer Kategorie etwas zu entscheiden, steht alles offen da — wie bisher.
  if (wahl.some((w) => w.noetig)) {
    return (
      <div className="abschnitt" role="group" aria-label={t("buchungRuecklage.titel")}>
        {felder}
      </div>
    );
  }
  return (
    <Klappblock titel={t("buchungRuecklage.ausRuecklage")} offen={offen} onUmschalten={() => setOffen((x) => !x)}>
      <div role="group" aria-label={t("buchungRuecklage.titel")}>{felder}</div>
    </Klappblock>
  );
}
