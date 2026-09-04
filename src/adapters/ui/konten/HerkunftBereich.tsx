// Woher die Zeilen eines Kontos kommen — die Rohdaten hinter den Buchungen.
//
// Der Auszug zeigt, was IM KONTO steht. Hier steht, was HEREINKAM: jede eingelesene Zeile
// mit ihrem Lauf und ihrem Schicksal, auch die weggelegten. Sie liegen alle in der
// Datenbank, waren aber nirgends je Konto sichtbar — die Import-Inbox zeigt nur
// Weggelegtes aus Dateien, und die Abruf-Historie sah man nur einmal, im Dialog direkt
// nach dem Abruf.
//
// **Läufe ohne Wirkung bleiben in der Liste, gekennzeichnet.** Der Rückgriff holt bei
// jedem Abruf einige Tage doppelt, damit nachgetragene Buchungen nicht verlorengehen; die
// Mehrzahl aller Läufe bringt deshalb nichts Neues. Sie wegzulassen sähe aus, als wäre nie
// abgerufen worden — und genau das ist die Frage, mit der man hierherkommt. Sie stehen
// deshalb da und tragen einen Vermerk; sortieren kann man ohnehin nach jeder Spalte.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kontoherkunft, Laufbefund } from "../../../application";
import { zurueckholen, type Umsatz } from "../../../application/import";
import { herkunft as herkunftLaden, umsatzSpeichern } from "../../dienste";
import { Card, Pill } from "../bausteine";
import { Zeilenauswahl } from "../bausteine/Zeilenauswahl";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { DataTable } from "../bausteine/DataTable";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

type Statusfilter = "alle" | "verbucht" | "weggelegt" | "offen";

/**
 * Was für ein Konto hereinkam — in zwei Lesarten, und der Unterschied ist der Punkt.
 *
 * **Ohne `zugangId`** (unter der Kontenliste): EINE Tabelle mit allen Zeilen
 * des Kontos, aus jeder Quelle, dazu die Filter. Die Frage dort ist „was steht für dieses
 * Konto überhaupt in der Datenbank" — und darauf wäre eine nach Abrufen getrennte Antwort
 * keine Antwort. Die Läufe stehen hier bewusst NICHT: sie zerlegen genau die Liste, die
 * man am Stück sehen will. Aus welchem Import eine Zeile kam, sagt ihre Spalte.
 *
 * **Mit `zugangId`** (unter einem Bankzugang): die Importe DIESES Zugangs als eigene
 * Tabelle, und die Zeilen erst, wenn einer davon gewählt ist. Die Frage dort ist eine
 * andere: „was hat dieser Abruf gebracht". Wer ihr nachgeht, will die Importe
 * nebeneinander vergleichen — ein Stapel aller Zeilen beantwortet sie nicht.
 *
 * Er steht IMMER unter der Zeile, die ihn geöffnet hat, und führt keine eigene Kontowahl
 * — deshalb ist `kontoId` Pflicht. Es gab einmal ein Register „Herkunft" mit eigener
 * Kontowahl davor; seit die Kontentabelle selbst aufklappt, stellte es dieselbe Frage ein
 * zweites Mal und ist entfallen.
 */
export function HerkunftBereich({
  kontoId,
  zugangId,
}: {
  /** Das Konto, dessen Zeilen gezeigt werden. Pflicht — siehe Kopf. */
  kontoId: string;
  zugangId?: string;
}) {
  /** Welcher Lauf seine Zeilen zeigt. Nur im Zugangs-Fall überhaupt wählbar. */
  const [laufId, setLaufId] = useState<string | null>(null);
  const { t } = useTranslation();
  const geld = useGeld();
  // Der Lauf trägt sein Datum voll aus (`mitJahr`), die Zeile darunter mit
  // zweistelligem Jahr — dort ist die Spalte schmal und der Lauf steht daneben.
  const datum = useDatum();
  const [konten, setKonten] = useState<readonly Kontoherkunft[]>([]);
  // Von aussen vorgewaehlt, wenn jemand aus der Kontenliste hierher gesprungen ist.
  // Danach fuehrt der Bereich seine Auswahl selbst weiter — wer hier ankommt, will sich
  // umsehen und nicht bei jedem Klick zurueckgesetzt werden.
  const [gewaehlt] = useState<string>(kontoId);
  const [filter, setFilter] = useState<Statusfilter>("alle");
  /**
   * Nach QUELLE eingrenzen — auf der Kontenseite, wo die Importliste bewusst fehlt.
   *
   * Dort steht alles in EINER Tabelle, und die Frage „was kam eigentlich aus der Bank und
   * was aus einer Datei" muss trotzdem beantwortbar bleiben. Über die Zeilen zu blättern
   * und die Herkunftsspalte zu lesen ist keine Antwort.
   */
  const [quelle, setQuelle] = useState<string>("alle");

  async function laden() {
    setKonten(await herkunftLaden());
  }
  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  const aktiv = konten.find((k) => k.konto.id === gewaehlt);

  const gefiltert = useMemo(() => {
    let zeilen = aktiv?.zeilen ?? [];
    // Unter einem Bankzugang zählt nur, was ÜBER IHN hereinkam. Eine Zeile aus einer
    // Datei gehört zwar zum selben Konto, aber nicht zu diesem Abrufweg — sie hier
    // mitzuzeigen beantwortete die gestellte Frage nicht, sondern eine andere.
    if (zugangId) zeilen = zeilen.filter((z) => z.lauf?.zugangId === zugangId);
    // Und wenn ein einzelner Import gewählt ist, nur dessen Zeilen.
    if (laufId) zeilen = zeilen.filter((z) => z.lauf?.id === laufId);
    if (quelle !== "alle") zeilen = zeilen.filter((z) => z.lauf?.quelle === quelle);
    if (filter === "alle") return zeilen;
    return zeilen.filter((z) => {
      if (filter === "verbucht") return z.umsatz.status === "verbucht";
      if (filter === "offen") return z.umsatz.status === "neu";
      return z.umsatz.status === "verworfen" || z.umsatz.status === "duplikat";
    });
  }, [aktiv, filter, zugangId, laufId, quelle]);

  /** Welche Quellen dieses Konto überhaupt gespeist haben — nur die stehen zur Wahl. */
  const quellen = useMemo(
    () => [...new Set((aktiv?.zeilen ?? []).map((z) => z.lauf?.quelle).filter(Boolean))] as string[],
    [aktiv],
  );

  /** Die Importe dieses Kontos — unter einem Zugang nur die über IHN gelaufenen. */
  const alleLaeufe = useMemo(
    () => (aktiv?.laeufe ?? []).filter((l) => !zugangId || l.lauf.zugangId === zugangId),
    [aktiv, zugangId],
  );

  async function zurueck(umsatz: Umsatz) {
    await umsatzSpeichern(zurueckholen(umsatz));
    await laden();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>

      {aktiv && (
        <>
          {/* Die IMPORTE dieses Zugangs — eine eigene Tabelle, in der man sie
              nebeneinander vergleichen kann. Nur hier: unter der Kontenliste zerlegten
              sie die Zeilenliste, die man dort am Stück sehen will. */}
          {zugangId && (
          <Card title={t("konten.herkunft.laeufeTitel")}>
            {alleLaeufe.length === 0 ? (
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.herkunft.keineLaeufe")}</div>
            ) : (
              <DataTable
                sortable
                istAktiv={(l: Laufbefund) => l.lauf.id === laufId}
                columns={[
                  {
                    key: "zeitpunkt",
                    label: t("konten.herkunft.spalteImport"),
                    render: (l: Laufbefund) => (
                      <Zeilenlink
                        onKlick={() => setLaufId(laufId === l.lauf.id ? null : l.lauf.id)}
                        titel={t("konten.herkunft.zeigeLauf", { datum: datum.mitJahr(l.lauf.zeitpunkt) })}
                      >
                        {datum.mitJahr(l.lauf.zeitpunkt)}
                      </Zeilenlink>
                    ),
                  },
                  {
                    key: "quelle",
                    label: t("konten.detail.herkunft"),
                    render: (l: Laufbefund) => <Pill variant="neutral">{l.lauf.quelle}</Pill>,
                  },
                  { key: "zeilen", label: t("konten.herkunft.spalteZeilen"), align: "right" as const },
                  { key: "verbucht", label: t("konten.herkunft.status.verbucht"), align: "right" as const },
                  { key: "offen", label: t("konten.herkunft.status.neu"), align: "right" as const },
                  { key: "weggelegt", label: t("konten.herkunft.filter.weggelegt"), align: "right" as const },
                  {
                    key: "_wirkung",
                    label: "",
                    // Der Rückgriff holt bei jedem Abruf einige Tage doppelt, damit
                    // nachgetragene Buchungen nicht verlorengehen; die Mehrzahl aller Läufe
                    // bringt deshalb nichts Neues. Sie bleiben in der Liste — verschwiegen
                    // sähe es aus, als wäre nie abgerufen worden — und sind als solche
                    // gekennzeichnet.
                    render: (l: Laufbefund) =>
                      l.verbucht === 0 && l.offen === 0 ? (
                        <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
                          {t("konten.herkunft.nichtsNeues")}
                        </span>
                      ) : null,
                  },
                ]}
                rows={alleLaeufe}
              />
            )}
          </Card>
          )}

          {/* Die Rohzeilen. Der Filter ist der Punkt: weggelegte Zeilen waren bisher
              nirgends je Konto zu sehen.
              Unter einem Zugang erscheinen sie erst NACH der Wahl eines Imports: dort
              lautet die Frage „was hat dieser Abruf gebracht", und ein Stapel aller Zeilen
              verdeckt sie, statt sie zu beantworten. */}
          {zugangId && !laufId ? (
            <Card>
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {alleLaeufe.length === 0
                  ? t("konten.herkunft.keineLaeufeZugang")
                  : t("konten.herkunft.laufWaehlen")}
              </div>
            </Card>
          ) : (
          <Card>
            <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
              {(["alle", "verbucht", "weggelegt", "offen"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="linkbtn"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--line)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: filter === f ? "var(--fw-bold)" : "normal",
                    background: filter === f ? "var(--accent-wash)" : "transparent",
                  }}
                >
                  {t(`konten.herkunft.filter.${f}`)}
                </button>
              ))}

              {/* Nach Quelle eingrenzen — nur wo es überhaupt mehrere gibt. Ein Filter mit
                  einer einzigen Möglichkeit fragt nach etwas, das schon feststeht.
                  Unter einem Zugang entfällt er: dort steht die Quelle über die Wahl des
                  Imports ohnehin fest. */}
              {!zugangId && quellen.length > 1 && (
                <Zeilenauswahl
                  label={t("konten.detail.herkunft")}
                  wert={quelle}
                  onChange={setQuelle}
                  moeglichkeiten={[
                    { wert: "alle", text: t("konten.herkunft.filter.alle") },
                    ...quellen.map((q) => ({ wert: q, text: q })),
                  ]}
                />
              )}
            </div>

            {gefiltert.length === 0 ? (
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.herkunft.keineZeilen")}</div>
            ) : (
              <DataTable
                columns={[
                  { key: "datum", label: t("konten.spalteDatum"), render: (z) => datum.kurz(z.umsatz.buchungstag) },
                  {
                    key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 280,
                    render: (z) => z.umsatz.gegenpartei || z.umsatz.verwendungszweck || "—",
                  },
                  {
                    key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right",
                    sortValue: (z) => z.umsatz.betrag,
                    render: (z) => (
                      <span className="num" style={{ fontWeight: 700, color: geldFarbe(z.umsatz.betrag) }}>
                        {geld.format(z.umsatz.betrag, { mitVorzeichen: true })}
                      </span>
                    ),
                  },
                  {
                    key: "status", label: t("konten.herkunft.spalteStatus"),
                    render: (z) => (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <Pill variant={z.umsatz.status === "verbucht" ? "ok" : z.umsatz.status === "neu" ? "warn" : "neutral"}>
                          {t(`konten.herkunft.status.${z.umsatz.status}`)}
                        </Pill>
                        {/* Der Widerspruch, den man sonst nie sieht: der Umsatz sagt
                            „verbucht", die Buchung dazu gibt es nicht mehr. */}
                        {z.umsatz.status === "verbucht" && !z.gebucht && (
                          <Pill variant="warn">{t("konten.herkunft.buchungFehlt")}</Pill>
                        )}
                      </span>
                    ),
                  },
                  { key: "quelle", label: t("konten.detail.herkunft"), render: (z) => z.lauf?.quelle ?? "—" },
                  {
                    key: "_a", label: "", align: "right", sortable: false,
                    render: (z) =>
                      z.umsatz.status === "verworfen" || z.umsatz.status === "duplikat" ? (
                        <button className="linkbtn" style={{ padding: 0, fontSize: "var(--fs-xs)" }} onClick={() => void zurueck(z.umsatz)}>
                          {t("konten.herkunft.zurueckholen")}
                        </button>
                      ) : null,
                  },
                ]}
                rows={[...gefiltert]}
              />
            )}
          </Card>
          )}
        </>
      )}
    </div>
  );
}
