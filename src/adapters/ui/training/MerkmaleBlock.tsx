// „Was die Erkennung hier sieht" — der Blick auf EINE Buchung.
//
// Der Gegenentwurf zur abstrakten Liste: Ausschlüsse werden dort gepflegt, wo man den
// Beleg vor Augen hat. Wer in den Einstellungen entscheidet, ob `kdn` weg soll, entscheidet
// über ein Wort; wer es hier tut, sieht die Zahlung, in der es steht, und daneben, was es
// im ganzen Bestand anrichtet.
//
// Beide Zahlen zusammen sind der Punkt. Der Einzelfall allein verführt zum Wegwerfen von
// allem, was hässlich aussieht — ein zusammengelaufener Schlüssel aus Händlername, Ort
// und „karte" ist eine Buchstabenwurst und zugleich das schärfste Merkmal im Bestand. Die Statistik allein sagt nicht, worum es
// bei der Zahlung ging.
//
// Geladen wird erst auf Klick: die Trennschärfe braucht den gesamten Bestand, und ein
// Buchungsdialog soll sich nicht deshalb verzögern.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  herkunftVon,
  type IstBuchung,
  type Merkmalsherkunft,
} from "../../../application";
import type { Merkmalsansicht } from "../../../application/kategorien/merkmalskonfiguration";
import type { Umsatz } from "../../../application/import";
import { merkmaleZuBuchung, wortFreigeben, wortSperren } from "../../dienste";
import { Pill } from "../bausteine";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";

export function MerkmaleBlock({ buchung, umsatz }: { buchung: IstBuchung; umsatz?: Umsatz }) {
  const { t } = useTranslation();
  const { locale } = useGeld();
  const [offen, setOffen] = useState(false);
  const [stand, setStand] = useState<Merkmalsansicht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setFehler(null);
    try {
      setStand(
        await merkmaleZuBuchung({
          gegenpartei: umsatz?.gegenpartei ?? "",
          verwendungszweck: umsatz?.verwendungszweck ?? "",
          glaeubigerId: umsatz?.glaeubigerId,
          betrag: buchung.betrag,
        }),
      );
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  function umschalten() {
    const neu = !offen;
    setOffen(neu);
    if (neu && !stand) laden();
  }

  async function aendern(aktion: Promise<unknown>) {
    setStand(null);
    await aktion;
    await laden();
  }

  const prozent = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 0 })} %`;
  const zahl = (n: number) => n.toLocaleString(locale);
  /** Das nackte Wort ohne Präfix — nur das steht in der Ausschlussliste. */
  const wortVon = (merkmal: string) => merkmal.slice(merkmal.search(/[=:]/) + 1);

  return (
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      <button className="linkbtn" onClick={umschalten} aria-expanded={offen}>
        {offen ? "▾" : "▸"} {t("konten.merkmale.titel")}
      </button>

      {offen && (
        <div style={{ marginTop: "var(--sp-3)" }}>
          {fehler && <div className="err">{fehler}</div>}
          {!stand ? (
            <div className="muted">{t("konten.merkmale.laedt")}</div>
          ) : (
            <>
              {stand.vorschlag && (
                <div style={{ marginBottom: "var(--sp-4)" }}>
                  <div style={{ fontWeight: "var(--fw-bold)" }}>{t("konten.merkmale.vorschlag")}</div>
                  <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                    <Pill variant={stand.vorschlag.kategorieId === buchung.kategorieId ? "ok" : "warn"}>
                      {stand.vorschlag.kategorieId === buchung.kategorieId
                        ? t("konten.merkmale.trifftZu")
                        : t("konten.merkmale.trifftNicht")}
                    </Pill>
                    <span className="muted">
                      {t("konten.merkmale.sicherheit", { wert: prozent(stand.vorschlag.sicherheit) })}
                      {stand.vorschlag.unbekannt.length > 0 && (
                        <> · {t("konten.merkmale.unbekannt", { anzahl: stand.vorschlag.unbekannt.length })}</>
                      )}
                    </span>
                  </div>
                  {/* Die Beitragszerlegung ist bei einem linearen Modell die Rechnung
                      selbst, keine nachgebaute Erklärung. */}
                  <div style={{ marginTop: 4, display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    {stand.vorschlag.beitraege.map((b) => (
                      <span key={b.merkmal} className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {b.gewicht >= 0 ? "+" : "−"}
                        {Math.abs(b.gewicht).toFixed(2)} {b.merkmal}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!stand.hatModell && (
                <div className="muted" style={{ marginBottom: "var(--sp-4)" }}>
                  {t("konten.merkmale.vorschlagOhne")}
                </div>
              )}

              {stand.verwendet.length === 0 ? (
                <div className="muted">{t("konten.merkmale.keineMerkmale")}</div>
              ) : (
                <>
                  <div style={{ fontWeight: "var(--fw-bold)" }}>{t("konten.merkmale.verwendet")}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-2)" }}>
                    {t("konten.merkmale.verwendetHinweis")}
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {stand.verwendet.map(({ merkmal, wert }) => (
                      <div key={merkmal} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "var(--fw-semi)", minWidth: "16ch" }}>{merkmal}</span>
                        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                          {wert
                            ? t("konten.merkmale.belege", {
                                belege: zahl(wert.belege),
                                kategorien: zahl(wert.kategorien),
                                konzentration: prozent(wert.konzentration),
                              })
                            : t("konten.merkmale.nurEinmal")}
                        </span>
                        <button
                          className="linkbtn"
                          onClick={() =>
                            aendern(
                              wortSperren(
                                wortVon(merkmal),
                                herkunftVon(merkmal) ? [herkunftVon(merkmal) as Merkmalsherkunft] : undefined,
                              ),
                            )
                          }
                        >
                          {t("konten.merkmale.ausschliessen")}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stand.verworfen.length > 0 && (
                <div style={{ marginTop: "var(--sp-4)" }}>
                  <div style={{ fontWeight: "var(--fw-bold)" }}>{t("konten.merkmale.verworfen")}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-2)" }}>
                    {t("konten.merkmale.verworfenHinweis")}
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {stand.verworfen.map((v, i) => (
                      <div key={`${v.herkunft}-${v.wort}-${i}`} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ minWidth: "16ch" }}>{v.wort}</span>
                        <Pill>{t(`einstellungen.lernmaterial.verwurf.${v.grund}`)}</Pill>
                        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                          {t(`einstellungen.lernmaterial.herkunft.${v.herkunft}`)}
                        </span>
                        {/* Zurückholen geht nur bei Listeneinträgen — was der Code als
                            Nummer oder Platzhalter aussortiert, steht nirgends. */}
                        {v.grund === "ausgeschlossen" && stand.ausgeschlossen.has(v.wort) && (
                          <button className="linkbtn" onClick={() => aendern(wortFreigeben(v.wort))}>
                            {t("konten.merkmale.zulassen")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
