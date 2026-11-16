// Die Rücklagenvorschläge — wofür sich nach den bisherigen Ausgaben eine Rücklage lohnt.
//
// Bis 2026-11-16 standen sie im Bereich Budgets, in derselben Tabelle wie die Budgets und
// mit einer Spalte „Art" davor. Wer dort übernahm, bekam den Dialog einer Rücklage, und
// das Ergebnis stand danach hier — der Vorschlag lag also im falschen Bereich. Jetzt
// schlägt jeder Bereich nur vor, was in ihm landet; eingestuft wird an einer Stelle
// (`application/ausgabenvorschlaege.ts`), damit keine Kategorie in beiden Karten steht.
//
// Die Spalten folgen der Karte der Budgets, bis auf eine: die Schwankung fehlt. Bei einer
// Rücklage ist der eine teure Monat der Zweck, nicht der Ausreisser; eine Warnpille
// stünde als Warnung vor dem Erwarteten da.
//
// Ist nichts vorzuschlagen, steht die Karte nicht da — ein Nachtrag, kein Einstieg.

import { useTranslation } from "react-i18next";
import type { Ruecklagenvorschlag } from "../../../application";
import { Card, DataTable } from "../bausteine";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { useGeld } from "../bausteine/einstellungenKontext";

export function VorschlaegeKarte({
  vorschlaege,
  onUebernehmen,
  onVerwerfen,
}: {
  vorschlaege: readonly Ruecklagenvorschlag[];
  onUebernehmen: (v: Ruecklagenvorschlag) => void;
  onVerwerfen: (v: Ruecklagenvorschlag) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (vorschlaege.length === 0) return null;

  return (
    <Card
      title={t("ruecklagen.vorschlaege.titel")}
      subtitle={t("ruecklagen.vorschlaege.untertitel", { count: vorschlaege.length })}
    >
      <p className="hinweis" style={{ margin: "0 0 var(--sp-3)" }}>
        {t("ruecklagen.vorschlaege.hinweis")}
      </p>
      <DataTable
        sortable
        pageSize={10}
        columns={[
          { key: "kategorie", label: t("ruecklagen.vorschlaege.spalteKategorie"), render: (v: Ruecklagenvorschlag) => v.name },
          {
            key: "bisher",
            label: `${t("ruecklagen.vorschlaege.spalteBisher")} ${geld.symbol}`,
            align: "right",
            sortValue: (v: Ruecklagenvorschlag) => v.proMonat,
            render: (v: Ruecklagenvorschlag) => geld.format(v.proMonat),
          },
          {
            // Was ein Vertrag abbucht, trägt keine Rücklage — der Abzug steht deshalb da.
            key: "vertrag",
            label: `${t("ruecklagen.vorschlaege.spalteVertraglich")} ${geld.symbol}`,
            align: "right",
            sortValue: (v: Ruecklagenvorschlag) => v.vertragsanteil,
            render: (v: Ruecklagenvorschlag) => (v.vertragsanteil > 0 ? geld.format(-v.vertragsanteil) : "—"),
          },
          {
            key: "vorschlag",
            label: `${t("ruecklagen.vorschlaege.spalteVorschlag")} ${geld.symbol}`,
            align: "right",
            sortValue: (v: Ruecklagenvorschlag) => v.vorschlag,
            render: (v: Ruecklagenvorschlag) => <b>{geld.format(v.vorschlag)}</b>,
          },
          { key: "monate", label: t("ruecklagen.vorschlaege.spalteMonate"), align: "right", render: (v: Ruecklagenvorschlag) => String(v.monate) },
          {
            key: "_a",
            label: "",
            align: "right",
            sortable: false,
            render: (v: Ruecklagenvorschlag) => (
              <IconLeiste>
                <IconButton icon="uebernehmen" label={t("ruecklagen.vorschlaege.uebernehmen")} onClick={() => onUebernehmen(v)} />
                <IconButton icon="verwerfen" label={t("ruecklagen.vorschlaege.verwerfen")} onClick={() => onVerwerfen(v)} />
              </IconLeiste>
            ),
          },
        ]}
        rows={[...vorschlaege]}
      />
    </Card>
  );
}
