// Saldo-Verlauf — eine Linie (realer Gesamt-Saldo über die Zeit) mit eigener Legende.
// Nulllinie betont, falls der Saldo ins Minus läuft.

import { useGeld } from "../bausteine/einstellungenKontext";
import { warnFlaeche } from "../bausteine/geldFarbe";

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
  /**
   * Die Achse ohne Null: von 10 % unter dem kleinsten bis 10 % über dem grössten Wert.
   *
   * Für das Depot und den Blick nach vorn (seit 2026-11-11). Mit der Null im Bild lag die
   * Linie als fast gerader Strich oben am Rand, und die Schwankung, die man sehen will,
   * war ein Pixel hoch. Läuft ein Wert ins Minus, kommt die Null trotzdem ins Bild — die
   * Nulllinie wird gezeichnet, sobald sie zwischen den Enden liegt.
   */
  ohneNull?: boolean;
  width?: number;
  height?: number;
  /**
   * Punkte auf die MITTE je Monat statt auf die Ränder — dieselbe Lage wie die Balken
   * eines `MonatsFlussChart` darunter (seit 2026-11-11, im Blick nach vorn). Sonst stand
   * ein Monat oben an anderer Stelle als unten, und man las den falschen Balken ab.
   */
  mittig?: boolean;
  /**
   * Je Punkt optional der tiefste Stand INNERHALB des Monats. Gezeichnet als dünner
   * Strich vom Monatsende hinunter bis zur Marke: die Linie sagt, wo der Monat endet, der
   * Strich, wie tief es dazwischen geht.
   */
  tiefpunkte?: readonly (number | undefined)[];
  /** Zusatz je Punkt für den Hover-Text (etwa der Tag des Tiefstands). */
  zusatz?: readonly (string | undefined)[];
  legendeTief?: string;
}

export function SaldoVerlaufChart({
  labels,
  werte,
  legende,
  abIndex,
  legendePlan,
  ohneNull = false,
  width = 1000,
  height = 300,
  mittig = false,
  tiefpunkte,
  zusatz,
  legendeTief,
}: Props) {
  const geld = useGeld();
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const n = labels.length;

  const tiefe = (tiefpunkte ?? []).filter((v): v is number => v != null);
  const alle = ohneNull ? [...werte, ...tiefe] : [...werte, ...tiefe, 0];
  // Über den Betrag gerechnet, damit „10 % darüber" auch bei einem negativen Wert nach
  // oben zeigt.
  const max = ohneNull ? Math.max(...alle) + Math.abs(Math.max(...alle)) * 0.1 : Math.max(...alle);
  const min = ohneNull ? Math.min(...alle) - Math.abs(Math.min(...alle)) * 0.1 : Math.min(...alle);
  const spanne = max - min || 1;

  const slot = n > 0 ? (width - padL - padR) / n : width - padL - padR;
  const x = (i: number) =>
    mittig ? padL + slot * i + slot / 2 : padL + (n <= 1 ? 0 : (i * (width - padL - padR)) / (n - 1));
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
            // Die letzte Beschriftung endet an ihrem Punkt statt mittig darüber: mittig
            // ragte sie über den rechten Rand und wurde abgeschnitten.
            <text key={i} x={x(i)} y={height - 9} textAnchor={!mittig && i === n - 1 && n > 1 ? "end" : "middle"} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
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
        {/* Der Tiefstand im Monat: ein Strich vom Monatsende hinunter, unten eine Marke.
            Amber nur, wo er unter null fällt — sonst ist er Auskunft, keine Warnung. */}
        {tiefpunkte?.map((t, i) =>
          t == null || t >= werte[i] ? null : (
            <g key={`t${i}`}>
              <line x1={x(i)} y1={y(werte[i])} x2={x(i)} y2={y(t)} stroke={warnFlaeche(t < 0) ?? "var(--ink-3)"} strokeWidth="1.4" />
              <line x1={x(i) - 5} y1={y(t)} x2={x(i) + 5} y2={y(t)} stroke={warnFlaeche(t < 0) ?? "var(--ink-3)"} strokeWidth="2" strokeLinecap="round" />
            </g>
          ),
        )}
        {/* Hover: je Punkt eine unsichtbare Fläche über die ganze Höhe, mit dem Wert als
            Titel. Ohne sie gab es in diesem Chart keinen einzigen Wert abzulesen. */}
        {werte.map((v, i) => {
          const breite = mittig ? slot : n <= 1 ? width - padL - padR : (width - padL - padR) / (n - 1);
          return (
            <rect key={`h${i}`} x={x(i) - breite / 2} y={padT} width={breite} height={height - padT - padB} fill="transparent">
              <title>{`${labels[i]}: ${geld.formatMitSymbol(v)}${zusatz?.[i] ? ` · ${zusatz[i]}` : ""}`}</title>
            </rect>
          );
        })}
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
        {legendeTief && tiefe.length > 0 && (
          <span>
            <span style={{ display: "inline-block", width: 2, height: 12, background: "var(--ink-3)", verticalAlign: "middle", marginRight: 8, marginLeft: 4 }} />
            {legendeTief}
          </span>
        )}
      </div>
    </div>
  );
}
