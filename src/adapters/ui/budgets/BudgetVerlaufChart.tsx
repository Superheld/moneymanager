// BudgetVerlaufChart — je Monat ein Balken für das, was abgeflossen ist, und dahinter
// eine Linie für das, was verfügbar war. Die Linie hat je nach Art eine andere Form:
//
//   MONATLICH  eine waagerechte Grenze je Monat, als Stufe: der Rahmen ist eine Grenze,
//              und ein Balken, der über sie ragt, ist überzogen.
//   AUFBAUEND  eine Linie durch die Monate: der Stand am MONATSENDE (`rest`) — er wächst
//              mit jeder Rate und sinkt mit jeder Ausgabe; ein Stand ist ein Verlauf.
//              Bis 2026-11-11 war es `verfuegbar` (Übertrag plus Rate), der Stand VOR den
//              Ausgaben des Monats: was im November ausging, sank erst am Dezember-Punkt.
//
// **Bis 2026-11-08 stand dort ein heller Schattenbalken**, für beide Arten gleich. Er
// sagte bei der aufbauenden nicht, dass sie sammelt (man musste die Höhen der Schatten
// im Kopf verbinden), und bei der monatlichen verdeckte er die Grenze, um die es geht,
// unter einer Fläche.
//
// Ändert sich der Rahmen von einem Monat auf den nächsten, springt die Linie. Das
// sieht ohne Erklärung aus wie ein Rechenfehler — deshalb steht am Wechselmonat eine Marke
// auf der Grundlinie, und die Zeile unter dem Chart nennt den vorherigen Betrag.
//
// Monate VOR der ersten Betragsversion tragen keinen hellen Balken und färben sich nie
// als überzogen: dort gab es keinen Rahmen, und ein Verbrauch ohne Rahmen ist keine
// Überziehung, sondern die Zeit davor. Sie stehen trotzdem da — „wie war es, bevor ich das
// Budget hatte" ist die interessanteste Frage am Verlauf.
//
// Der Verbrauch kann NEGATIV werden (ein Monat, in dem eine Erstattung die Ausgaben
// überwiegt). Solche Monate wachsen nach unten statt auf null geklemmt zu werden: ein
// leerer Balken hiesse „nichts ausgegeben", und das wäre eine andere Aussage.

import { useTranslation } from "react-i18next";
import type { Budgetmonat } from "../../../application";
import { useGeld } from "../bausteine/einstellungenKontext";
import { flussFarbe, warnFlaeche } from "../bausteine/geldFarbe";

interface Props {
  monate: readonly Budgetmonat[];
  /** Entscheidet die Form der Linie hinter den Balken — Grenze oder Stand. */
  art: "monatlich" | "aufbauend";
  width?: number;
  height?: number;
  /** Klick auf einen Monat (Index) — die Balken und der ganze Slot sind das Ziel. */
  onMonatClick?: (index: number) => void;
  aktivIndex?: number | null;
}

export function BudgetVerlaufChart({ monate, art, width = 1000, height = 220, onMonatClick, aktivIndex }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  const padL = 60;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const n = monate.length;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // Skala über beide Reihen. Ein überzogener Monat ragt über seinen hellen Balken hinaus —
  // das soll er, sonst sähe „Rahmen genau ausgeschöpft" aus wie „Rahmen gerissen".
  const oben = Math.max(1, ...monate.map((m) => Math.max(m.verfuegbar, m.verbraucht)));
  /** Wo die Linie im Monat steht: beim Monatlichen die Grenze, beim Aufbauenden der Stand nach dem Monat. */
  const linienwert = (m: Budgetmonat) => Math.max(0, art === "aufbauend" ? m.rest : m.verfuegbar);
  const unten = Math.min(0, ...monate.map((m) => m.verbraucht));
  const spanne = oben - unten;
  const y = (v: number) => padT + ((oben - v) / spanne) * innerH;
  const nulllinie = y(0);

  const slot = n > 0 ? innerW / n : innerW;
  const verbrauchBreite = Math.min(18, slot * 0.36);
  const mitte = (i: number) => padL + slot * i + slot / 2;

  /**
   * Die Linie hinter den Balken. Monate ohne Rahmen (vor der ersten Betragsversion)
   * unterbrechen sie: dort gab es nichts, und eine durchgezogene Linie behauptete eine
   * Grenze oder einen Stand, den es nicht gab.
   */
  const linie = (() => {
    let d = "";
    let offen = false;
    monate.forEach((m, i) => {
      if (m.ohnePlan) {
        offen = false;
        return;
      }
      const yv = y(linienwert(m));
      if (art === "monatlich") {
        // Stufe: über die volle Breite des Monats, senkrecht verbunden zum nächsten.
        const x0 = padL + slot * i;
        d += offen ? ` L${x0},${yv} L${x0 + slot},${yv}` : ` M${x0},${yv} L${x0 + slot},${yv}`;
      } else {
        d += offen ? ` L${mitte(i)},${yv}` : ` M${mitte(i)},${yv}`;
      }
      offen = true;
    });
    return d.trim();
  })();

  const gitter = [oben, oben / 2, 0, unten].filter((v, i, a) => a.indexOf(v) === i);
  const fmtAchse = (v: number) => geld.format(Math.round(v));
  /** Nur jedes k-te Monatslabel, damit sie sich bei zwölf Monaten nicht überlappen. */
  const jedes = Math.max(1, Math.ceil(n / 12));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }}>
        {gitter.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke={v === 0 ? "var(--ink-3)" : "var(--line)"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{fmtAchse(v)}</text>
          </g>
        ))}
        {/* Die Linie liegt HINTER den Balken: sie ist der Massstab, die Balken die
            Aussage. Die Farbe ist der Akzent, nicht die Tinte der Balken — sonst läse man
            beide als eine Grösse. */}
        {linie && (
          <path d={linie} fill="none" stroke="var(--accent-deep)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" opacity={art === "monatlich" ? 0.7 : 0.9} />
        )}
        {art === "aufbauend" &&
          monate.map((m, i) =>
            m.ohnePlan ? null : (
              <circle key={`p${m.monat}`} cx={mitte(i)} cy={y(linienwert(m))} r="4"
                fill="var(--accent-deep)" stroke="var(--surface)" strokeWidth="2" />
            ),
          )}
        {monate.map((m, i) => {
          const cx = mitte(i);
          const ueberzogen = !m.ohnePlan && m.verbraucht > m.verfuegbar;
          const oberkante = y(Math.max(0, m.verbraucht));
          const verbrauchH = Math.abs(nulllinie - oberkante);
          const klickbar = !!onMonatClick;
          return (
            <g key={m.monat} onClick={klickbar ? () => onMonatClick!(i) : undefined} style={klickbar ? { cursor: "pointer" } : undefined}>
              {/* Ein negativer Verbrauch ist ein RÜCKFLUSS. „verbraucht" vor einem
                  Minusbetrag liest sich trotzdem als ausgegeben — das Wort gewinnt gegen
                  das Vorzeichen. Also das Wort wechseln und den Betrag ohne zeigen. */}
              <title>{m.ohnePlan
                ? `${m.monat} · ${t(m.verbraucht < 0 ? "budgets.verlaufOhnePlanKurzZurueck" : "budgets.verlaufOhnePlanKurz", { verbraucht: geld.formatMitSymbol(Math.abs(m.verbraucht)) })}`
                : `${m.monat} · ${t(m.verbraucht < 0 ? "budgets.verlaufTooltipZurueck" : "budgets.verlaufTooltip", {
                    verfuegbar: geld.formatMitSymbol(m.verfuegbar),
                    verbraucht: geld.formatMitSymbol(Math.abs(m.verbraucht)),
                    rest: geld.formatMitSymbol(m.rest),
                  })}`}</title>
              {aktivIndex === i && (
                <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="var(--accent)" opacity="0.1" />
              )}
              <rect
                x={cx - verbrauchBreite / 2}
                y={m.verbraucht >= 0 ? oberkante : nulllinie}
                width={verbrauchBreite}
                height={verbrauchH}
                rx="2"
                /* Eine Fläche nimmt den Flächenton, nicht den Textton (Regel 3 in
                   `bausteine/geldFarbe`). Der Verbrauch selbst ist eine HÖHE ohne
                   Richtung und bleibt neutral; amber kommt von der Schwelle, grün vom
                   Rückfluss — der ist gerichtet. */
                fill={ueberzogen ? warnFlaeche(true) : m.verbraucht < 0 ? flussFarbe(1) : "var(--ink)"}
                opacity={ueberzogen ? 0.9 : m.ohnePlan ? 0.3 : 0.78}
              />
              {/* Die Marke sitzt an der LINKEN Kante des Slots: die Änderung gilt AB
                  diesem Monat, sie gehört also zwischen ihn und seinen Vorgänger. */}
              {m.zufuehrungVorher != null && (
                <g>
                  <line x1={padL + slot * i} y1={padT} x2={padL + slot * i} y2={nulllinie + 5}
                    stroke="var(--accent-deep)" strokeWidth="1.2" strokeDasharray="3 3" />
                  <circle cx={padL + slot * i} cy={nulllinie} r="3" fill="var(--accent-deep)" />
                </g>
              )}
              {klickbar && <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />}
              {i % jedes === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{m.monat}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 2, borderRadius: 1, background: "var(--accent-deep)", verticalAlign: "middle", marginRight: 6 }} />{t(art === "monatlich" ? "budgets.legendeRahmen" : "budgets.legendeStand")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ink)", opacity: 0.78, verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeVerbraucht")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: warnFlaeche(true), verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeUeberzogen")}</span>
        {monate.some((m) => m.ohnePlan) && (
          <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ink)", opacity: 0.3, verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeOhnePlan")}</span>
        )}
        {monate.some((m) => m.zufuehrungVorher != null) && (
          <span><span style={{ display: "inline-block", width: 2, height: 11, background: "var(--accent-deep)", verticalAlign: "middle", marginRight: 8, marginLeft: 4 }} />{t("budgets.legendeAenderung")}</span>
        )}
      </div>
    </div>
  );
}
