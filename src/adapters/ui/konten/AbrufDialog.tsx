// Abrufen — der Knopf, hinter dem eine Banksitzung steckt.
//
// Gefragt wird nur nach der PIN: alles andere (Bank, Zugangsname, welche Konten) steht
// schon am Zugang und an den Zuordnungen. Die PIN wird nicht gespeichert — sie lebt in
// diesem State und ist mit dem Schließen weg.
//
// Was danach passiert, ist genau der Weg des Dateiimports: die abgerufenen Umsätze
// laufen durch dieselbe Übernahme mit Dedup, Kategorie-Vorschlag und Review-Inbox. Der
// Abruf ist nur eine andere Quelle, kein zweiter Import.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { speicherzeitraumTage, type Abrufergebnis, type Bankprofil, type Bankzugang } from "../../../application";
import { bankAbrufen, bankzugaenge } from "../../dienste";
import { TanDialog, useTanFrage } from "./TanDialog";
import { useGeld } from "../bausteine/einstellungenKontext";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { beiEnter } from "../bausteine/beiEnter";
import { Modal } from "../bausteine/Modal";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function AbrufDialog({ onClose, onFertig }: { onClose: () => void; onFertig: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [zugaenge, setZugaenge] = useState<Bankzugang[]>([]);
  const [zugangId, setZugangId] = useState("");
  const [pin, setPin] = useState("");
  /**
   * Wie weit zurück geholt wird. Leer = fortlaufend ab dem letzten Stand, der Normalfall.
   *
   * Die Wahl gibt es, weil ein Altbestand aus einer Datei nur dann durch die Zeilen der
   * Bank ersetzt werden kann, wenn die Bank denselben Zeitraum liefert — und das sind
   * Monate. Was über den Speicherzeitraum der Bank hinausgeht, kommt einfach nicht;
   * ein Fehler ist es nicht.
   */
  const [rueckgriff, setRueckgriff] = useState("");
  /**
   * Ob statt der Auswahl ein freies Feld steht.
   *
   * Die festen Stufen decken die üblichen Fälle ab, aber nicht den, um den es beim
   * Ersetzen eines Dateibestands geht: dessen Zeitraum ist eine beliebige Zahl, und ihn
   * auf die nächste Stufe zu runden holt entweder zu wenig oder unnötig viel.
   */
  const [eigenerZeitraum, setEigenerZeitraum] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [befunde, setBefunde] = useState<Abrufergebnis | null>(null);
  const { tanFrage, tanFrageSchliessen, frageTan } = useTanFrage();

  useEffect(() => {
    bankzugaenge()
      .then((z) => {
        setZugaenge(z);
        setZugangId(z[0]?.id ?? "");
      })
      .catch(() => setZugaenge([]));
  }, []);

  /**
   * Wie weit die gewählte Bank zurückreicht — aus dem gespeicherten Profil, ohne
   * Anmeldung. `undefined` heisst „nicht bekannt", nicht „unbegrenzt": ein Zugang, der
   * noch nie geprüft wurde, hat kein Profil.
   */
  const grenze = (() => {
    const zugang = zugaenge.find((z) => z.id === zugangId);
    if (!zugang?.profil) return undefined;
    try {
      return speicherzeitraumTage(JSON.parse(zugang.profil) as Bankprofil);
    } catch {
      return undefined;
    }
  })();

  const gewuenscht = rueckgriff ? Number(rueckgriff) : undefined;
  const ueberGrenze = grenze != null && gewuenscht != null && gewuenscht > grenze;

  async function abrufen() {
    const zugang = zugaenge.find((z) => z.id === zugangId);
    if (!zugang) return;
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await bankAbrufen(
        zugang,
        pin,
        frageTan,
        heuteIso(),
        rueckgriff ? Number(rueckgriff) : undefined,
      );
      setBefunde(ergebnis);
      setPin("");
      onFertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        title={t("konten.abruf.titel")}
        subtitle={t("konten.abruf.untertitel")}
        onClose={onClose}
        footer={
          befunde ? (
            <Button variant="primary" onClick={onClose}>
              {t("konten.abruf.fertig")}
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => void abrufen()}>
                {busy ? t("konten.abruf.laeuft") : t("konten.abruf.starten")}
              </Button>
              <button className="linkbtn" onClick={onClose}>
                {t("einstellungen.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          )
        }
      >
        {zugaenge.length === 0 && <div className="muted">{t("konten.abruf.keinZugang")}</div>}

        {zugaenge.length > 0 && !befunde && (
          <>
            {zugaenge.length > 1 && (
              <FormField label={t("konten.abruf.feldZugang")}>
                <Auswahl
                  ariaLabel={t("konten.abruf.feldZugang")}
                  wert={zugangId}
                  aufAenderung={setZugangId}
                  optionen={zugaenge.map((z) => ({ wert: z.id, text: z.bezeichnung }))}
                />
              </FormField>
            )}
            <FormField label={t("bankabruf.feldPin")} required hint={t("bankabruf.feldPinHinweis")}>
              <input
                className="field"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={beiEnter(() => void abrufen(), !!pin.trim() && !busy)}
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <FormField
              label={t("konten.abruf.feldZeitraum")}
              hint={
                grenze != null
                  ? t("konten.abruf.zeitraumGrenze", { tage: grenze })
                  : t("konten.abruf.zeitraumHinweis")
              }
            >
              <Auswahl
                ariaLabel={t("konten.abruf.feldZeitraum")}
                wert={eigenerZeitraum ? "eigen" : rueckgriff}
                aufAenderung={(v) => {
                  if (v === "eigen") {
                    setEigenerZeitraum(true);
                    setRueckgriff("");
                  } else {
                    setEigenerZeitraum(false);
                    setRueckgriff(v);
                  }
                }}
                optionen={[
                  { wert: "", text: t("konten.abruf.zeitraumFortlaufend") },
                  ...[30, 90, 180, 360].map((n) => ({ wert: String(n), text: t("konten.abruf.zeitraumTage", { n }) })),
                  { wert: "eigen", text: t("konten.abruf.zeitraumEigen") },
                ]}
              />
              {eigenerZeitraum && (
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={grenze ?? undefined}
                  style={{ marginTop: "var(--sp-2)" }}
                  aria-label={t("konten.abruf.zeitraumEigenFeld")}
                  placeholder={t("konten.abruf.zeitraumEigenPlatzhalter")}
                  value={rueckgriff}
                  onChange={(e) => setRueckgriff(e.target.value)}
                  autoFocus
                />
              )}
              {/* Kein Fehler, sondern eine Ansage: die Bank liefert schlicht weniger, und
                  ohne diesen Satz liest sich das Ergebnis wie ein vollständiger Abruf. */}
              {ueberGrenze && (
                <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-1)" }}>
                  {t("konten.abruf.zeitraumGedeckelt", { tage: grenze })}
                </div>
              )}
            </FormField>
          </>
        )}

        {befunde && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {befunde.konten.map((b) => (
              <li key={b.zahlungskontoId + b.von} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-2) 0" }}>
                <strong>{b.bezeichnung}</strong>{" "}
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {b.von} – {b.bis}
                  {b.format ? ` · ${b.format}` : ""}
                </span>
                <div>
                  {b.fehler ? (
                    <span className="err">{b.fehler}</span>
                  ) : (
                    t("konten.abruf.zeile", {
                      eingelesen: b.ergebnis?.eingelesen ?? 0,
                      neu: b.ergebnis?.neu ?? 0,
                      duplikate: b.ergebnis?.duplikate ?? 0,
                    })
                  )}
                </div>
                {b.bankSaldo != null && (
                  <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {t("konten.abgleich.gemeldet", { datum: b.bankSaldoDatum ?? b.bis })}
                  </div>
                )}
                {/* Was auffiel, ohne den Abruf zu kippen — übersprungene Zeilen, unlesbare
                    Salden, die Summenprobe des Auszugs. Nicht als Fehler ausgezeichnet: der
                    Abruf hat geliefert. Aber sichtbar, denn der Befund gilt dem Bestand und
                    nicht dem Vorgang, und er verschwindet mit dem Dialog nicht aus der Welt. */}
                {b.warnungen?.map((w, i) => (
                  <div key={i} style={{ fontSize: "var(--fs-xs)", color: "var(--warn-deep)" }}>
                    {w}
                  </div>
                ))}
              </li>
            ))}
            {/* Depots stehen getrennt: sie liefern keine Buchungen, sondern einen Stand. */}
            {befunde.depots.map((d) => (
              <li key={d.schluessel} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-2) 0" }}>
                <strong>{d.bezeichnung}</strong>{" "}
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("depot.bezeichnung")}
                  {d.uebernahme ? ` · ${d.uebernahme.stichtag}` : ""}
                </span>
                <div>
                  {d.fehler ? (
                    <span className="err">{d.fehler}</span>
                  ) : d.uebernahme?.ohneGesamtwert ? (
                    t("depot.abrufOhneWert", { n: d.uebernahme.positionen })
                  ) : (
                    t("depot.abrufZeile", {
                      n: d.uebernahme?.positionen ?? 0,
                      wert: geld.formatMitSymbol(d.uebernahme?.gesamtwert ?? 0),
                    })
                  )}
                </div>
              </li>
            ))}
            {befunde.konten.length === 0 && befunde.depots.length === 0 && (
              <li className="muted">{t("konten.abruf.keineZuordnung")}</li>
            )}
            <li className="muted" style={{ fontSize: "var(--fs-xs)", paddingTop: "var(--sp-3)" }}>
              {t("konten.abruf.weiterInInbox")}
            </li>
          </ul>
        )}
      </Modal>

      {tanFrage && <TanDialog frage={tanFrage} onFertig={tanFrageSchliessen} />}
    </>
  );
}
