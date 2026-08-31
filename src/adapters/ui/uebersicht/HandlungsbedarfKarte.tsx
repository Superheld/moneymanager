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
import type { Kontovorschau } from "../../../application";
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
            <div
              key={v.kontoId}
              style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}
            >
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
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: "var(--fs-small)", marginBottom: 0 }}>
        {t("uebersicht.bedarfHinweis")}
      </p>
    </Card>
  );
}
