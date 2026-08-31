// Das Vermögen in drei Perspektiven — liquide, Rücklage, Vorsorge.
//
// Sie steht UNTER den Monatskarten, und das ist eine Aussage über beide: die Karten
// beantworten „wie geht dieser Monat aus" und rechnen deshalb nur über die liquiden
// Konten; diese Liste beantwortet „was ist insgesamt da". Zwei Fragen, zwei Orte —
// zusammengelegt wäre keine von beiden mehr sauber zu beantworten.
//
// Nach KLASSE und nicht nach Gruppe: die Klasse ist die Rechenregel (jedes Konto hat
// genau eine, die Summen addieren sich zum Ganzen), die Gruppe ist eine frei
// zusammengestellte Sicht, in der dasselbe Konto mehrfach liegen darf. Über Gruppen
// summiert ergäbe „das Vermögen" mehr, als vorhanden ist. Was man mit Gruppen ansehen
// will, gehört in die Analyse — dort geht es um Zeiträume und Perspektiven, hier um den
// Stand.

import { useTranslation } from "react-i18next";
import type { Klassenstand } from "../../../application";
import { Card } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";

export function VermoegenKarte({ klassen }: { klassen: readonly Klassenstand[] }) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (klassen.length === 0) return null;

  const gesamt = klassen.reduce((s, k) => s + k.stand, 0);

  return (
    <Card title={t("uebersicht.vermoegenTitel")} subtitle={t("uebersicht.vermoegenUntertitel")}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        {klassen.map((k) => (
          <div key={k.klasse} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)" }}>
            <span>
              {t(`einstellungen.konto.klasse.${k.klasse}`)}{" "}
              <span className="muted">· {t("uebersicht.vermoegenKonten", { count: k.konten.length })}</span>
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {geld.format(k.stand)} {geld.symbol}
            </span>
          </div>
        ))}
        {/* Die Summe steht dabei und nicht darüber: sie ist das Ergebnis der Zeilen, und
            eine Zahl über einer Liste liest sich als deren Überschrift. */}
        {klassen.length > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--sp-3)",
              borderTop: "1px solid var(--line)",
              paddingTop: "var(--sp-2)",
              fontWeight: "var(--fw-bold)",
            }}
          >
            <span>{t("uebersicht.vermoegenGesamt")}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {geld.format(gesamt)} {geld.symbol}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
