// „Wie lange reicht es ohne Einnahmen?" — das freie Geld der liquiden Konten gegen das,
// was ein Monat kostet. Gerechnet in `core/reichweite.ts`, geholt von `analyseReichweite`.
//
// WARUM IM AUSBLICK DER ANALYSE und nicht in der Übersicht: der Zähler ist ein Stand von
// heute, der Nenner aber ein Durchschnitt über ein Jahr, und die Aussage selbst zeigt
// nach vorn („so lange komme ich noch aus"). Die Übersicht beantwortet, wie man GERADE
// dasteht; eine Zahl, die erst mit einem Zeitraum und einer Annahme etwas bedeutet, gehört
// zu „Reicht das Geld?" darüber — dieselbe Frage, nur ohne die Einnahmen und weiter.
//
// Drei Dinge daran sind Entscheidung:
//
//   • ZWEI Zahlen, nicht eine: ohne und mit dem Zurücklegen. Wer im Notfall Rücklagen,
//     aufbauende Budgets und Vorsorge aussetzt, kommt länger aus — und welche Annahme
//     gilt, entscheidet, wer liest, nicht die Karte.
//   • KEINE Farbe. Monate sind eine ungerichtete Grösse (`geldFarbe.ts`), und eine
//     Schwelle, ab der es „zu wenig" wäre, gibt es im Bestand nicht. Die Faustformel der
//     Rücklagen misst etwas anderes (Einnahmen auf Rücklagenkonten) und wird hier nicht
//     umgedeutet.
//   • Die ANNAHME steht offen darunter, nie eingeklappt: worüber gemittelt wurde und was
//     als frei gilt, ändert, was die Zahl bedeutet (`ui/CLAUDE.md`, „Drei Ränge"). Ohne
//     den Satz läse sich „6 Monate" als Tatsache.

import { useTranslation } from "react-i18next";
import type { Reichweitensicht } from "../../../application";
import { Card, KPIStat } from "../bausteine";
import { Zeile } from "../bausteine/Anordnung";
import { useEinstellungen, useGeld } from "../bausteine/einstellungenKontext";

export function ReichweiteKarte({ sicht }: { sicht: Reichweitensicht }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const { locale } = useEinstellungen();
  const r = sicht.reichweite;

  /** Ein Zehntel genau, wie gerechnet; eine glatte Zahl bleibt glatt. */
  const monate = (wert: number | null) => (wert == null ? "—" : wert.toLocaleString(locale, { maximumFractionDigits: 1 }));
  const kachel = (label: string, wert: number | null, kosten: number) => (
    <KPIStat
      size="tile"
      label={label}
      value={monate(wert)}
      unit={wert == null ? undefined : t("blickNachVorn.reichweite.einheit", { count: wert })}
      meta={t("blickNachVorn.reichweite.jeMonat", { betrag: geld.formatMitSymbol(kosten) })}
    />
  );

  return (
    <Card title={t("blickNachVorn.reichweite.titel")} subtitle={t("blickNachVorn.reichweite.untertitel")}>
      {!r ? (
        <p className="hinweis" style={{ margin: 0 }}>{t("blickNachVorn.reichweite.zuWenig", { count: sicht.mindestens })}</p>
      ) : r.ohneZuruecklegen == null && r.mitZuruecklegen == null ? (
        <p className="hinweis" style={{ margin: 0 }}>{t("blickNachVorn.reichweite.ohneKosten")}</p>
      ) : (
        <>
          <Zeile abstand={5} ausrichtung="start">
            {kachel(t("blickNachVorn.reichweite.ohneZuruecklegen"), r.ohneZuruecklegen, r.grundkosten)}
            {kachel(t("blickNachVorn.reichweite.mitZuruecklegen"), r.mitZuruecklegen, r.alleKosten)}
          </Zeile>
          {/* Die EINSCHRÄNKUNG: offen, auf jeder Breite. */}
          <p className="hinweis" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>
            {t("blickNachVorn.reichweite.hinweis", { count: r.monate, frei: geld.formatMitSymbol(r.frei) })}
          </p>
          {/* Nur, wenn sie einen gemittelten Monat trifft — ein Vorbehalt, der immer dasteht, wird überlesen. */}
          {sicht.ruecklagenUnvollstaendig && (
            <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("blickNachVorn.reichweite.ruecklagen")}</p>
          )}
        </>
      )}
    </Card>
  );
}
