// Der Verlauf des Nettovermögens — eine Linie über die Monatsenden.
//
// Von Hand als SVG, wie die übrigen Diagramme. Eine Linie und sonst nichts: das
// Nettovermögen ist EINE Grösse, und seine vier Teile stehen als Zahlen darüber. Ein
// Stapel aus Konten, Depots und Vermögenswerten mit den Schulden darunter wäre das
// reichere Bild — und eines, das man erst lesen lernen muss.
//
// Die Achse beginnt nicht bei null: ein Vermögen, das sich um ein paar Prozent bewegt,
// läge sonst als gerader Strich am oberen Rand. Läuft es ins Minus, kommt die Nulllinie
// ins Bild.
//
// `analyse/SaldoVerlaufChart` zeichnet fast dasselbe. Es wird hier nicht mitbenutzt, weil
// ein Baustein, den zwei Bereiche brauchen, nach `bausteine/` gehört — und das Umziehen
// einer Datei, die in der Analyse steht, gehört nicht in das Paket, das einen neuen
// Bereich anlegt. Wer beide zusammenführt, tut es dort.

import { useGeld } from "../bausteine/einstellungenKontext";

interface Props {
  /** Fertig beschriftet — der Chart weiss nicht, dass es Daten sind. */
  labels: readonly string[];
  /** Minor Units (Cent), je Punkt. */
  werte: readonly number[];
  legende: string;
  /** Der Hover-Text je Punkt, fertig formuliert. */
  titel: (index: number) => string;
}

const BREITE = 1000;
const HOEHE = 260;
const RAND = { links: 64, rechts: 16, oben: 16, unten: 30 };

export function NettoVerlaufChart({ labels, werte, legende, titel }: Props) {
  const geld = useGeld();
  const n = werte.length;

  const hoch = Math.max(...werte);
  const tief = Math.min(...werte);
  // Zehn Prozent Luft über und unter der Linie, über den BETRAG gerechnet — damit
  // „darüber" auch bei einem negativen Wert nach oben zeigt. Bei einer waagerechten
  // Linie gäbe es sonst keine Spanne; dann trägt der Wert selbst (oder eins) die Luft.
  const luft = Math.max((hoch - tief) * 0.1, Math.abs(hoch) * 0.02, 1);
  const max = hoch + luft;
  const min = tief - luft;
  const spanne = max - min;

  const innenBreite = BREITE - RAND.links - RAND.rechts;
  const innenHoehe = HOEHE - RAND.oben - RAND.unten;
  const x = (i: number) => RAND.links + (n <= 1 ? 0 : (i * innenBreite) / (n - 1));
  const y = (v: number) => RAND.oben + ((max - v) * innenHoehe) / spanne;

  const pfad = werte
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const raster = [0, 1, 2, 3].map((g) => min + (spanne * g) / 3);
  // Höchstens ein Dutzend Beschriftungen, sonst laufen sie ineinander.
  const schritt = Math.max(1, Math.ceil(n / 12));
  const feldBreite = n <= 1 ? innenBreite : innenBreite / (n - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${BREITE} ${HOEHE}`} width="100%" role="img" aria-label={legende} style={{ display: "block", height: "auto" }}>
        {raster.map((v, i) => (
          <g key={i}>
            <line x1={RAND.links} y1={y(v)} x2={BREITE - RAND.rechts} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={RAND.links - 9} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {geld.format(Math.round(v))}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line x1={RAND.links} y1={y(0)} x2={BREITE - RAND.rechts} y2={y(0)} stroke="var(--ink-3)" strokeWidth="1.2" strokeDasharray="2 3" />
        )}
        {labels.map((l, i) =>
          i % schritt === 0 ? (
            // Die letzte Beschriftung endet an ihrem Punkt: mittig ragte sie über den Rand.
            <text key={i} x={x(i)} y={HOEHE - 9} textAnchor={i === n - 1 && n > 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {l}
            </text>
          ) : null,
        )}
        <path d={pfad} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {/* Je Punkt eine unsichtbare Fläche über die ganze Höhe, mit dem Wert als Titel —
            ohne sie liesse sich in der Linie kein einziger Betrag ablesen. */}
        {werte.map((_, i) => (
          <rect key={i} x={x(i) - feldBreite / 2} y={RAND.oben} width={feldBreite} height={innenHoehe} fill="transparent">
            <title>{titel(i)}</title>
          </rect>
        ))}
      </svg>
      <div style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2.4px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />
        {legende}
      </div>
    </div>
  );
}
