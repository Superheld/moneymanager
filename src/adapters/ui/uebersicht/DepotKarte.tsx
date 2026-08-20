// Depots in der Übersicht — „wie steht es gerade".
//
// Liegt in `uebersicht/` und nicht in einem eigenen `depot/`-Ordner, obwohl Kern und
// Anwendungsschicht einen haben: der UI-Ordner folgt der Navigation (`ScreenId`), und ein
// Depot ist kein Bereich, sondern etwas, das in zweien vorkommt. Der Verlauf steht aus
// demselben Grund in `analyse/`.
//
// Bewusst eine eigene Karte neben den Konten und nicht in ihnen: ein Depotwert ist nicht
// verfügbar und ändert sich täglich, ohne dass etwas geflossen wäre. Ihn zu den liquiden
// Mitteln zu addieren ergäbe eine Zahl, die aussieht wie Geld, das man ausgeben kann.
//
// Deshalb steht neben dem Wert immer sein Stichtag. Ohne ihn ist ein Depotwert eine
// Behauptung ohne Zeitbezug — und je länger der letzte Abruf her ist, desto weniger sagt
// er über heute.

import { useTranslation } from "react-i18next";
import type { Depotdaten, Depotsicht } from "../../../application";
import { Card } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";

/** Die Veränderung zum vorletzten Stichtag — die kürzeste Aussage über eine Richtung. */
function seitLetztemStand(sicht: Depotsicht): { betrag: number; von: string } | undefined {
  const reihe = sicht.reihe;
  if (reihe.length < 2) return undefined;
  const jetzt = reihe[reihe.length - 1];
  const davor = reihe[reihe.length - 2];
  return { betrag: jetzt.gesamtwert - davor.gesamtwert, von: davor.stichtag };
}

export function DepotKarte({ daten }: { daten: Depotdaten }) {
  const { t } = useTranslation();
  const geld = useGeld();

  // Ohne Depot keine Karte: eine leere Karte mit einer Null liest sich wie ein Fehler.
  if (!daten.hatDepots) return null;

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("depot.uebersichtTitel")}
      subtitle={t("depot.uebersichtHinweis")}
      action={<strong>{geld.formatMitSymbol(daten.gesamtwert)}</strong>}
    >
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {daten.depots.map((s) => {
          const delta = seitLetztemStand(s);
          return (
            <li
              key={s.depot.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--sp-3)",
                borderTop: "1px solid var(--line-soft)",
                padding: "var(--sp-2) 0",
                flexWrap: "wrap",
              }}
            >
              <span>
                {s.depot.bezeichnung}
                {s.aktuell && (
                  <span className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--sp-2)" }}>
                    {t("depot.stand", { datum: s.aktuell.stichtag })}
                  </span>
                )}
              </span>
              <span>
                {s.aktuell ? geld.formatMitSymbol(s.aktuell.gesamtwert) : t("depot.nieAbgerufen")}
                {delta && (
                  <span
                    className="muted"
                    style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--sp-2)" }}
                  >
                    {t("depot.seit", { datum: delta.von, betrag: geld.formatMitSymbol(delta.betrag) })}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
