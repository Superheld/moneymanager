// Konfiguration exportieren — hinter dem Experimente-Schalter.
//
// **Der Pfad wird angezeigt, auch seit die Datei im Download-Ordner landet.** „Im
// Download-Ordner" ist eine Auskunft; der volle Name ist die, mit der man sie auch dann
// findet, wenn dort dreihundert andere liegen. Bis 2026-09-22 schrieb der Export ins
// App-Datenverzeichnis — sicher und unauffindbar, und damit an der Aufgabe vorbei: eine
// Exportdatei ist dazu da, weitergegeben zu werden.
//
// **Ein Fehlschlag wird gemeldet, anders als bei der Update-Prüfung.** Dort ist ein Fehler
// stumm, weil niemand gefragt hat; hier hat jemand geklickt und wartet. Dieselbe Abwägung,
// anderes Ergebnis.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../bausteine";
import { Stapel } from "../bausteine/Anordnung";
import { konfigurationExport } from "../../dienste";

export function ExportCard() {
  const { t } = useTranslation();
  const [laeuft, setLaeuft] = useState(false);
  const [pfad, setPfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function exportieren() {
    setLaeuft(true);
    setFehler(null);
    setPfad(null);
    try {
      setPfad(await konfigurationExport());
    } catch (e) {
      setFehler(t("einstellungen.export.fehler", { grund: String(e) }));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card title={t("einstellungen.export.konfiguration.titel")}>
      <Stapel>
        <p className="muted" style={{ margin: 0 }}>{t("einstellungen.export.konfiguration.text")}</p>
        <p className="muted" style={{ margin: 0 }}>{t("einstellungen.export.konfiguration.hinweis")}</p>
        <div>
          <Button variant="primary" onClick={() => void exportieren()} laeuft={laeuft}>
            {laeuft ? t("einstellungen.export.laeuft") : t("einstellungen.export.konfiguration.knopf")}
          </Button>
        </div>
        {pfad && <Exportpfad pfad={pfad} />}
        {fehler && <p className="err" style={{ margin: 0 }}>{fehler}</p>}
      </Stapel>
    </Card>
  );
}

/**
 * Wohin die Datei geschrieben wurde — für beide Exporte dieselbe Zeile.
 *
 * `user-select: all`: ein Klick markiert den ganzen Pfad. Er ist lang und enthält
 * Leerzeichen; wer ihn von Hand markiert, erwischt die Hälfte.
 */
export function Exportpfad({ pfad }: { pfad: string }) {
  const { t } = useTranslation();
  return (
    <p style={{ margin: 0 }}>
      {t("einstellungen.export.fertig")}{" "}
      <code style={{ userSelect: "all", wordBreak: "break-all" }}>{pfad}</code>
    </p>
  );
}
