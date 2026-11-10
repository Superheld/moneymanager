// Die dritte Karte der Kategorisierung: trainieren und prüfen. Der Rahmen, der sie lädt
// und zusammenhält, steht in `KategorisierungCards.tsx`.

import { useMemo, useState } from "react";
import {
  verwechslungsmatrix,
  wortVon,
  type Bewertung,
  type Fehltreffer,
  type Matrixzeile,
} from "../../../application";
import type { Laufvergleichsicht, Messprotokoll } from "../../../application/kategorien/klassifikatorTraining";
import { Button, DataTable, KPIStat } from "../bausteine";
import { ErklaerungsTafel } from "./ErklaerungsTafel";
import { useGeld } from "../bausteine/einstellungenKontext";
import {
  Abschnitt,
  zustandsText,
  type Grundlinie,
  type Hilfe,
} from "./kartenteile";

export function ModellInhalt({
  t, daten, kategorieName, zahl, prozent, bewertung, grundlinie, protokoll, vergleich, trainiert, listenGeaendert, aufTraining,
}: Hilfe & {
  bewertung: Bewertung | null;
  grundlinie: Grundlinie | null;
  protokoll: Messprotokoll | null;
  vergleich: Laufvergleichsicht | null;
  trainiert: boolean;
  listenGeaendert: boolean;
  aufTraining: () => void;
}) {
  const { locale } = useGeld();
  /** Welches Verwechslungspaar aufgeklappt ist — `null` heisst keins. */
  const [offenesPaar, setOffenesPaar] = useState<{
    tatsaechlich: string;
    vorhergesagt: string;
  } | null>(null);
  // Woher ein Merkmal sein Gewicht hat — einmal je Material als Karte, nicht je Zeile
  // gesucht. Vor dem frühen Rücksprung, weil ein Hook nicht bedingt laufen darf.
  const verteilungNachMerkmal = useMemo(
    () => new Map((daten?.material.vokabular.merkmale ?? []).map((m) => [m.merkmal, m.verteilung])),
    [daten],
  );
  if (!daten) return <div className="muted">…</div>;
  const stand = daten.zustand.stand;
  const matrix = bewertung
    ? verwechslungsmatrix(bewertung)
    : { kategorien: [] as string[], zeilen: [] as Matrixzeile[] };

  return (
    <>
      <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", flexWrap: "wrap" }}>
        {daten.material.beispiele.length > 0 && (
          <Button variant="primary" onClick={aufTraining}>
            {trainiert ? t("einstellungen.lernmaterial.trainiertGerade") : t("einstellungen.lernmaterial.trainieren")}
          </Button>
        )}
        {listenGeaendert && <span className="muted">{t("einstellungen.lernmaterial.modellVeraltet")}</span>}
      </div>

      {!stand ? (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.lernmaterial.nieTrainiert")}
        </div>
      ) : (
        <>
          {/* Die Vergleichslinie steht NEBEN der Genauigkeit und nicht in einer
              Fussnote: für sich genommen sagt eine Trefferquote nichts. In einem
              Haushalt, in dem eine Kategorie ein Viertel aller Zahlungen ausmacht,
              trifft blindes Raten schon ein Viertel. Erst der Abstand ist eine
              Aussage — und erst mit ihm lässt sich sagen, ob eine Änderung etwas
              gebracht hat. */}
          <div className="kpis" style={{ marginTop: "var(--sp-4)" }}>
            <KPIStat
              size="tile"
              label={t("einstellungen.lernmaterial.genauigkeit")}
              value={
                stand.genauigkeit === undefined
                  ? t("einstellungen.lernmaterial.genauigkeitUnbekannt")
                  : prozent(stand.genauigkeit)
              }
              meta={
                stand.genauigkeit === undefined
                  ? t("einstellungen.lernmaterial.genauigkeitUnbekanntMeta")
                  : bewertung
                    ? t("einstellungen.lernmaterial.genauigkeitMeta", { gesamt: zahl(bewertung.gesamt) })
                    : undefined
              }
              tone={stand.genauigkeit !== undefined && stand.genauigkeit >= 0.85 ? "ok" : "default"}
            />
            {grundlinie && stand.genauigkeit !== undefined && (
              <KPIStat
                size="tile"
                label={t("einstellungen.lernmaterial.grundlinie")}
                value={prozent(grundlinie.genauigkeit)}
                meta={t("einstellungen.lernmaterial.grundlinieMeta", {
                  kategorie: kategorieName.get(grundlinie.kategorieId) ?? grundlinie.kategorieId,
                })}
              />
            )}
            {/* Die zweite Linie: was eine Nachschlagetabelle „Empfänger → übliche
                Kategorie" träfe, ganz ohne Modell. Jedes Modell schlägt blindes Raten;
                an dieser Linie muss es sich messen lassen. */}
            {protokoll?.empfaenger && stand.genauigkeit !== undefined && (
              <KPIStat
                size="tile"
                label={t("einstellungen.lernmaterial.empfaengerLinie")}
                value={prozent(protokoll.empfaenger.genauigkeit)}
                meta={t("einstellungen.lernmaterial.empfaengerLinieMeta", {
                  abdeckung: prozent(protokoll.empfaenger.abdeckung),
                })}
              />
            )}
            {grundlinie && stand.genauigkeit !== undefined && (() => {
              // Der Vorsprung zählt gegen die STÄRKERE der beiden Linien — gegen die
              // schwächere gemessen, sähe jedes Modell gut aus.
              const linie = Math.max(grundlinie.genauigkeit, protokoll?.empfaenger?.genauigkeit ?? 0);
              return (
                <KPIStat
                  size="tile"
                  label={t("einstellungen.lernmaterial.vorsprung")}
                  value={prozent(stand.genauigkeit - linie)}
                  meta={t("einstellungen.lernmaterial.vorsprungMeta")}
                  // Unter der Linie ist das Modell schlechter als eine Nachschlagetabelle.
                  // Das passiert und ist die wichtigste Meldung, die es geben kann.
                  tone={stand.genauigkeit <= linie ? "warn" : "ok"}
                />
              );
            })()}
            {protokoll?.kennzahlen.macroF1 != null && (
              <KPIStat
                size="tile"
                label={t("einstellungen.lernmaterial.macroF1")}
                value={prozent(protokoll.kennzahlen.macroF1)}
                meta={t("einstellungen.lernmaterial.macroF1Meta")}
              />
            )}
          </div>
          <div className="muted" style={{ marginTop: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.trainiertAm", {
              datum: new Date(stand.trainiertAm).toLocaleString(locale),
              beispiele: zahl(stand.modell.beispiele),
            })}
            {daten.zustand.zuwachs !== 0 && (
              <>
                {" "}
                {zustandsText(t, daten.zustand.zuwachs, zahl)}
                {daten.zustand.veraltet && ` ${t("einstellungen.lernmaterial.veraltet")}`}
              </>
            )}
          </div>
        </>
      )}

      {protokoll && (
        <div className="muted" style={{ marginTop: "var(--sp-2)" }}>
          {t(
            protokoll.pruefmenge === "handverlesen"
              ? "einstellungen.lernmaterial.protokollHandverlesen"
              : "einstellungen.lernmaterial.protokollAlle",
            {
              pruefung: zahl(protokoll.pruefAnzahl),
              training: zahl(protokoll.trainingAnzahl),
              stichtag: protokoll.stichtag ? new Date(protokoll.stichtag).toLocaleDateString(locale) : "—",
            },
          )}
        </div>
      )}

      {vergleich && (
        <Abschnitt titel={t("einstellungen.lernmaterial.vergleichTitel")}>
          <LaufvergleichAnsicht t={t} vergleich={vergleich} kategorieName={kategorieName} zahl={zahl} locale={locale} />
        </Abschnitt>
      )}

      {protokoll && (
        <Abschnitt titel={t("einstellungen.lernmaterial.klassenTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.klassenHinweis")}
          </div>
          <DataTable
            sortable
            pageSize={15}
            columns={[
              {
                key: "kategorieId",
                label: t("einstellungen.lernmaterial.spalteKategorie"),
                render: (r) => kategorieName.get(r.kategorieId) ?? r.kategorieId,
              },
              { key: "anzahl", label: t("einstellungen.lernmaterial.spalteAnzahl"), align: "right", render: (r) => zahl(r.anzahl) },
              {
                key: "precision", label: t("einstellungen.lernmaterial.spaltePrecision"), align: "right",
                sortValue: (r) => r.precision ?? -1,
                render: (r) => (r.precision === null ? "—" : prozent(r.precision)),
              },
              {
                key: "recall", label: t("einstellungen.lernmaterial.spalteRecall"), align: "right",
                sortValue: (r) => r.recall ?? -1,
                render: (r) => (r.recall === null ? "—" : prozent(r.recall)),
              },
              {
                key: "f1", label: "F1", align: "right",
                sortValue: (r) => r.f1 ?? -1,
                render: (r) => (r.f1 === null ? "—" : prozent(r.f1)),
              },
            ]}
            rows={protokoll.kennzahlen.jeKategorie.map((k) => ({ ...k, id: k.kategorieId }))}
          />
        </Abschnitt>
      )}

      {protokoll?.kalibrierung && (
        <Abschnitt titel={t("einstellungen.lernmaterial.kalibrierungTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.kalibrierungHinweis", {
              ece: prozent(protokoll.kalibrierung.ece),
            })}
          </div>
          <DataTable
            columns={[
              {
                key: "schwelle", label: t("einstellungen.lernmaterial.spalteSchwelle"),
                render: (r) => t("einstellungen.lernmaterial.abSicherheit", { wert: prozent(r.schwelle) }),
              },
              { key: "abdeckung", label: t("einstellungen.lernmaterial.spalteAbdeckung"), align: "right", render: (r) => prozent(r.abdeckung) },
              {
                key: "genauigkeit", label: t("einstellungen.lernmaterial.spalteTrefferDarin"), align: "right",
                render: (r) => (r.genauigkeit === null ? "—" : prozent(r.genauigkeit)),
              },
            ]}
            rows={protokoll.kalibrierung.schwellen.map((x) => ({ ...x, id: String(x.schwelle) }))}
          />
        </Abschnitt>
      )}

      {bewertung && (
        <Abschnitt titel={t("einstellungen.lernmaterial.matrixTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {matrix.kategorien.length === 0
              ? t("einstellungen.lernmaterial.matrixFehlerfrei")
              : t("einstellungen.lernmaterial.matrixHinweis")}
          </div>
          {matrix.kategorien.length > 0 && (
            <>
              <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                {t("einstellungen.lernmaterial.matrixLegende", {
                  fehler: zahl(bewertung.gesamt - bewertung.richtig),
                  zellen: zahl(bewertung.verwechslungen.length),
                  kategorien: zahl(matrix.kategorien.length),
                })}
              </div>
              <Matrix
                matrix={matrix}
                beschriftung={(id) => kategorieName.get(id) ?? id}
                kopf={t("einstellungen.lernmaterial.matrixSpalteIst")}
              />
              <Abschnitt titel={t("einstellungen.lernmaterial.paareTitel")}>
                <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                  {t("einstellungen.lernmaterial.paareHinweis")}
                </div>
                {/* Der Klick auf ein Paar öffnet die einzelnen Zeilen dahinter.
                    Die Zahl allein sagt, WO es klemmt; erst die Zeilen sagen, WARUM:
                    steht dort ein Empfänger, der für beide Kategorien vorkommt, fehlt
                    ein Merkmal — steht dort nichts Unterscheidendes, sind die beiden
                    Kategorien fachlich nicht zu trennen. Zwei völlig verschiedene
                    Antworten, und die Statistik gibt keine davon her. */}
                <DataTable
                  columns={[
                    {
                      key: "tatsaechlich",
                      label: t("einstellungen.lernmaterial.spaltePaar"),
                      render: (r) =>
                        `${kategorieName.get(r.tatsaechlich) ?? r.tatsaechlich} → ${kategorieName.get(r.vorhergesagt) ?? r.vorhergesagt}`,
                    },
                    {
                      key: "anzahl",
                      label: t("einstellungen.lernmaterial.spalteAnzahl"),
                      align: "right",
                      render: (r) => zahl(r.anzahl),
                    },
                  ]}
                  rows={bewertung.verwechslungen.slice(0, 15).map((v) => ({ ...v }))}
                  onRowClick={(r) =>
                    setOffenesPaar((cur) =>
                      cur?.tatsaechlich === r.tatsaechlich && cur?.vorhergesagt === r.vorhergesagt
                        ? null
                        : { tatsaechlich: r.tatsaechlich, vorhergesagt: r.vorhergesagt },
                    )
                  }
                  istAktiv={(r) =>
                    offenesPaar?.tatsaechlich === r.tatsaechlich &&
                    offenesPaar?.vorhergesagt === r.vorhergesagt
                  }
                />
                {offenesPaar && (
                  <Fehlgriffe
                    t={t}
                    treffer={bewertung.fehltreffer.filter(
                      (f) =>
                        f.tatsaechlich === offenesPaar.tatsaechlich &&
                        f.vorhergesagt === offenesPaar.vorhergesagt,
                    )}
                    kategorieName={kategorieName}
                    verteilung={(m) => verteilungNachMerkmal.get(m)}
                  />
                )}
              </Abschnitt>
            </>
          )}
        </Abschnitt>
      )}

      {daten.laeufe.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.laeufeTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.laeufeHinweis")}
          </div>
          <DataTable
            columns={[
              {
                key: "zeitpunkt", label: t("einstellungen.lernmaterial.spalteZeitpunkt"),
                render: (r) => new Date(r.zeitpunkt).toLocaleString(locale),
              },
              { key: "beispiele", label: t("einstellungen.lernmaterial.spalteBeispiele"), align: "right", render: (r) => zahl(r.beispiele) },
              {
                key: "genauigkeit", label: t("einstellungen.lernmaterial.genauigkeit"), align: "right",
                render: (r) => (r.kennzahlen ? prozent(r.kennzahlen.genauigkeit) : "—"),
              },
              {
                key: "empfaenger", label: t("einstellungen.lernmaterial.empfaengerLinie"), align: "right",
                render: (r) => (r.kennzahlen?.empfaenger !== undefined ? prozent(r.kennzahlen.empfaenger) : "—"),
              },
              {
                key: "macroF1", label: t("einstellungen.lernmaterial.macroF1"), align: "right",
                render: (r) => (r.kennzahlen?.macroF1 !== undefined ? prozent(r.kennzahlen.macroF1) : "—"),
              },
              {
                key: "pruefmenge", label: t("einstellungen.lernmaterial.spaltePruefmenge"),
                render: (r) =>
                  r.kennzahlen
                    ? t(`einstellungen.lernmaterial.pruefmenge.${r.kennzahlen.pruefmenge}`, { anzahl: zahl(r.kennzahlen.pruefAnzahl) })
                    : "—",
              },
            ]}
            rows={daten.laeufe.map((l) => ({ ...l }))}
          />
        </Abschnitt>
      )}
    </>
  );
}

// ------------------------------------------------------------------------ Bausteine

/**
 * Die einzelnen Zeilen hinter einem Verwechslungspaar — je Zeile die Erklärung, warum
 * die falsche Kategorie gewann und nicht die richtige.
 *
 * NEBEN der Tabelle und nicht in einer eigenen Karte: es ist das Aufklappen einer Zeile,
 * kein zweiter Gegenstand (siehe `ui/CLAUDE.md`, „keine Karte IN einer Karte").
 *
 * Bis 2026-11-09 standen hier als Pillen die Merkmale, die für die FALSCHE Kategorie
 * sprachen. Das beantwortete die Frage nicht: ein Wort kann für die falsche stark sprechen
 * und für die richtige noch stärker. Die Tafel rechnet deshalb gegen die richtige
 * Kategorie (`erklaerung.ts`), und die Spalte „im Bestand" sagt, woher ein Wort sein
 * Gewicht hat — dort sieht man, ob ein Merkmal fehlt oder die Labels selbst uneins sind.
 * Der ganze Vektor steht darunter in Grau, für den Fall, dass die Antwort das FEHLEN
 * eines Merkmals ist.
 */
function Fehlgriffe({
  t,
  treffer,
  kategorieName,
  verteilung,
}: {
  t: Hilfe["t"];
  treffer: readonly Fehltreffer[];
  kategorieName: ReadonlyMap<string, string>;
  verteilung: (merkmal: string) => readonly { kategorieId: string; anzahl: number }[] | undefined;
}) {
  if (treffer.length === 0) {
    return <div className="muted" style={{ marginTop: "var(--sp-3)" }}>{t("einstellungen.lernmaterial.fehlgriffeLeer")}</div>;
  }
  return (
    <div style={{ marginTop: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      <div className="muted">{t("einstellungen.lernmaterial.fehlgriffeHinweis")}</div>
      {treffer.map((f, i) => (
        <div
          key={f.id ?? i}
          style={{ borderLeft: "2px solid var(--line)", paddingLeft: "var(--sp-3)", display: "grid", gap: "var(--sp-2)" }}
        >
          <ErklaerungsTafel
            erklaerung={f.erklaerung}
            kategorieName={(id) => kategorieName.get(id) ?? id}
            verteilung={verteilung}
          />
          <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
            {f.merkmale.map(wortVon).join(" · ")}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Was sich gegenüber dem vorigen Lauf geändert hat — an der Konfiguration und an den
 * Zeilen. Eine Trefferquote, die gleich bleibt, kann zehn Zeilen gewonnen und zehn
 * verloren haben; erst die Zeilen sagen, ob eine Änderung an den Wörtern das Richtige
 * getroffen hat.
 */
function LaufvergleichAnsicht({
  t,
  vergleich,
  kategorieName,
  zahl,
  locale,
}: {
  t: Hilfe["t"];
  vergleich: Laufvergleichsicht;
  kategorieName: ReadonlyMap<string, string>;
  zahl: (n: number) => string;
  locale: string;
}) {
  const name = (id: string) => kategorieName.get(id) ?? id;
  const aenderungen = [
    ...vergleich.herkuenfteDazu.map((h) => t("einstellungen.lernmaterial.vergleichQuelleDazu", { quelle: t(`einstellungen.lernmaterial.herkunft.${h}`) })),
    ...vergleich.herkuenfteWeg.map((h) => t("einstellungen.lernmaterial.vergleichQuelleWeg", { quelle: t(`einstellungen.lernmaterial.herkunft.${h}`) })),
    ...(vergleich.ausgeschlossenDazu.length
      ? [t("einstellungen.lernmaterial.vergleichAusgeschlossen", { woerter: vergleich.ausgeschlossenDazu.join(", ") })]
      : []),
    ...(vergleich.ausgeschlossenWeg.length
      ? [t("einstellungen.lernmaterial.vergleichZugelassen", { woerter: vergleich.ausgeschlossenWeg.join(", ") })]
      : []),
  ];
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <div>
        {t("einstellungen.lernmaterial.vergleichSumme", {
          datum: new Date(vergleich.vorherAm).toLocaleString(locale),
          gemeinsam: zahl(vergleich.gemeinsam),
          gewonnen: zahl(vergleich.gewonnen),
          verloren: zahl(vergleich.verloren),
        })}
      </div>
      <div className="muted">
        {aenderungen.length ? aenderungen.join(" · ") : t("einstellungen.lernmaterial.vergleichKonfigGleich")}
      </div>
      {vergleich.gekippt.slice(0, 25).map((g) => (
        <div key={g.id} style={{ borderLeft: `2px solid ${g.gewonnen ? "var(--ok-deep)" : "var(--warn-deep)"}`, paddingLeft: "var(--sp-3)" }}>
          <div>
            {t(g.gewonnen ? "einstellungen.lernmaterial.vergleichGewonnen" : "einstellungen.lernmaterial.vergleichVerloren", {
              richtig: name(g.tatsaechlich),
              vorher: name(g.vorher),
              nachher: name(g.nachher),
            })}
          </div>
          <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{g.merkmale.map(wortVon).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Die Verwechslungsmatrix als Tabelle: Zeile = tatsächliche Kategorie, Spalte = was die
 * Erkennung daraus gemacht hat.
 *
 * Eine eigene Tabelle statt `DataTable`, weil hier die Spalten aus den Daten entstehen
 * und die Diagonale eine eigene Bedeutung hat. Sie scrollt in ihrem eigenen Kasten —
 * bei ein paar Dutzend beteiligten Kategorien ist sie breiter als jedes Fenster, und die
 * Seite selbst darf davon nicht seitwärts wandern.
 *
 * Leere Zellen bleiben leer statt eine Null zu zeigen: bei einer Matrix fast nur aus Nullen
 * wäre das ein Feld aus Ziffern, in dem die wenigen echten Zahlen untergehen.
 */
function Matrix({
  matrix,
  beschriftung,
  kopf,
}: {
  matrix: { kategorien: string[]; zeilen: Matrixzeile[] };
  beschriftung: (id: string) => string;
  kopf: string;
}) {
  const zelle = {
    padding: "var(--sp-1) var(--sp-2)",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid var(--line)",
  };
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
        <thead>
          <tr>
            <th style={{ ...zelle, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)" }}>
              {kopf}
            </th>
            {matrix.kategorien.map((id) => (
              // Schräg gestellt: waagerecht bräuchte jede Spalte die Breite eines
              // Kategorienamens, und die Matrix wäre um ein Vielfaches breiter als hoch.
              <th key={id} style={{ ...zelle, height: 120, verticalAlign: "bottom", padding: 0 }}>
                <div
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    whiteSpace: "nowrap",
                    padding: "var(--sp-2) var(--sp-1)",
                    fontWeight: "var(--fw-bold)",
                  }}
                >
                  {beschriftung(id)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.zeilen.map((z) => (
            <tr key={z.kategorieId}>
              <th
                style={{
                  ...zelle, textAlign: "left", whiteSpace: "nowrap",
                  position: "sticky", left: 0, background: "var(--surface)",
                  fontWeight: "var(--fw-bold)",
                }}
              >
                {beschriftung(z.kategorieId)}
              </th>
              {matrix.kategorien.map((spalte) => {
                const n = z.zellen.get(spalte);
                const diagonale = spalte === z.kategorieId;
                return (
                  <td
                    key={spalte}
                    style={{
                      ...zelle,
                      color: n ? (diagonale ? "var(--ok-deep)" : "var(--warn-deep)") : "var(--ink-3)",
                      fontWeight: n && !diagonale ? "var(--fw-bold)" : "var(--fw-regular)",
                      background: diagonale ? "var(--surface-2)" : undefined,
                    }}
                    title={`${beschriftung(z.kategorieId)} → ${beschriftung(spalte)}`}
                  >
                    {n ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
