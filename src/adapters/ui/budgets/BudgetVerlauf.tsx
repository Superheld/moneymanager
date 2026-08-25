// Der Verlauf EINES Budgets — zwölf Monate als Balken, darunter die Buchungen des
// gewählten Monats.
//
// Eigene Karte NEBEN der Liste, nicht darin: die Liste steckt schon in einer Karte, und
// eine zweite darin wäre zwei Rahmen um dieselbe Sache (siehe `ui/CLAUDE.md`). Sie steht
// unmittelbar darunter, damit die Zeile, von der man ausgegangen ist, im Blick bleibt.
//
// Gerechnet wird hier nichts: `budgetVerlauf` und `budgetPostenImMonat` kommen fertig aus
// der Anwendungsschicht und arbeiten auf DERSELBEN Sicht wie die Liste darüber. Ein
// eigener Ladevorgang je aufgeklappter Zeile rechnete gegen einen womöglich anderen
// Bestand als die Zeile selbst.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  budgetPostenImMonat,
  budgetVerlauf,
  type BudgetSicht,
  type Budgetstand,
} from "../../../application";
import { Button, Card } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { BudgetFortschreibung } from "../bausteine/BudgetFortschreibung";
import { BudgetPostenliste } from "../bausteine/BudgetPostenliste";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";
import { BudgetVerlaufChart } from "./BudgetVerlaufChart";

interface Props {
  sicht: BudgetSicht;
  stand: Budgetstand;
  /** Heute als ISO — der Verlauf endet im Monat dieses Datums. */
  heute: string;
  kategorieNamen: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  onSchliessen: () => void;
}

export function BudgetVerlauf({ sicht, stand, heute, kategorieNamen, empfaenger, onSchliessen }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();

  const monate = useMemo(() => budgetVerlauf(sicht, stand.budget, heute, 12), [sicht, stand.budget, heute]);
  /**
   * Vorbelegt ist der letzte Monat — derselbe, den die Zeile darüber zeigt. Ohne Auswahl
   * stünde unter dem Chart eine leere Fläche, und der erste Klick ginge dafür drauf,
   * etwas zu sehen, das man schon gelesen hat.
   */
  const [gewaehlt, setGewaehlt] = useState(monate.length - 1);
  const monat = monate[Math.min(gewaehlt, monate.length - 1)];

  const posten = useMemo(
    () => (monat ? budgetPostenImMonat(sicht, stand.budget, monat) : []),
    [sicht, stand.budget, monat],
  );

  if (monate.length === 0) {
    return (
      <Card title={t("budgets.verlaufTitel", { name: stand.kategorieName })} action={<Button variant="ghost" onClick={onSchliessen}>{t("budgets.verlaufSchliessen")}</Button>}>
        <div className="muted">{t("budgets.verlaufVorStart")}</div>
      </Card>
    );
  }

  return (
    <Card
      title={t("budgets.verlaufTitel", { name: stand.kategorieName })}
      subtitle={t("budgets.verlaufUntertitel", { monate: monate.length })}
      action={
        <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Auswahl
            ariaLabel={t("budgets.verlaufMonatWaehlen")}
            wert={String(gewaehlt)}
            aufAenderung={(v) => setGewaehlt(Number(v))}
            optionen={monate.map((m, i) => ({ wert: String(i), text: m.monat }))}
          />
          <Button variant="ghost" onClick={onSchliessen}>{t("budgets.verlaufSchliessen")}</Button>
        </span>
      }
    >
      <BudgetVerlaufChart
        monate={monate}
        aktivIndex={gewaehlt}
        onMonatClick={(i) => setGewaehlt(i)}
      />

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}
      >
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "var(--fw-bold)" }}>{monat.monat}</span>
          {/* Die Stufe im Chart braucht ihren Grund neben sich, sonst liest sie sich wie
              ein Rechenfehler. */}
          {monat.zufuehrungVorher != null && (
            <span style={{ fontSize: "var(--fs-2xs)", color: "var(--accent-deep)", fontWeight: "var(--fw-semi)" }}>
              {t("budgets.rahmenGeaendert", {
                vorher: geld.formatMitSymbol(monat.zufuehrungVorher),
                jetzt: geld.formatMitSymbol(monat.zufuehrung),
              })}
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", gap: "var(--sp-3)", alignItems: "baseline", flexWrap: "wrap" }}>
          {/* Der Übertrag hat nur beim Aufbauenden etwas zu sagen: beim Monatlichen ist er
              immer 0, und eine Zeile „Übertrag 0,00" wäre eine Aussage über nichts. */}
          {stand.budget.art === "aufbauend" && !monat.ohnePlan && <BudgetFortschreibung monat={monat} />}
          {/* Ohne Rahmen gibt es keinen Rest — „−70,00 von 0,00" läse sich als heftig
              überzogen, obwohl damals niemand etwas überzogen hat. */}
          {monat.ohnePlan ? (
            <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap" }}>
              <span className="muted">{t(monat.verbraucht < 0 ? "budgets.verlaufOhnePlanZurueck" : "budgets.verlaufOhnePlan", { verbraucht: geld.formatMitSymbol(Math.abs(monat.verbraucht)) })}</span>
            </span>
          ) : (
            <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(monat.rest) }}>{geld.format(monat.rest)}</span>
              <span className="muted"> {t("uebersicht.vonRahmen", { rahmen: geld.formatMitSymbol(monat.verfuegbar) })}</span>
            </span>
          )}
        </span>
      </div>

      <BudgetPostenliste
        posten={posten}
        empfaenger={empfaenger}
        kategorieNamen={kategorieNamen}
        verbraucht={monat.verbraucht}
        leerText={t("budgets.verlaufMonatLeer", { monat: monat.monat })}
      />
    </Card>
  );
}
