// Konfiguration exportieren — hinter dem Experimente-Schalter.
//
// **Der Pfad wird angezeigt, und das ist der halbe Zweck der Karte.** Eine Tauri-App legt
// ihre Dateien im App-Datenverzeichnis ab, und dorthin findet niemand von selbst
// (`~/Library/Application Support/…` auf macOS, versteckt auf jedem anderen System). Ein
// Export, dessen Ablageort man nicht erfährt, ist so gut wie keiner — deshalb meldet das
// Rust-Kommando den vollen Pfad zurück, statt nur „fertig" zu sagen.
//
// **Ein Fehlschlag wird gemeldet, anders als bei der Update-Prüfung.** Dort ist ein Fehler
// stumm, weil niemand gefragt hat; hier hat jemand geklickt und wartet. Dieselbe Abwägung,
// anderes Ergebnis.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../bausteine";
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
      <p className="muted">{t("einstellungen.export.konfiguration.text")}</p>
      <p className="muted">{t("einstellungen.export.konfiguration.hinweis")}</p>
      {/* Kein `disabled` — der Baustein aus dem Design-System kennt es nicht, und ein
          zweiter Klick waehrend des Schreibens ueberschreibt nur dieselbe Datei mit
          demselben Inhalt. Der Text sagt trotzdem, dass gerade etwas laeuft. */}
      <Button variant="primary" onClick={() => !laeuft && void exportieren()}>
        {laeuft ? t("einstellungen.export.laeuft") : t("einstellungen.export.konfiguration.knopf")}
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
