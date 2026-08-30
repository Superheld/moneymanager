// Das Tor vor der App: einrichten, entsperren, oder mit dem Zettel hinein.
//
// **Warum das kein Screen unter den anderen ist.** Es gibt hier keine Navigation, keine
// Seitenleiste, kein Ausweichen — solange die Datenbank zu ist, gibt es nichts zu sehen.
// Ein Sperrbildschirm, an dem man vorbeikommt, ist keiner.
//
// **Und warum die Einrichtung nicht abzulehnen ist.** Kein „später", kein „ohne
// Verschlüsselung starten". Ein Haushalt, der beim ersten Start unter Zeitdruck steht,
// klickt genau das weg — und legt dann für immer unverschlüsselt ab, ohne es je wieder
// zu bemerken.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, FormField } from "../bausteine";
import { Passwortfeld } from "./Passwortfeld";
import { MINDESTLAENGE, type Passphrasebefund } from "../../../application/zugang";

export type Sperrgrund = "einrichten" | "entsperren";

export interface SperrbildschirmProps {
  grund: Sperrgrund;
  /** Ob ein unverschlüsselter Altbestand überführt wird — ändert nur den Text. */
  altbestand: boolean;
  onEinrichten(passphrase: string): Promise<{ ok: boolean; code?: string; befund?: Passphrasebefund }>;
  onEntsperren(passphrase: string): Promise<boolean>;
  onMitCode(code: string, neue: string): Promise<{ ok: boolean; befund?: Passphrasebefund }>;
  /** Wird gerufen, wenn der Nutzer den Code weggeklickt hat und es weitergehen darf. */
  onFertig(): void;
}

export function Sperrbildschirm(p: SperrbildschirmProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [code, setCode] = useState("");
  const [rettung, setRettung] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gezeigterCode, setGezeigterCode] = useState<string | null>(null);
  const [notiert, setNotiert] = useState(false);

  function befundText(b?: Passphrasebefund): string {
    if (!b || b.taugt) return t("zugang.fehlerAllgemein");
    return b.grund === "zuKurz"
      ? t("zugang.zuKurz", { mindestens: MINDESTLAENGE })
      : t("zugang.nurLeerzeichen");
  }

  async function einrichten() {
    setFehler(null);
    if (passphrase !== wiederholung) {
      setFehler(t("zugang.stimmtNichtUeberein"));
      return;
    }
    setLaeuft(true);
    try {
      const ergebnis = await p.onEinrichten(passphrase);
      if (!ergebnis.ok) {
        setFehler(befundText(ergebnis.befund));
        return;
      }
      setGezeigterCode(ergebnis.code ?? null);
    } catch (e) {
      setFehler(String(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function entsperren() {
    setFehler(null);
    setLaeuft(true);
    try {
      if (!(await p.onEntsperren(passphrase))) {
        setFehler(t("zugang.passphraseFalsch"));
        return;
      }
      p.onFertig();
    } catch (e) {
      setFehler(String(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function retten() {
    setFehler(null);
    if (passphrase !== wiederholung) {
      setFehler(t("zugang.stimmtNichtUeberein"));
      return;
    }
    setLaeuft(true);
    try {
      const ergebnis = await p.onMitCode(code, passphrase);
      if (!ergebnis.ok) {
        setFehler(ergebnis.befund ? befundText(ergebnis.befund) : t("zugang.codeUnbrauchbar"));
        return;
      }
      p.onFertig();
    } catch (e) {
      setFehler(String(e));
    } finally {
      setLaeuft(false);
    }
  }

  // Der Code wird GENAU EINMAL gezeigt, und die App geht erst weiter, wenn jemand
  // bestätigt hat, dass er ihn notiert hat. Ein Zettel, den man später holen wollte,
  // wird nicht geholt.
  if (gezeigterCode) {
    return (
      <Rahmen titel={t("zugang.codeTitel")}>
        <p className="muted">{t("zugang.codeErklaerung")}</p>
        <pre className="zugang-code" aria-label={t("zugang.codeTitel")}>
          {gezeigterCode}
        </pre>
        <p className="muted">{t("zugang.codeWarnung")}</p>
        <label className="zugang-bestaetigung">
          <input
            type="checkbox"
            aria-label={t("zugang.codeNotiert")}
            checked={notiert}
            onChange={(e) => setNotiert(e.target.checked)}
          />
          {t("zugang.codeNotiert")}
        </label>
        <Button variant="primary" onClick={() => notiert && p.onFertig()}>
          {t("zugang.weiter")}
        </Button>
      </Rahmen>
    );
  }

  if (rettung) {
    return (
      <Rahmen titel={t("zugang.rettungTitel")}>
        <p className="muted">{t("zugang.rettungErklaerung")}</p>
        <FormField label={t("zugang.feldCode")} required>
          <input
            className="field"
            aria-label={t("zugang.feldCode")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <Passwortfeld
          label={t("zugang.feldNeuePassphrase")}
          hint={t("zugang.hinweisLaenge", { mindestens: MINDESTLAENGE })}
          wert={passphrase}
          setzen={setPassphrase}
        />
        <Passwortfeld
          label={t("zugang.feldWiederholung")}
          wert={wiederholung}
          setzen={setWiederholung}
        />
        {fehler && <p className="zugang-fehler">{fehler}</p>}
        <div className="zugang-knoepfe">
          <Button onClick={() => setRettung(false)}>{t("zugang.zurueck")}</Button>
          <Button variant="primary" onClick={() => void retten()}>
            {laeuft ? t("zugang.laeuft") : t("zugang.rettungKnopf")}
          </Button>
        </div>
      </Rahmen>
    );
  }

  if (p.grund === "einrichten") {
    return (
      <Rahmen titel={t("zugang.einrichtenTitel")}>
        <p className="muted">
          {p.altbestand ? t("zugang.einrichtenAltbestand") : t("zugang.einrichtenNeu")}
        </p>
        <Passwortfeld
          label={t("zugang.feldPassphrase")}
          hint={t("zugang.hinweisLaenge", { mindestens: MINDESTLAENGE })}
          wert={passphrase}
          setzen={setPassphrase}
        />
        <Passwortfeld
          label={t("zugang.feldWiederholung")}
          wert={wiederholung}
          setzen={setWiederholung}
        />
        {fehler && <p className="zugang-fehler">{fehler}</p>}
        <Button variant="primary" onClick={() => void einrichten()}>
          {laeuft ? t("zugang.laeuftEinrichten") : t("zugang.einrichtenKnopf")}
        </Button>
      </Rahmen>
    );
  }

  return (
    <Rahmen titel={t("zugang.entsperrenTitel")}>
      <Passwortfeld
        label={t("zugang.feldPassphrase")}
        wert={passphrase}
        setzen={setPassphrase}
        beiEnter={() => void entsperren()}
      />
      {fehler && <p className="zugang-fehler">{fehler}</p>}
      <div className="zugang-knoepfe">
        <Button onClick={() => setRettung(true)}>{t("zugang.vergessen")}</Button>
        <Button variant="primary" onClick={() => void entsperren()}>
          {laeuft ? t("zugang.laeuft") : t("zugang.entsperrenKnopf")}
        </Button>
      </div>
    </Rahmen>
  );
}

function Rahmen({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="zugang-buehne">
      <Card title={titel} floating style={{ maxWidth: "34rem", width: "100%" }}>
        <div className="zugang-inhalt">{children}</div>
      </Card>
    </div>
  );
}
