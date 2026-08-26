// Was man an der Verschlüsselung noch einstellen kann: Passphrase wechseln, den
// Wiederherstellungscode noch einmal ansehen, die Zeitsperre stellen.
//
// **Der Code hängt hier hinter der Passphrase**, obwohl die App gerade offen ist. Genau
// das ist der Punkt: die Zeitsperre schützt gegen jemanden am entsperrten Rechner — läge
// der Code eine Klick-Ebene tiefer offen, wäre sie umsonst.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { MINDESTLAENGE } from "../../../application/zugang";
import { ZEITSPERRE_STUFEN } from "../../../application/einstellungen";
import {
  zeitsperre,
  zeitsperreSetzen,
  zugangCodeZeigen,
  zugangPassphraseWechseln,
} from "../../dienste";

export function VerschluesselungCard({ onSperren }: { onSperren?: () => void }) {
  const { t } = useTranslation();

  const [alte, setAlte] = useState("");
  const [neue, setNeue] = useState("");
  const [wechselMeldung, setWechselMeldung] = useState<string | null>(null);

  const [codePassphrase, setCodePassphrase] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [codeMeldung, setCodeMeldung] = useState<string | null>(null);

  const [minuten, setMinuten] = useState<number | null>(null);

  useEffect(() => {
    void zeitsperre().then(setMinuten);
  }, []);

  async function wechseln() {
    setWechselMeldung(null);
    const ergebnis = await zugangPassphraseWechseln(alte, neue);
    if (ergebnis.art === "fertig") {
      setAlte("");
      setNeue("");
      setWechselMeldung(t("zugang.wechselFertig"));
    } else if (ergebnis.art === "alteFalsch") {
      setWechselMeldung(t("zugang.alteFalsch"));
    } else {
      setWechselMeldung(
        ergebnis.befund.taugt
          ? t("zugang.fehlerAllgemein")
          : ergebnis.befund.grund === "zuKurz"
            ? t("zugang.zuKurz", { mindestens: MINDESTLAENGE })
            : t("zugang.nurLeerzeichen"),
      );
    }
  }

  async function zeigen() {
    setCodeMeldung(null);
    setCode(null);
    const ergebnis = await zugangCodeZeigen(codePassphrase);
    if (ergebnis === null) setCodeMeldung(t("zugang.passphraseFalsch"));
    else {
      setCode(ergebnis);
      setCodePassphrase("");
    }
  }

  return (
    <>
      <Card title={t("zugang.kartenTitel")}>
        <p className="muted">{t("zugang.kartenText")}</p>
      </Card>

      <Card title={t("zugang.sperreTitel")}>
        <p className="muted">{t("zugang.sperreText")}</p>
        <FormField label={t("zugang.sperreTitel")}>
          <Auswahl
            ariaLabel={t("zugang.sperreTitel")}
            wert={String(minuten ?? "")}
            aufAenderung={(v) => {
              const m = Number(v);
              setMinuten(m);
              void zeitsperreSetzen(m);
            }}
            optionen={ZEITSPERRE_STUFEN.map((m) => ({
              wert: String(m),
              text: m === 0 ? t("zugang.sperreAus") : t("zugang.sperreMinuten", { minuten: m }),
            }))}
          />
        </FormField>
        {onSperren && <Button onClick={onSperren}>{t("zugang.jetztSperren")}</Button>}
      </Card>

      <Card title={t("zugang.wechselnTitel")}>
        <FormField label={t("zugang.feldAltePassphrase")} required>
          <input
            className="field"
            type="password"
            value={alte}
            onChange={(e) => setAlte(e.target.value)}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label={t("zugang.feldNeuePassphrase")}
          hint={t("zugang.hinweisLaenge", { mindestens: MINDESTLAENGE })}
          required
        >
          <input
            className="field"
            type="password"
            value={neue}
            onChange={(e) => setNeue(e.target.value)}
            autoComplete="off"
          />
        </FormField>
        {wechselMeldung && <p className="muted">{wechselMeldung}</p>}
        <Button variant="primary" onClick={() => void wechseln()}>
          {t("zugang.wechselnKnopf")}
        </Button>
      </Card>

      <Card title={t("zugang.codeAbrufenTitel")}>
        <p className="muted">{t("zugang.codeAbrufenText")}</p>
        {code ? (
          <pre className="zugang-code">{code}</pre>
        ) : (
          <>
            <FormField label={t("zugang.feldPassphrase")} required>
              <input
                className="field"
                type="password"
                value={codePassphrase}
                onChange={(e) => setCodePassphrase(e.target.value)}
                autoComplete="off"
              />
            </FormField>
            {codeMeldung && <p className="muted">{codeMeldung}</p>}
            <Button onClick={() => void zeigen()}>{t("zugang.codeAbrufenKnopf")}</Button>
          </>
        )}
      </Card>
    </>
  );
}
