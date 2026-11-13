// Was man an der Verschlüsselung noch einstellen kann: Passphrase wechseln, den
// Wiederherstellungscode noch einmal ansehen, einen neuen Schlüssel erzeugen, die
// Zeitsperre stellen.
//
// **Der Code hängt hier hinter der Passphrase**, obwohl die App gerade offen ist. Genau
// das ist der Punkt: die Zeitsperre schützt gegen jemanden am entsperrten Rechner — läge
// der Code eine Klick-Ebene tiefer offen, wäre sie umsonst.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Feldzeile } from "../bausteine/Feldzeile";
import { Stapel } from "../bausteine/Anordnung";
import { Passwortfeld } from "./Passwortfeld";
import { MINDESTLAENGE } from "../../../application/zugang";
import { ZEITSPERRE_STUFEN } from "../../../application/einstellungen";
import {
  zeitsperre,
  zeitsperreSetzen,
  zugangCodeZeigen,
  zugangPassphraseWechseln,
  zugangSchluesselWechseln,
} from "../../dienste";

export function VerschluesselungCard({ onSperren }: { onSperren?: () => void }) {
  const { t } = useTranslation();

  const [alte, setAlte] = useState("");
  const [neue, setNeue] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [wechselMeldung, setWechselMeldung] = useState<string | null>(null);

  const [codePassphrase, setCodePassphrase] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [codeMeldung, setCodeMeldung] = useState<string | null>(null);

  const [schluesselPassphrase, setSchluesselPassphrase] = useState("");
  const [schluesselLaeuft, setSchluesselLaeuft] = useState(false);
  const [schluesselMeldung, setSchluesselMeldung] = useState<string | null>(null);
  const [neuerSchluessel, setNeuerSchluessel] = useState<{
    code: string;
    umgestellt: number;
    uebrig: number;
  } | null>(null);

  const [minuten, setMinuten] = useState<number | null>(null);

  useEffect(() => {
    void zeitsperre().then(setMinuten);
  }, []);

  async function wechseln() {
    setWechselMeldung(null);
    // **Vor dem Aufruf, nicht danach.** Ein Vertipper in der NEUEN Passphrase faellt sonst
    // nirgends auf: der Wechsel gelingt, die Huelle traegt ab jetzt das Verschriebene, und
    // gemerkt wird es beim naechsten Entsperren — dann ist der Bestand nur noch ueber den
    // Wiederherstellungscode zu erreichen. Die Einrichtung im Sperrbildschirm prueft das
    // seit jeher; hier fehlte es, und hier waere der Schaden groesser gewesen, weil beim
    // Einrichten noch nichts drinsteht.
    if (neue !== wiederholung) {
      setWechselMeldung(t("zugang.stimmtNichtUeberein"));
      return;
    }
    const ergebnis = await zugangPassphraseWechseln(alte, neue);
    if (ergebnis.art === "fertig") {
      setAlte("");
      setNeue("");
      setWiederholung("");
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

  async function schluesselWechseln() {
    if (schluesselLaeuft) return;
    setSchluesselMeldung(null);
    setSchluesselLaeuft(true);
    try {
      const ergebnis = await zugangSchluesselWechseln(schluesselPassphrase);
      if (ergebnis === null) setSchluesselMeldung(t("zugang.passphraseFalsch"));
      else {
        setNeuerSchluessel({
          code: ergebnis.wiederherstellungscode,
          umgestellt: ergebnis.sicherungenUmgestellt,
          uebrig: ergebnis.sicherungenUebrig,
        });
        setSchluesselPassphrase("");
        // Ein vorher angezeigter Code ist ab jetzt der ALTE — er darf nicht neben dem
        // neuen stehenbleiben und für den gültigen gehalten werden.
        setCode(null);
      }
    } catch {
      // Rust hat den Bestand dann mit dem bisherigen Schlüssel wieder geöffnet; der alte
      // Code gilt weiter. Mehr als „hat nicht geklappt" weiss die Oberfläche nicht.
      setSchluesselMeldung(t("zugang.fehlerAllgemein"));
    } finally {
      setSchluesselLaeuft(false);
    }
  }

  // Die Karten stehen ohne Hülle untereinander — den Abstand setzt das Register
  // (`stapeln`). Innen trägt jede einen `Stapel`: Erklärung, Felder, Meldung und Knopf
  // hatten vorher keinen Abstand zueinander, nur die Ränder der `<p>`.
  //
  // Eine Karte „Verschlüsselung" mit dem Satz, dass der Bestand verschlüsselt ist, stand
  // bis 2026-11-12 obenan. Derselbe Satz ist der Untertitel des Registers — zweimal
  // dasselbe direkt übereinander.
  return (
    <>
      <Card title={t("zugang.sperreTitel")}>
        <Stapel>
          <p className="muted" style={{ margin: 0 }}>{t("zugang.sperreText")}</p>
          {/* Die Stufe stellen und sofort sperren sind zwei Wege an derselben Stelle —
              der Knopf schliesst hier nichts ab, er ist die zweite Moeglichkeit. Deshalb
              daneben und nicht darunter. */}
          <Feldzeile
            feld={
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
            }
            knopf={onSperren && <Button onClick={onSperren}>{t("zugang.jetztSperren")}</Button>}
          />
        </Stapel>
      </Card>

      <Card title={t("zugang.wechselnTitel")}>
        <Stapel>
          <Passwortfeld
            label={t("zugang.feldAltePassphrase")}
            wert={alte}
            setzen={setAlte}
          />
          <Passwortfeld
            label={t("zugang.feldNeuePassphrase")}
            hint={t("zugang.hinweisLaenge", { mindestens: MINDESTLAENGE })}
            wert={neue}
            setzen={setNeue}
          />
          <Passwortfeld
            label={t("zugang.feldWiederholung")}
            wert={wiederholung}
            setzen={setWiederholung}
          />
        </Stapel>
        <div className="form-actions">
          <Button variant="primary" onClick={() => void wechseln()}>
            {t("zugang.wechselnKnopf")}
          </Button>
          {wechselMeldung && <span className="hinweis">{wechselMeldung}</span>}
        </div>
      </Card>

      <Card title={t("zugang.codeAbrufenTitel")}>
        <Stapel>
          <p className="muted" style={{ margin: 0 }}>{t("zugang.codeAbrufenText")}</p>
          {code ? (
            <pre className="zugang-code">{code}</pre>
          ) : (
            <Feldzeile
              feld={
                <Passwortfeld
                  label={t("zugang.feldPassphrase")}
                  wert={codePassphrase}
                  setzen={setCodePassphrase}
                  beiEnter={() => void zeigen()}
                />
              }
              knopf={<Button onClick={() => void zeigen()}>{t("zugang.codeAbrufenKnopf")}</Button>}
            />
          )}
          {codeMeldung && <span className="hinweis">{codeMeldung}</span>}
        </Stapel>
      </Card>

      <Card title={t("zugang.schluesselTitel")}>
        <Stapel>
          <p className="muted" style={{ margin: 0 }}>{t("zugang.schluesselText")}</p>
          {neuerSchluessel ? (
            <>
              <p style={{ margin: 0 }}>{t("zugang.schluesselFertig")}</p>
              <pre className="zugang-code">{neuerSchluessel.code}</pre>
              {neuerSchluessel.umgestellt > 0 && (
                <p className="muted" style={{ margin: 0 }}>
                  {t("zugang.schluesselSicherungen", { count: neuerSchluessel.umgestellt })}
                </p>
              )}
              {neuerSchluessel.uebrig > 0 && (
                <p className="muted" style={{ margin: 0 }}>
                  {t("zugang.schluesselUebrig", { count: neuerSchluessel.uebrig })}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Solange es läuft, ist der Knopf gesperrt: ein zweiter Klick träfe auf
                  eine Datenbank, die Rust gerade geschlossen hat, und meldete einen Fehler
                  mitten in einen Wechsel hinein, der gelingt. Der Hinweis daneben sagt,
                  warum nichts passiert. */}
              <Feldzeile
                feld={
                  <Passwortfeld
                    label={t("zugang.feldPassphrase")}
                    wert={schluesselPassphrase}
                    setzen={setSchluesselPassphrase}
                  />
                }
                knopf={
                  <Button onClick={() => void schluesselWechseln()} laeuft={schluesselLaeuft}>
                    {t("zugang.schluesselKnopf")}
                  </Button>
                }
              />
              {schluesselMeldung && <span className="hinweis">{schluesselMeldung}</span>}
              {schluesselLaeuft && <span className="hinweis">{t("zugang.schluesselLaeuft")}</span>}
            </>
          )}
        </Stapel>
      </Card>
    </>
  );
}
