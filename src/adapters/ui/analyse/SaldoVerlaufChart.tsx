// Saldo-Verlauf — eine Linie (realer Gesamt-Saldo über die Zeit) mit eigener Legende.
// Nulllinie betont, falls der Saldo ins Minus läuft.

import { useGeld } from "../bausteine/einstellungenKontext";

interface Props {
  labels: string[];
  werte: number[]; // Minor Units (Cent)
  legende: string;
  /**
   * Ab diesem Index ist die Linie PROJIZIERT und wird gestrichelt gezeichnet.
   *
   * Als eigene Darstellung und nicht als zweite Linie daneben: es ist derselbe Saldo,
   * er läuft ohne Sprung weiter, und zwei Linien behaupteten zwei Grössen. Was sich
   * ändert, ist die Verbindlichkeit — und dafür ist die Strichelung da.
   */
  abIndex?: number;
  /** Beschriftung des gestrichelten Teils. Fehlt sie, gibt es keinen. */
  legendePlan?: string;
  width?: number;
  height?: number;
}

export function SaldoVerlaufChart({
  labels,
  werte,
  legende,
  abIndex,
  legendePlan,
  width = 1000,
  height = 300,
}: Props) {
  const geld = useGeld();
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const n = labels.length;

  const alle = [...werte, 0];
  const max = Math.max(...alle);
  const min = Math.min(...alle);
  const spanne = max - min || 1;

  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (width - padL - padR)) / (n - 1));
  const y = (v: number) => padT + ((max - v) * (height - padT - padB)) / spanne;
  const punkt = (v: number, i: number, erster: boolean) =>
    (erster ? "M" : "L") + x(i).toFixed(1) + " " + y(v).toFixed(1);
  // Ohne Naht ist der ganze Pfad gewesen. Mit Naht beginnt der geplante Teil bei der
  // LETZTEN gewesenen Marke — sonst klaffte zwischen beiden Linien eine Lücke von einem
  // Monat, und der Saldo sähe aus, als spränge er.
  const naht = abIndex != null && abIndex > 0 && abIndex < werte.length ? abIndex : undefined;
  const bisNaht = naht == null ? werte : werte.slice(0, naht);
  const pfad = bisNaht.map((v, i) => punkt(v, i, i === 0)).join(" ");
  const pfadPlan =
    naht == null
      ? ""
      : werte.slice(naht - 1).map((v, i) => punkt(v, naht - 1 + i, i === 0)).join(" ");

  const gridWerte: number[] = [];
  for (let g = 0; g <= 3; g++) gridWerte.push(min + (spanne * g) / 3);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }}>
        {gridWerte.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 9} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {geld.format(Math.round(v))}
            </text>
          </g>
        ))}
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
        {naht != null && (
          <line
            x1={x(naht - 1)}
            y1={padT}
            x2={x(naht - 1)}
            y2={height - padB}
            stroke="var(--line)"
            strokeWidth="1.4"
          />
        )}
        <path d={pfad} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {pfadPlan && (
          <path
            d={pfadPlan}
            fill="none"
            stroke="var(--accent-deep, var(--ink-2))"
            strokeWidth="2.4"
            strokeDasharray="6 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2.4px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />
          {legende}
        </span>
        {naht != null && legendePlan && (
          <span>
            <span
              style={{
                display: "inline-block",
                width: 18,
                height: 0,
                borderTop: "2.4px dashed var(--accent-deep, var(--ink-2))",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            {legendePlan}
          </span>
        )}
      </div>
    </div>
  );
}
