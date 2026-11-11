// Die Faustformel als Tacho — wie weit der Stand der Rücklagenkonten an die
// Mindestrücklage heranreicht.
//
// Ein Halbkreis und keine Zahl allein, weil die Frage „wie weit bin ich?" heisst und nicht
// „wie viel ist es?". Der Bogen reicht bis ANDERTHALB Mindestrücklagen, damit die Marke
// bei 100 % nicht am Rand klebt: wer drüber ist, sieht, um wie viel, und wer drunter ist,
// sieht den Abstand zur Marke statt eines fast vollen Bogens.
//
// Die Farbe sagt, ob die Marke erreicht ist — aber nie allein: daneben steht in Worten,
// ob sie erreicht ist oder was fehlt (Farbe ist Zustand, nicht Auskunft).

import { useTranslation } from "react-i18next";
import { useGeld } from "../bausteine/einstellungenKontext";

/** Wie weit der Bogen reicht, gemessen in Mindestrücklagen. */
const BOGEN_ENDE = 1.5;

export function FaustformelTacho({ stand, mindest }: { stand: number; mindest: number }) {
  const { t } = useTranslation();
  const geld = useGeld();

  const breite = 240;
  const hoehe = 158;
  const cx = breite / 2;
  const cy = 120;
  const r = 96;
  const max = mindest * BOGEN_ENDE;
  const anteil = Math.max(0, Math.min(1, stand / max));
  const erreicht = stand >= mindest;
  const prozent = Math.round((stand / mindest) * 100);

  /** Punkt auf dem Bogen für einen Anteil 0…1 — links beginnend, oben herum nach rechts. */
  const punkt = (a: number, radius = r) => {
    const w = Math.PI * (1 - a);
    return { x: cx + radius * Math.cos(w), y: cy - radius * Math.sin(w) };
  };
  const bogen = (a: number) => {
    const p0 = punkt(0);
    const p1 = punkt(a);
    return `M${p0.x},${p0.y} A${r},${r} 0 0 1 ${p1.x},${p1.y}`;
  };
  const marke = 1 / BOGEN_ENDE;
  const mInnen = punkt(marke, r - 14);
  const mAussen = punkt(marke, r + 14);
  const nadel = punkt(anteil, r - 26);
  const farbe = erreicht ? "var(--accent)" : "var(--warn)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-2)" }}>
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        width="100%"
        style={{ maxWidth: 280, display: "block" }}
        role="img"
        aria-label={t("ruecklagen.tachoAria", { prozent })}
      >
        <title>{t("ruecklagen.tachoTooltip", { stand: geld.formatMitSymbol(stand), mindest: geld.formatMitSymbol(mindest) })}</title>
        <path d={bogen(1)} fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
        {anteil > 0 && <path d={bogen(anteil)} fill="none" stroke={farbe} strokeWidth="14" strokeLinecap="round" />}
        {/* Die Marke der Faustformel — über dem Bogen, damit sie auch dann zu sehen ist,
            wenn die Füllung sie überdeckt. */}
        <line x1={mInnen.x} y1={mInnen.y} x2={mAussen.x} y2={mAussen.y} stroke="var(--ink)" strokeWidth="2" />
        <line x1={cx} y1={cy} x2={nadel.x} y2={nadel.y} stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--ink)" />
        {/* Die Zahl steht UNTER dem Drehpunkt: darüber kreuzte die Nadel sie, je nach
            Stand mitten hindurch. */}
        <text x={cx} y={cy + 32} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-ui)">
          {prozent} %
        </text>
      </svg>
      <div style={{ fontSize: "var(--fs-sm)", textAlign: "center" }}>
        <div>
          <span className="num" style={{ fontWeight: "var(--fw-bold)" }}>{geld.formatMitSymbol(stand)}</span>{" "}
          <span className="muted">{t("ruecklagen.tachoVon", { mindest: geld.formatMitSymbol(mindest) })}</span>
        </div>
        <div style={{ color: "var(--ink-2)", marginTop: 2 }}>
          {erreicht
            ? t("ruecklagen.tachoErreicht")
            : t("ruecklagen.tachoFehlt", { betrag: geld.formatMitSymbol(mindest - stand) })}
        </div>
      </div>
    </div>
  );
}
