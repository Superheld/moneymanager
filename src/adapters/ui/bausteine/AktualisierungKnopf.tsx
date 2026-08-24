// Der Knopf, der erscheint, wenn eine neuere Fassung bereitliegt.
//
// Er steht in der Seitenleiste unten, direkt neben Version und Stadium — dort steht schon,
// WELCHE Version läuft, und „0.19.0" und „0.20.0 installieren" beantworten dieselbe Frage.
// Ein Banner über dem Inhalt beantwortet sie auch, unterbricht dabei aber etwas.
//
// **Wenn nichts bereitliegt, rendert er nichts.** Kein Haken, kein „Sie sind aktuell", kein
// Platzhalter, der Raum reserviert. Die überwiegende Mehrheit aller Starts ist genau dieser
// Fall, und in ihm soll sich die Oberfläche nicht verändern.
//
// Diese Datei liegt neben `AppShell.tsx`, weil nur sie ihn benutzt — er ist ein Teil der
// Shell, kein geteilter Baustein.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Aktualisierung } from "../../../application";
import { aktualisierungInstallieren, aktualisierungSuchen } from "../../dienste";

export function AktualisierungKnopf() {
  const { t } = useTranslation();
  const [bereit, setBereit] = useState<Aktualisierung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    // Einmal beim Start. Kein Intervall: wer die App offen lässt, bekommt das Update beim
    // nächsten Start — ein Knopf, der mitten im Eintippen erscheint, wäre eine Störung
    // ohne Gegenwert.
    let lebt = true;
    aktualisierungSuchen().then((a) => {
      if (lebt) setBereit(a);
    });
    return () => {
      lebt = false;
    };
  }, []);

  if (!bereit) return null;

  async function installieren() {
    setLaeuft(true);
    setFehler(false);
    try {
      // Kehrt im Erfolgsfall nicht zurück — die App startet neu.
      await aktualisierungInstallieren();
    } catch {
      // Hier hat jemand geklickt und wartet. Ein stiller Fehlschlag hinterliesse einen
      // Knopf, der nichts tut.
      setFehler(true);
      setLaeuft(false);
    }
  }

  return (
    <div className="aktualisierung">
      <button className="aktualisierungbtn" onClick={installieren} disabled={laeuft}>
        {laeuft
          ? t("shell.aktualisierungLaeuft")
          : t("shell.aktualisierungBereit", { version: bereit.version })}
      </button>
      {fehler && <div className="aktualisierungfehler">{t("shell.aktualisierungFehler")}</div>}
    </div>
  );
}
