// MonatsFlussChart — divergierende Balken je Monat: Einnahmen nach oben (grün),
// Ausgaben nach unten (Ink). Macht die monatlichen Abflüsse sichtbar (inkl.
// Quartals-Ausschläge und Budget-Anteil), die die kumulierte Saldo-Kurve verschluckt.

import { useTranslation } from "react-i18next";
import { useGeld } from "./EinstellungenProvider";

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
}

export function MonatsFlussChart({ labels, einnahmen, ausgaben, width = 1000, height = 240, onMonatClick, aktivIndex }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  const padL = 52;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const n = labels.length;
  const max = Math.max(1, ...einnahmen, ...ausgaben);

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const mid = padT + innerH / 2;
  const slot = n > 0 ? innerW / n : innerW;
  const bw = Math.min(18, slot * 0.36);
  const h = (v: number) => (v / max) * (innerH / 2);

  const gitter = [max, max / 2, 0, -max / 2, -max].map((v) => ({ v, y: mid - h(v) }));
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
              {aktivIndex === i && (
                <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="var(--accent)" opacity="0.1" />
              )}
              <rect x={cx - bw - 1} y={mid - ein} width={bw} height={ein} rx="2" fill="var(--ok)" />
              <rect x={cx + 1} y={mid} width={bw} height={aus} rx="2" fill="var(--ink)" opacity="0.78" />
              {/* transparenter, voll-hoher Slot für leichtes Klicken */}
              {klickbar && <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />}
              {i % Math.ceil(n / 12) === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{m}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ok)", verticalAlign: "middle", marginRight: 6 }} />{t("charts.einnahmen")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ink)", opacity: 0.78, verticalAlign: "middle", marginRight: 6 }} />{t("charts.ausgabenInklBudgets")}</span>
      </div>
    </div>
  );
}
