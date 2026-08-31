// „Ist etwas zu tun?" — die einzige Karte der Übersicht, die nicht berichtet, sondern
// auffordert.
//
// Sie steht deshalb GANZ OBEN und nicht bei den anderen: alles darunter sagt, wie es
// steht; das hier sagt, dass es so nicht bleiben kann. Und sie ist die einzige Karte, die
// VERSCHWINDET, wenn es nichts zu sagen gibt — eine dauerhafte Zeile „alles in Ordnung"
// wäre nach zwei Wochen unsichtbar, und dann fiele auch die Warnung nicht mehr auf.
//
// Zwei Schärfegrade, und der Unterschied ist die eigentliche Auskunft:
//
//   SICHER    schon die datierten Verpflichtungen reissen das Konto ins Minus. Daran
//             ändert Sparsamkeit nichts, hier hilft nur Geld.
//   ERWARTET  erst mit dem üblichen Verbrauch. Wer weniger ausgibt, kommt hin.

import { useTranslation } from "react-i18next";
import type { Kontovorschau, Vorschaupunkt } from "../../../application";
import { Card, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";

export function HandlungsbedarfKarte({
  bedarf,
  kontoNamen,
  bisTag,
}: {
  bedarf: readonly Kontovorschau[];
  kontoNamen: ReadonlyMap<string, string>;
  /** Ende des gerechneten Fensters — gehört in den Untertitel, sonst rät man daran. */
  bisTag: string;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (bedarf.length === 0) return null;

  return (
    <Card
      title={t("uebersicht.bedarfTitel")}
      subtitle={t("uebersicht.bedarfUntertitel", { bis: bisTag })}
      style={{ borderColor: "var(--warn)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {bedarf.map((v) => {
          const sicher = v.fest.minusAb !== undefined;
          // Bei einem sicheren Minus zählt der feste Termin: er ist der, der eintritt.
          // Bei einem erwarteten gibt es keinen Termin, nur eine Annahme.
          const ab = sicher ? (v.fest.minusAb as string) : (v.erwartet.minusAb as string);
          const tiefstand = sicher ? v.fest.tiefstand : v.erwartet.tiefstand;
          return (
            <div key={v.kontoId}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                <span>
                  <b>{kontoNamen.get(v.kontoId) ?? v.kontoId}</b>{" "}
                  <Pill variant={sicher ? "warn" : "neutral"}>
                    {t(sicher ? "uebersicht.bedarfSicher" : "uebersicht.bedarfErwartet")}
                  </Pill>
                </span>
                <span className="muted">
                  {t("uebersicht.bedarfAb", { datum: ab })} ·{" "}
                  <span style={{ color: "var(--warn-deep)" }}>
                    {geld.format(tiefstand)} {geld.symbol}
                  </span>
                </span>
              </div>
              {/* Die Linie beantwortet, was die Zahl daneben nicht kann: WIE KNAPP und
                  WIE LANGE. „Am 14. im Minus" und „ab dem 14. drei Tage knapp darunter,
                  danach wieder im Plus" sind zwei verschiedene Lagen, und nur die eine
                  verlangt, dass man etwas tut. */}
              <Vorschaulinie punkte={v.verlauf} />
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: "var(--fs-small)", marginBottom: 0 }}>
        {t("uebersicht.bedarfHinweis")}
      </p>
    </Card>
  );
}

/**
 * Der Verlauf als kleine Linie — durchgezogen die festen Termine, gestrichelt die
 * erwartete Lage mit dem üblichen Verbrauch.
 *
 * Keine Achsen, keine Beschriftung: sie steht neben einer Zeile, die den Tag und den
 * Betrag schon nennt, und soll die FORM zeigen, nicht Werte ablesbar machen. Eine
 * Nulllinie gibt es trotzdem — ohne sie liesse sich nicht sehen, was hier die ganze
 * Frage ist.
 *
 * Gestrichelt für das Erwartete, wie überall im Projekt für Geplantes (`Pill`-Variante
 * `plan`): der Unterschied zwischen Termin und Annahme soll man sehen, ohne die Legende
 * zu lesen.
 */
function Vorschaulinie({ punkte }: { punkte: readonly Vorschaupunkt[] }) {
  if (punkte.length < 2) return null;

  const breite = 600;
  const hoehe = 60;
  const werte = punkte.flatMap((p) => [p.fest, p.erwartet]);
  // Die Null gehört IMMER in die Spanne — sonst läge die Nulllinie ausserhalb des Bildes
  // und die Kurve schwebte ohne Bezug.
  const max = Math.max(...werte, 0);
  const min = Math.min(...werte, 0);
  const spanne = max - min || 1;

  const x = (i: number) => (i * breite) / (punkte.length - 1);
  const y = (v: number) => ((max - v) * hoehe) / spanne;
  const pfad = (nimm: (p: Vorschaupunkt) => number) =>
    punkte.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(nimm(p)).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${breite} ${hoehe}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 48, marginTop: 6, display: "block" }}
      aria-hidden="true"
    >
      <line x1="0" y1={y(0)} x2={breite} y2={y(0)} stroke="var(--line)" strokeWidth="2" />
      <path d={pfad((p) => p.erwartet)} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="6 5" />
      <path d={pfad((p) => p.fest)} fill="none" stroke="var(--warn-deep)" strokeWidth="2.5" />
    </svg>
  );
}
