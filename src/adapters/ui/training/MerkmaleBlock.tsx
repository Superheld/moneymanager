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

import { useProzent } from "../bausteine/einstellungenKontext";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  herkunftVon,
  wortVon,
  type IstBuchung,
  type Merkmalsherkunft,
} from "../../../application";
import type { Merkmalsansicht } from "../../../application/kategorien/merkmalskonfiguration";
import type { Umsatz } from "../../../application/import";
import { merkmaleZuBuchung, wortFreigeben, wortSperren } from "../../dienste";
import { Pill, Button } from "../bausteine";
import { ErklaerungsTafel } from "./ErklaerungsTafel";
import { Klappblock } from "../bausteine/Klappblock";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";

export function MerkmaleBlock({
  buchung,
  umsatz,
  kategorieName,
}: {
  buchung: IstBuchung;
  umsatz?: Umsatz;
  /** Für die Erklärung; ohne sie stehen dort Ids statt Namen. */
  kategorieName?: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  const prozent = useProzent();
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
          betrag: buchung.betrag,
          kategorieId: buchung.kategorieId,
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

  const zahl = (n: number) => n.toLocaleString(locale);

  return (
    <Klappblock titel={t("konten.merkmale.titel")} offen={offen} onUmschalten={umschalten}>
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
                  {/* Warum diese Kategorie und nicht die gebuchte (oder, wenn
                      beide gleich sind, nicht die Zweitbeste). Bis 2026-11-09 standen
                      hier die rohen Gewichte der Gewinnerin — sie sagen nicht, was den
                      Ausschlag gab. */}
                  {stand.erklaerung && (
                    <div style={{ marginTop: "var(--sp-2)" }}>
                      <ErklaerungsTafel
                        erklaerung={stand.erklaerung}
                        kategorieName={(id) => kategorieName?.get(id) ?? id}
                        verteilung={(m) => stand.verwendet.find((v) => v.merkmal === m)?.wert?.verteilung}
                      />
                    </div>
                  )}
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
                  <div className="hinweis" style={{ marginBottom: "var(--sp-2)" }}>
                    {t("konten.merkmale.verwendetHinweis")}
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {stand.verwendet.map(({ merkmal, wert }) => (
                      <div key={merkmal} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "var(--fw-semi)", minWidth: "16ch" }}>{merkmal}</span>
                        <span className="hinweis">
                          {wert
                            ? t("konten.merkmale.belege", {
                                belege: zahl(wert.belege),
                                kategorien: zahl(wert.kategorien),
                                konzentration: prozent(wert.konzentration),
                              })
                            : t("konten.merkmale.nurEinmal")}
                        </span>
                        <Button variant="link"
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
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stand.verworfen.length > 0 && (
                <div style={{ marginTop: "var(--sp-4)" }}>
                  <div style={{ fontWeight: "var(--fw-bold)" }}>{t("konten.merkmale.verworfen")}</div>
                  <div className="hinweis" style={{ marginBottom: "var(--sp-2)" }}>
                    {t("konten.merkmale.verworfenHinweis")}
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {stand.verworfen.map((v, i) => (
                      <div key={`${v.herkunft}-${v.wort}-${i}`} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ minWidth: "16ch" }}>{v.wort}</span>
                        <Pill>{t(`einstellungen.lernmaterial.verwurf.${v.grund}`)}</Pill>
                        <span className="hinweis">
                          {t(`einstellungen.lernmaterial.herkunft.${v.herkunft}`)}
                        </span>
                        {/* Zurückholen geht nur bei Listeneinträgen — was der Code als
                            Nummer oder Platzhalter aussortiert, steht nirgends.

                            Und es hängt an `listenform`, nicht an `wort`: die Bank klebt
                            Nummern ans Wort, gesperrt wurde der bereinigte Kern. Vorher
                            stand hier `wort` — der Knopf erschien dann gar nicht, und in
                            der Liste des Trainingsbereichs löschte derselbe Griff eine
                            Zeile, die es nicht gibt: ohne Fehler und ohne Wirkung. */}
                        {v.grund === "ausgeschlossen" && v.listenform && stand.ausgeschlossen.has(v.listenform) && (
                          <Button variant="link" onClick={() => aendern(wortFreigeben(v.listenform!))}>
                            {t("konten.merkmale.zulassen")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
    </Klappblock>
  );
}
