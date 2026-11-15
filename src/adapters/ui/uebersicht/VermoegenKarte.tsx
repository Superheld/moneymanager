// Das Vermögen je Kontoklasse — was da ist, was davon gebunden ist, was frei bleibt.
//
// Sie steht UNTER den Monatskarten, und das ist eine Aussage über beide: die Karten
// beantworten „was kostet dieser Monat", diese Liste „was ist insgesamt da, und wem
// gehört es schon". Zwei Fragen, zwei Orte.
//
// **Gebunden und frei stehen seit 2026-11-15 hier.** Die Rechnung dahinter
// (`core/konten/kontobelegung`) gab es schon, zu sehen war sie nur im Kontoauszug, je
// Konto und nur für das gewählte. Die Frage „wo ist das Geld, und wie viel davon kann
// ich anfassen" stellt man aber dem ganzen Vermögen. Ein Stand ohne diese Aufteilung
// liest sich als verfügbar, auch wenn er zur Hälfte einer Rücklage gehört.
//
// Ihr Nachbar ist die Depotkarte: beide zeigen einen STAND zum Stichtag, beide gehen in
// keine Monatsrechnung ein.
//
// Nach KLASSE: sie ist die Rechenregel, jedes Konto hat genau eine, die Summen addieren
// sich zum Ganzen.

import { useTranslation } from "react-i18next";
import type { Klassenbilanz } from "../../../application";
import { Card, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { warnFarbe } from "../bausteine/geldFarbe";
import { Stapel } from "../bausteine/Anordnung";

export function VermoegenKarte({
  klassen,
  namen,
}: {
  klassen: readonly Klassenbilanz[];
  /** Anspruchs-ID → Name der Rücklage bzw. der Budget-Kategorie. */
  namen: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (klassen.length === 0) return null;

  const summe = (wert: (k: Klassenbilanz) => number) => klassen.reduce((s, k) => s + wert(k), 0);
  const gebundenGesamt = summe((k) => k.gebunden);
  const zeile = { display: "flex", justifyContent: "space-between", gap: "var(--sp-3)" } as const;
  const unterzeile = { ...zeile, paddingLeft: "var(--sp-4)", fontSize: "var(--fs-ui)" } as const;

  return (
    <Card title={t("uebersicht.vermoegenTitel")} subtitle={t("uebersicht.vermoegenUntertitel")}>
      <Stapel abstand={2}>
        {klassen.map((k) => (
          <div key={k.klasse}>
            <div style={zeile}>
              <span>
                {t(`einstellungen.konto.klasse.${k.klasse}`)}{" "}
                <span className="muted">· {t("uebersicht.vermoegenKonten", { count: k.kontenAnzahl })}</span>
              </span>
              <span className="num">{geld.formatMitSymbol(k.stand)}</span>
            </div>
            {/* Die Aufteilung nur, wo etwas gebunden ist: „gebunden 0, frei alles" sagte
                nur, was die Zeile darüber schon sagt. */}
            {k.posten.length > 0 && (
              <div className="muted" style={{ marginTop: 2 }}>
                {k.posten.map((p) => (
                  <div key={`${p.art}:${p.id}`} style={unterzeile}>
                    <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center" }}>
                      {namen.get(p.id) ?? p.id}
                      <Pill variant="neutral">{t(`konten.belegung.art.${p.art}`)}</Pill>
                    </span>
                    <span className="num">{geld.format(p.betrag)}</span>
                  </div>
                ))}
                <div style={unterzeile}>
                  <span>{t("uebersicht.vermoegenFrei")}</span>
                  <span className="num">{geld.format(k.frei)}</span>
                </div>
                {/* Eine EINSCHRÄNKUNG: die Ansprüche darüber sind nicht voll gedeckt.
                    Deshalb offen und in Worten, nicht als negative Zahl in einer Spalte. */}
                {k.fehlt > 0 && (
                  <div style={{ ...unterzeile, color: warnFarbe(true) }}>
                    {t("uebersicht.vermoegenFehlt", { betrag: geld.formatMitSymbol(k.fehlt) })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {/* Die Summe steht dabei und nicht darüber: sie ist das Ergebnis der Zeilen, und
            eine Zahl über einer Liste liest sich als deren Überschrift. */}
        {klassen.length > 1 && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--sp-2)" }}>
            <div style={{ ...zeile, fontWeight: "var(--fw-bold)" }}>
              <span>{t("uebersicht.vermoegenGesamt")}</span>
              <span className="num">{geld.formatMitSymbol(summe((k) => k.stand))}</span>
            </div>
            {gebundenGesamt > 0 && (
              <div className="muted">
                <div style={unterzeile}>
                  <span>{t("uebersicht.vermoegenGebunden")}</span>
                  <span className="num">{geld.format(gebundenGesamt)}</span>
                </div>
                <div style={unterzeile}>
                  <span>{t("uebersicht.vermoegenFrei")}</span>
                  <span className="num">{geld.format(summe((k) => k.frei))}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Stapel>
    </Card>
  );
}
