// Die Kostensicht des Verlaufs — „Was hat der Monat gekostet?".
//
// Die zweite FRAGE an dieselben Monate. Die Ausgabensicht daneben zeigt, wann Geld vom
// Konto ging; hier steht, was der Monat gekostet hat: der Jahresbeitrag mit einem
// Zwölftel, die Rücklage mit ihrer Rate, auch wenn nichts überwiesen wurde
// (`core/CLAUDE.md`, „Auszahlung und Kosten"). Es ist dieselbe Rechnung wie in den
// Monatskarten der Übersicht, nur rückwärts über den Zeitraum.
//
// Gerechnet wird nichts: `analyseKostenverlauf` liefert Monate und Kennzahlen fertig.
//
// DREI TEXTE stehen unter den Zahlen, und alle drei sind EINSCHRÄNKUNGEN — sie ändern,
// was die Zahl daneben bedeutet, und stehen deshalb offen da und nie hinter einem Deckel
// (`ui/CLAUDE.md`, „Drei Ränge für jeden Text neben einer Zahl"):
//
//   • der laufende Monat ist ein Zwischenstand und zählt in keine Kennzahl;
//   • Monaten vor dem Ausbuchen einer Rücklage fehlt deren Rate;
//   • (an der Quote selbst) ohne Einnahmen gibt es keine.
//
// Die ersten beiden erscheinen nur, wenn sie zutreffen. Ein Vorbehalt, der immer dasteht,
// wird nach zwei Wochen überlesen — und dann auch in dem Monat, in dem er gilt.

import { useTranslation } from "react-i18next";
import { KOSTENZEILEN, type KostenMonat, type Kostenverlauf } from "../../../application";
import { DataTable, KPIStat, Pill } from "../bausteine";
import { useGeld, useProzent } from "../bausteine/einstellungenKontext";
import { geldFarbe, geldTon } from "../bausteine/geldFarbe";
import { Umschalter } from "../bausteine/Umschalter";
import { KostenStapelChart } from "./KostenStapelChart";

export type KostenAnsicht = "diagramm" | "tabelle";

export function KostenVerlauf({
  verlauf,
  ansicht,
  aufAnsicht,
}: {
  verlauf: Kostenverlauf;
  ansicht: KostenAnsicht;
  aufAnsicht: (a: KostenAnsicht) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const prozent = useProzent();
  const k = verlauf.kennzahlen;
  const hatLaufenden = verlauf.monate.some((m) => m.laufend);

  const betrag = (wert: number) => (wert ? geld.format(wert) : "—");
  const quote = (wert: number | null) => (wert == null ? "—" : prozent(wert));

  return (
    <>
      <div className="kpis" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
        {/* Kosten sind eine Höhe, keine Richtung — sie stehen positiv da und bleiben
            neutral. Amber hiesse „sieh hin", und dass ein Monat etwas kostet, ist kein
            Befund. */}
        <KPIStat size="chip" label={t("historie.kosten.kpiKosten")} value={k.monate ? geld.format(k.kostenJeMonat) : "—"} unit={k.monate ? geld.symbol : undefined} />
        {/* Quoten sind ungerichtete Grössen: nie grün. Eine Schwelle, ab der sie amber
            würden, gibt es bewusst nicht — welche Fixkostenquote „zu hoch" ist, hängt am
            Haushalt, und eine erfundene Grenze wäre eine Bewertung ohne Grundlage. */}
        <KPIStat size="chip" label={t("historie.kosten.kpiFixkostenquote")} value={quote(k.fixkostenquote)} meta={t("historie.kosten.metaFixkostenquote")} />
        <KPIStat size="chip" label={t("historie.kosten.kpiSparquote")} value={quote(k.sparquote)} meta={t("historie.kosten.metaSparquote")} />
        {/* Das Ergebnis ist gerichtetes Geld: die Farbe kommt aus dem Vorzeichen. */}
        <KPIStat size="chip" label={t("historie.kosten.kpiErgebnis")} value={k.monate ? geld.format(k.ergebnisJeMonat, { mitVorzeichen: true }) : "—"} unit={k.monate ? geld.symbol : undefined} tone={geldTon(k.ergebnisJeMonat)} />
      </div>

      <Umschalter
        label={t("historie.ansichtWahl")}
        optionen={(["diagramm", "tabelle"] as const).map((a) => ({ wert: a, text: t(`historie.kosten.ansicht.${a}`) }))}
        wert={ansicht}
        aufAendern={aufAnsicht}
        style={{ marginBottom: "var(--sp-3)" }}
      />

      {verlauf.monate.length > 0 && ansicht === "diagramm" && <KostenStapelChart monate={verlauf.monate} />}

      {verlauf.monate.length > 0 && ansicht === "tabelle" && (
        <DataTable<KostenMonat>
          sortable
          pageSize={24}
          // Der laufende Monat steht gedämpft: dieselbe Zurücknahme wie im Diagramm.
          rowStyle={(m) => (m.laufend ? { opacity: 0.6 } : undefined)}
          columns={[
            {
              key: "monat",
              label: t("historie.spalteMonat"),
              schmal: "titel",
              sortValue: (m) => m.monat,
              render: (m) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {m.monat}
                  {m.laufend && <Pill variant="neutral">{t("ergebnis.pillLaufend")}</Pill>}
                  {m.ruecklagenUnvollstaendig && <Pill variant="neutral">{t("historie.kosten.pillUnvollstaendig")}</Pill>}
                </span>
              ),
            },
            { key: "einnahmen", label: `${t("ergebnis.zeile.einnahmen")} ${geld.symbol}`, align: "right", sortValue: (m) => m.einnahmen, render: (m) => betrag(m.einnahmen) },
            // Die sechs Kostenarten, positiv wie im Diagramm. Schmal fallen sie weg: neun
            // Zahlen in einer zweiten Zeile ohne Beschriftung wären keine Auskunft, und
            // die Zerlegung steht im Diagramm.
            ...KOSTENZEILEN.map((art) => ({
              key: art,
              label: `${t(`ergebnis.zeile.${art}`)} ${geld.symbol}`,
              align: "right" as const,
              sortValue: (m: KostenMonat) => m.kosten[art],
              render: (m: KostenMonat) => betrag(m.kosten[art]),
            })),
            {
              key: "ergebnis",
              label: `${t("ergebnis.stufe.ergebnis")} ${geld.symbol}`,
              align: "right",
              schmal: "wert",
              sortValue: (m) => m.ergebnis,
              render: (m) => <span style={{ color: geldFarbe(m.ergebnis), fontWeight: "var(--fw-bold)" }}>{geld.format(m.ergebnis, { mitVorzeichen: true })}</span>,
            },
          ]}
          rows={[...verlauf.monate].reverse()}
        />
      )}

      {hatLaufenden && (
        <p className="hinweis" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>{t("historie.kosten.hinweisLaufend")}</p>
      )}
      {verlauf.ruecklagenUnvollstaendig && (
        <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("historie.kosten.hinweisRuecklagen")}</p>
      )}
    </>
  );
}
