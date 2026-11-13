// Die Karten der Einstellungen, die das Verhalten der App betreffen: Region, Experimente,
// Aktualisierung — samt der Zeile mit einem Schalter, die zwei davon teilen.
//
// Bis 2026-11-10 standen sie mit Personen und Kategorien in `EinstellungenScreen.tsx`
// (K3 der Oberflächenliste); der Screen setzt seither nur noch die Register zusammen.

import { Switch } from "@base-ui/react/switch";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  REGIONEN,
  waehrungNachCode,
  waehrungssymbol,
} from "../../../application";
import {
  type Pruefergebnis,
} from "../../../application";
import {
  aktualisierungBeta,
  aktualisierungBetaSetzen,
  aktualisierungInstallieren,
  aktualisierungJetztSuchen,
  aktualisierungspruefung,
  aktualisierungspruefungSetzen,
} from "../../dienste";
import { APP_ABZEICHEN, APP_VERSION } from "../../../version";
import { Button, Card, FormField, Pill } from "../bausteine";
import { Stapel, Zeile } from "../bausteine/Anordnung";
import { Auswahl } from "../bausteine/Auswahl";
import {
  useExperimentSchalter,
  useRegionUmschalter,
} from "../bausteine/einstellungenKontext";

/** Sprache & Währung des Haushalts (ADR-0004) — eine Region bestimmt alles drei. */
export function RegionCard() {
  const { t } = useTranslation();
  const { aktuelleLocale, regionSetzen } = useRegionUmschalter();
  return (
    <Card title={t("einstellungen.region.titel")}>
      <FormField label={t("einstellungen.region.feld")} hint={t("einstellungen.region.hinweis")}>
        <Auswahl
          ariaLabel={t("einstellungen.region.feld")}
          wert={aktuelleLocale}
          aufAenderung={regionSetzen}
          optionen={REGIONEN.map((r) => ({
            wert: r.locale,
            text: `${r.label} · ${waehrungssymbol(waehrungNachCode(r.waehrungCode), r.locale)}`,
          }))}
        />
      </FormField>
    </Card>
  );
}

/**
 * Experimentelle Funktionen — aus, bis jemand sie einschaltet.
 *
 * Der Hinweistext steht ueber den Schaltern und nicht an jedem einzelnen: er gilt fuer
 * alle, und wiederholt an jeder Zeile liest ihn niemand mehr. Was NUR fuer ein Experiment
 * gilt, steht an seiner Zeile.
 */

export function ExperimenteCard() {
  const { t } = useTranslation();
  const { experimente, experimentSetzen } = useExperimentSchalter();
  return (
    <Card title={t("einstellungen.experiment.titel")}>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("einstellungen.experiment.hinweis")}
      </p>
      <div style={{ display: "grid", gap: "var(--sp-3)" }}>
        <SchalterZeile
          titel={t("einstellungen.experiment.hanseaticTitel")}
          text={t("einstellungen.experiment.hanseaticText")}
          an={experimente.hanseatic}
          aufSchalten={(an) => experimentSetzen("hanseatic", an)}
        />
        <SchalterZeile
          titel={t("einstellungen.experiment.exportTitel")}
          text={t("einstellungen.experiment.exportText")}
          an={experimente.export}
          aufSchalten={(an) => experimentSetzen("export", an)}
        />
        <SchalterZeile
          titel={t("einstellungen.experiment.trainingTitel")}
          text={t("einstellungen.experiment.trainingText")}
          an={experimente.training}
          aufSchalten={(an) => experimentSetzen("training", an)}
        />
      </div>
    </Card>
  );
}

/**
 * Eine Zeile mit einem Schalter: der Schalter, fetter Titel, der aktuelle Stand und eine
 * Erklaerung darunter.
 *
 * Hiess bis 2026-08-25 `ExperimentZeile` — nach ihrem ersten Anwendungsfall, nicht nach
 * dem, was sie ist. Beim zweiten (der Aktualisierungspruefung, die kein Experiment ist)
 * haette der Name gegen die Sache gestanden, und der naechste haette entweder einen
 * falschen Namen benutzt oder die Zeile ein zweites Mal gebaut.
 *
 * **Base UI `Switch`, kein Kaestchen** (seit 2026-11-10). Ein Kaestchen sagt „angekreuzt",
 * ein Schalter „an/aus" — und die Zeile sagt selbst „an" und „aus". Eine Vorlesehilfe
 * meldet jetzt „Schalter, ein" statt „Kontrollkaestchen, aktiviert".
 *
 * Name und Beschreibung sind getrennt verbunden: der NAME ist der Titel allein
 * (`aria-labelledby` auf ein unsichtbares Element — das umschliessende `<label>` wuerde
 * sonst den ganzen Absatz zum Namen machen, siehe `Kaestchen`), die Erklaerung ist die
 * Beschreibung. Das `<label>` bleibt, damit ein Klick auf den Text schaltet.
 */

export function SchalterZeile({
  titel,
  text,
  an,
  aufSchalten,
}: {
  titel: string;
  text: string;
  an: boolean;
  aufSchalten: (an: boolean) => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const textId = useId();
  return (
    <label className="schalterzeile">
      <Switch.Root
        className="schalter"
        checked={an}
        onCheckedChange={(neu) => aufSchalten(neu)}
        aria-labelledby={nameId}
        aria-describedby={textId}
      >
        <Switch.Thumb className="schalter-knopf" />
      </Switch.Root>
      <span id={nameId} hidden>
        {titel}
      </span>
      <span>
        <span style={{ fontWeight: "var(--fw-bold)" }}>{titel}</span>
        {" · "}
        <span className="muted">
          {an ? t("einstellungen.experiment.an") : t("einstellungen.experiment.aus")}
        </span>
        <br />
        <span className="muted" id={textId}>
          {text}
        </span>
      </span>
    </label>
  );
}

/**
 * Welche Fassung läuft, und ob es eine neuere gibt — auf Knopfdruck.
 *
 * **Der Knopf, weil die Prüfung sonst nur beim Start läuft.** Wer wissen wollte, ob eine
 * Fassung erschienen ist, musste die App neu starten. Geprüft wird hier auch bei
 * abgeschalteter Startprüfung: der Schalter regelt, ob die App UNGEFRAGT nach draussen
 * spricht, und ein Klick ist die Frage (`aktualisierungJetztPruefen`).
 *
 * Findet sie etwas, steht der Installieren-Knopf HIER und nicht nur in der Seitenleiste:
 * die Antwort gehört an die Stelle, an der gefragt wurde.
 */
export function AktualisierungCard() {
  const { t } = useTranslation();
  const [an, setAn] = useState<boolean | null>(null);
  const [beta, setBeta] = useState<boolean | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [ergebnis, setErgebnis] = useState<Pruefergebnis | null>(null);
  const [installiert, setInstalliert] = useState<"laeuft" | "fehler" | null>(null);

  useEffect(() => {
    void aktualisierungspruefung().then(setAn);
    void aktualisierungBeta().then(setBeta);
  }, []);

  async function schalten(neu: boolean) {
    // Erst schreiben, dann anzeigen: bliebe der Schalter bei einem Fehler umgelegt
    // stehen, zeigte es einen Zustand, den die Datenbank nicht hat.
    await aktualisierungspruefungSetzen(neu);
    setAn(neu);
  }

  async function betaWechseln(neu: boolean) {
    await aktualisierungBetaSetzen(neu);
    setBeta(neu);
    // Ein Ergebnis von vorher galt für den anderen Kanal.
    setErgebnis(null);
  }

  async function pruefen() {
    setPrueft(true);
    setErgebnis(null);
    setInstalliert(null);
    try {
      setErgebnis(await aktualisierungJetztSuchen());
    } finally {
      setPrueft(false);
    }
  }

  async function installieren() {
    setInstalliert("laeuft");
    try {
      // Kehrt im Erfolgsfall nicht zurück — die App startet neu.
      await aktualisierungInstallieren();
    } catch {
      setInstalliert("fehler");
    }
  }

  return (
    <Card title={t("einstellungen.aktualisierung.titel")}>
      <Stapel>
        <Zeile abstand={3}>
          <span>
            {t("einstellungen.aktualisierung.installiert")}{" "}
            <span style={{ fontWeight: "var(--fw-bold)" }}>{APP_VERSION}</span>{" "}
            <Pill variant="neutral">{APP_ABZEICHEN}</Pill>
          </span>
          <Button onClick={() => void pruefen()} laeuft={prueft}>
            {prueft ? t("einstellungen.aktualisierung.prueft") : t("einstellungen.aktualisierung.jetztPruefen")}
          </Button>
          {ergebnis?.art === "aktuell" && (
            <span className="hinweis">{t("einstellungen.aktualisierung.aktuell")}</span>
          )}
          {ergebnis?.art === "fehler" && (
            <span className="hinweis">{t("einstellungen.aktualisierung.pruefungFehler")}</span>
          )}
          {ergebnis?.art === "neu" && (
            <Button variant="primary" onClick={() => void installieren()} laeuft={installiert === "laeuft"}>
              {installiert === "laeuft"
                ? t("shell.aktualisierungLaeuft")
                : t("shell.aktualisierungBereit", { version: ergebnis.aktualisierung.version })}
            </Button>
          )}
          {installiert === "fehler" && (
            <span className="hinweis">{t("shell.aktualisierungFehler")}</span>
          )}
        </Zeile>
        <p className="muted" style={{ margin: 0 }}>
          {t("einstellungen.aktualisierung.hinweis")}
        </p>
        {an != null && (
          <SchalterZeile
            titel={t("einstellungen.aktualisierung.schalterTitel")}
            text={t("einstellungen.aktualisierung.schalterText")}
            an={an}
            aufSchalten={(neu) => void schalten(neu)}
          />
        )}
        {beta != null && (
          <SchalterZeile
            titel={t("einstellungen.aktualisierung.betaTitel")}
            text={t("einstellungen.aktualisierung.betaText")}
            an={beta}
            aufSchalten={(neu) => void betaWechseln(neu)}
          />
        )}
      </Stapel>
    </Card>
  );
}
