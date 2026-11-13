// Bestand exportieren — die Karte NEBEN dem Konfigurationsexport, nicht in ihm.
//
// **Warum es zwei Karten sind und nicht ein Knopf mit Schalter.** Die beiden Dateien
// tragen verschiedene Zusicherungen: die eine darf man weitergeben, die andere ist der
// Kontoauszug. Ein Häkchen „Buchungen mitnehmen" erzeugte zwei Dateien, die gleich heissen
// und gleich aussehen, und man wüsste hinterher nicht, welche man vor sich hat. Zwei
// Karten mit zwei Namen beantworten die Frage im Dateimanager mit.
//
// **Sie stehen bewusst UNTEREINANDER im selben Register.** Der Unterschied wird sichtbar,
// weil beide da sind — eine Warnung allein sagt weniger als eine Warnung neben dem Fall,
// in dem sie nicht nötig ist.
//
// Ein Fehlschlag wird gemeldet: hier hat jemand geklickt und wartet (anders als bei der
// Update-Prüfung, die stumm bleibt).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../bausteine";
import { Stapel } from "../bausteine/Anordnung";
import { Exportpfad } from "./ExportCard";
import { bestandExport } from "../../dienste";

export function BestandsexportCard() {
  const { t } = useTranslation();
  const [laeuft, setLaeuft] = useState(false);
  const [pfad, setPfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function exportieren() {
    setLaeuft(true);
    setFehler(null);
    setPfad(null);
    try {
      setPfad(await bestandExport());
    } catch (e) {
      setFehler(t("einstellungen.export.fehler", { grund: String(e) }));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card title={t("einstellungen.export.bestand.titel")}>
      <Stapel>
        <p className="muted" style={{ margin: 0 }}>{t("einstellungen.export.bestand.text")}</p>
        {/* Die Warnung steht VOR dem Knopf und nicht darunter: was sie sagt, entscheidet
            darüber, ob man ihn drücken will. `.err` und nicht die Fehlerklasse des
            Sperrbildschirms (`zugang-fehler`) — die gehört dem Zugang und stand hier in
            Fliesstextgrösse zwischen gedämpften Absätzen. */}
        <p className="err" style={{ margin: 0 }}>{t("einstellungen.export.bestand.warnung")}</p>
        <p className="muted" style={{ margin: 0 }}>{t("einstellungen.export.bestand.vergaenglich")}</p>
        <div>
          <Button variant="primary" onClick={() => void exportieren()} laeuft={laeuft}>
            {laeuft ? t("einstellungen.export.laeuft") : t("einstellungen.export.bestand.knopf")}
          </Button>
        </div>
        {pfad && <Exportpfad pfad={pfad} />}
        {fehler && <p className="err" style={{ margin: 0 }}>{fehler}</p>}
      </Stapel>
    </Card>
  );
}
