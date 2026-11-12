// MonatsFlussChart — je Monat zwei Balken nebeneinander: Einnahmen (grün) und Ausgaben
// (Ink). Macht die monatlichen Abflüsse sichtbar (inkl. Quartals-Ausschläge und
// Budget-Anteil), die die kumulierte Saldo-Kurve verschluckt.
//
// BEIDE Balken stehen auf derselben Grundlinie und wachsen nach oben, obwohl Ausgaben
// fachlich negativ sind. Divergierende Balken (Einnahmen hoch, Ausgaben runter) zwingen
// beim Vergleichen zum Spiegeln im Kopf; nebeneinander liest man direkt ab, welcher
// Balken höher ist. Das Vorzeichen trägt die Farbe und die Legende, nicht die Richtung.

import { useTranslation } from "react-i18next";
import { useGeld } from "../bausteine/einstellungenKontext";
import { flussFarbe } from "../bausteine/geldFarbe";

interface Props {
  labels: string[];
  einnahmen: number[]; // Minor Units (Cent), positiv
  ausgaben: number[]; // Minor Units (Cent), positiver Betrag
  width?: number;
  height?: number;
  /** Optional: Klick auf einen Monat (Index). Macht die Balken/Slots anklickbar. */
  onMonatClick?: (index: number) => void;
  /** Optional: hervorgehobener Monat (Index). */
  aktivIndex?: number | null;
  /**
   * Ab diesem Index sind die Balken GEPLANT und stehen blass da — dieselbe Unterscheidung
   * wie die Strichelung der Saldo-Linie darüber, nur für Flächen (seit 2026-11-11, für den
   * Blick nach vorn). Die Beschriftung dazu kommt mit `legendePlan`.
   */
  planAb?: number;
  legendePlan?: string;
}

export function MonatsFlussChart({ labels, einnahmen, ausgaben, width = 1000, height = 240, onMonatClick, aktivIndex, planAb, legendePlan }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Derselbe linke Rand wie `SaldoVerlaufChart`: stehen beide untereinander (Blick nach
  // vorn), fluchten die Monate nur mit gleichem Rand.
  const padL = 56;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const n = labels.length;
  const max = Math.max(1, ...einnahmen, ...ausgaben);

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  /** Grundlinie: unten, gemeinsam für Einnahmen und Ausgaben. */
  const basis = padT + innerH;
  const slot = n > 0 ? innerW / n : innerW;
  const bw = Math.min(18, slot * 0.36);
  const h = (v: number) => (v / max) * innerH;

  const gitter = [max, (max * 3) / 4, max / 2, max / 4, 0].map((v) => ({ v, y: basis - h(v) }));
  // Achsenbeträge sind Minor Units (Cent) → direkt über geld.format lokalisieren.
  const fmtAchse = (v: number) => geld.format(Math.round(Math.abs(v)));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }}>
        {gitter.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke={g.v === 0 ? "var(--ink-3)" : "var(--line)"} strokeWidth={g.v === 0 ? 1.2 : 1} />
            <text x={padL - 8} y={g.y + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{fmtAchse(g.v)}</text>
          </g>
        ))}
        {labels.map((m, i) => {
          const cx = padL + slot * i + slot / 2;
          const ein = h(einnahmen[i] ?? 0);
          const aus = h(ausgaben[i] ?? 0);
          const klickbar = !!onMonatClick;
          return (
            <g key={i} onClick={klickbar ? () => onMonatClick!(i) : undefined} style={klickbar ? { cursor: "pointer" } : undefined}>
              <title>{t("charts.tooltipFluss", { monat: m, ein: geld.formatMitSymbol(einnahmen[i] ?? 0), aus: geld.formatMitSymbol(ausgaben[i] ?? 0) })}</title>
              {aktivIndex === i && (
                <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="var(--accent)" opacity="0.1" />
              )}
              {/* Zufluss und Abfluss, beide als Höhe gezeichnet — die Richtung steckt
                  darin, WELCHER Balken es ist. Also dieselbe Aussage wie bei der Zahl
                  daneben, in den Flächentönen (`bausteine/geldFarbe`, Regel 3). Der
                  Abfluss war hier `--ink` und in der Tabelle darunter amber: derselbe
                  Euro in zwei Farben, je nachdem wo man hinsah. */}
              <rect x={cx - bw - 1} y={basis - ein} width={bw} height={ein} rx="2" fill={flussFarbe(1)} opacity={planAb != null && i >= planAb ? 0.45 : 1} />
              <rect x={cx + 1} y={basis - aus} width={bw} height={aus} rx="2" fill={flussFarbe(-1)} opacity={planAb != null && i >= planAb ? 0.45 : 1} />
              {/* transparenter, voll-hoher Slot — für leichtes Klicken und damit der Titel
                  auch über der Lücke zwischen den Balken erscheint */}
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {i % Math.ceil(n / 12) === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{m}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: flussFarbe(1), verticalAlign: "middle", marginRight: 6 }} />{t("charts.einnahmen")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: flussFarbe(-1), verticalAlign: "middle", marginRight: 6 }} />{t("charts.ausgabenInklBudgets")}</span>
        {planAb != null && legendePlan && (
          <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: flussFarbe(-1), opacity: 0.45, verticalAlign: "middle", marginRight: 6 }} />{legendePlan}</span>
        )}
      </div>
    </div>
  );
}
