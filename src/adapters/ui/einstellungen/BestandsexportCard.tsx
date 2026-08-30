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
      <p className="muted">{t("einstellungen.export.bestand.text")}</p>
      {/* Die Warnung steht VOR dem Knopf und nicht darunter: was sie sagt, entscheidet
          darüber, ob man ihn drücken will. */}
      <p className="zugang-fehler">{t("einstellungen.export.bestand.warnung")}</p>
      <p className="muted">{t("einstellungen.export.bestand.vergaenglich")}</p>
      <Button variant="primary" onClick={() => !laeuft && void exportieren()}>
        {laeuft ? t("einstellungen.export.laeuft") : t("einstellungen.export.bestand.knopf")}
      </Button>
      {pfad && (
        <p style={{ marginBottom: 0 }}>
          {t("einstellungen.export.fertig")}{" "}
          {/* `user-select: all` — ein Klick markiert den ganzen Pfad. Er ist lang und
              enthält Leerzeichen; wer ihn von Hand markiert, erwischt die Hälfte. */}
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>{pfad}</code>
        </p>
      )}
      {fehler && <p className="zugang-fehler">{fehler}</p>}
    </Card>
  );
}
