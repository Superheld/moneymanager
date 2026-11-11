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
  aktualisierungBeta,
  aktualisierungBetaSetzen,
  aktualisierungspruefung,
  aktualisierungspruefungSetzen,
} from "../../dienste";
import { Card, FormField } from "../bausteine";
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
    <Card>
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
    <Card>
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

export function AktualisierungCard() {
  const { t } = useTranslation();
  const [an, setAn] = useState<boolean | null>(null);
  const [beta, setBeta] = useState<boolean | null>(null);

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
  }

  return (
    <Card>
      <p className="muted" style={{ marginTop: 0 }}>
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
    </Card>
  );
}
