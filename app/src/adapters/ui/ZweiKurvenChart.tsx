// Zwei-Kurven-Chart (app-spezifisch, im Design-System-Stil): Kontosaldo (Ink, solide)
// und freie Liquidität (Teal). Nulllinie betont, weil die freie Liquidität ins Minus
// gehen darf. Dünne Linien, Grid in --line, Labels in --ink-3 (Chart-Guidance).

import { useTranslation } from "react-i18next";
import { useGeld } from "./EinstellungenProvider";

interface Props {
  labels: string[];
  kontosaldo: number[]; // Minor Units (Cent)
  freieLiquiditaet: number[]; // Minor Units (Cent)
  width?: number;
  height?: number;
}

export function ZweiKurvenChart({ labels, kontosaldo, freieLiquiditaet, width = 1000, height = 300 }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const n = labels.length;

  const alle = [...kontosaldo, ...freieLiquiditaet, 0];
  const max = Math.max(...alle);
  const min = Math.min(...alle);
  const spanne = max - min || 1;

  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (width - padL - padR)) / (n - 1));
  const y = (v: number) => padT + ((max - v) * (height - padT - padB)) / spanne;

  const pfad = (a: number[]) => a.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");

  const gridWerte: number[] = [];
  for (let g = 0; g <= 3; g++) gridWerte.push(min + (spanne * g) / 3);
  // Achsenbeträge sind Minor Units (Cent) → direkt über geld.format lokalisieren.
  const fmtAchse = (v: number) => geld.format(Math.round(v));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }}>
        {gridWerte.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 9} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {fmtAchse(v)}
            </text>
          </g>
        ))}
        {/* Nulllinie betont, falls im Bereich */}
        {min < 0 && max > 0 && (
          <line x1={padL} y1={y(0)} x2={width - padR} y2={y(0)} stroke="var(--ink-3)" strokeWidth="1.2" strokeDasharray="2 3" />
        )}
        {labels.map((m, i) =>
          i % Math.ceil(n / 12) === 0 ? (
            <text key={i} x={x(i)} y={height - 9} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {m}
            </text>
          ) : null,
        )}
        <path d={pfad(freieLiquiditaet)} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pfad(kontosaldo)} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2.4px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />
          {t("charts.planSaldo")}
        </span>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2.4px solid var(--accent)", verticalAlign: "middle", marginRight: 6 }} />
          {t("charts.freieLiquiditaetMinusToepfe")}
        </span>
      </div>
    </div>
  );
}
