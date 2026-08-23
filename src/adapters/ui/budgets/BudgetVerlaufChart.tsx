// BudgetVerlaufChart — je Monat zwei ineinanderliegende Balken: hell, was in dem Monat
// verfügbar war, davor massiv, was davon abgeflossen ist.
//
// Ineinander und nicht nebeneinander wie im MonatsFlussChart, weil die beiden Zahlen hier
// nicht zwei Größen sind, sondern eine Größe und ihr Rahmen: man liest ab, wie voll der
// Balken ist, nicht welcher der beiden höher steht. Bei einem aufbauenden Budget wächst
// der helle Balken mit — genau daran sieht man, dass es sammelt.
//
// Ändert sich der Rahmen von einem Monat auf den nächsten, springt der helle Balken. Das
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

interface Props {
  monate: readonly Budgetmonat[];
  width?: number;
  height?: number;
  /** Klick auf einen Monat (Index) — die Balken und der ganze Slot sind das Ziel. */
  onMonatClick?: (index: number) => void;
  aktivIndex?: number | null;
}

export function BudgetVerlaufChart({ monate, width = 1000, height = 220, onMonatClick, aktivIndex }: Props) {
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
  const unten = Math.min(0, ...monate.map((m) => m.verbraucht));
  const spanne = oben - unten;
  const y = (v: number) => padT + ((oben - v) / spanne) * innerH;
  const nulllinie = y(0);

  const slot = n > 0 ? innerW / n : innerW;
  const rahmenBreite = Math.min(26, slot * 0.5);
  const verbrauchBreite = rahmenBreite * 0.52;

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
        {monate.map((m, i) => {
          const cx = padL + slot * i + slot / 2;
          const rahmenH = Math.max(0, nulllinie - y(Math.max(0, m.verfuegbar)));
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
              <rect x={cx - rahmenBreite / 2} y={nulllinie - rahmenH} width={rahmenBreite} height={rahmenH} rx="2" fill="var(--ink)" opacity="0.13" />
              <rect
                x={cx - verbrauchBreite / 2}
                y={m.verbraucht >= 0 ? oberkante : nulllinie}
                width={verbrauchBreite}
                height={verbrauchH}
                rx="2"
                fill={ueberzogen ? "var(--warn-deep)" : m.verbraucht < 0 ? "var(--ok)" : "var(--ink)"}
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
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ink)", opacity: 0.13, verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeVerfuegbar")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--ink)", opacity: 0.78, verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeVerbraucht")}</span>
        <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--warn-deep)", verticalAlign: "middle", marginRight: 6 }} />{t("budgets.legendeUeberzogen")}</span>
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
