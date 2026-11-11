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
  type IstBuchung,
} from "../../../application";
import { Button, Card } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { BudgetFortschreibung } from "../bausteine/BudgetFortschreibung";
import { BudgetPostenliste } from "../bausteine/BudgetPostenliste";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";
import { BudgetVerlaufChart } from "./BudgetVerlaufChart";
import { Collapsible } from "@base-ui/react/collapsible";

interface Props {
  sicht: BudgetSicht;
  stand: Budgetstand;
  /** Heute als ISO — der Verlauf endet im Monat dieses Datums. */
  heute: string;
  kategorieNamen: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  onSchliessen: () => void;
  /**
   * Klick auf eine Buchung der Liste — der Bildschirm darüber öffnet sie.
   *
   * Nicht hier: der Verlauf ist eine ANZEIGE und weiss nichts vom Nachladen. Wer den
   * Dialog aufmacht, muss danach die Sicht neu rechnen lassen, und die gehört dem Screen.
   */
  onBuchung?: (buchung: IstBuchung) => void;
}

export function BudgetVerlauf({ sicht, stand, heute, kategorieNamen, empfaenger, onSchliessen, onBuchung }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();

  const monate = useMemo(() => budgetVerlauf(sicht, stand.budget, heute, 12), [sicht, stand.budget, heute]);
  /**
   * Vorbelegt ist der letzte Monat — derselbe, den die Zeile darüber zeigt. Ohne Auswahl
   * stünde unter dem Chart eine leere Fläche, und der erste Klick ginge dafür drauf,
   * etwas zu sehen, das man schon gelesen hat.
   */
  const [gewaehlt, setGewaehlt] = useState(monate.length - 1);
  /**
   * Ob die Buchungen des Monats aufgeklappt sind. Vorbelegt OFFEN — wer einen Monat im
   * Chart anklickt, will sehen, was drin ist; dieselbe Wahl klappt ihn deshalb auch
   * wieder auf, falls er zu war.
   */
  const [offen, setOffen] = useState(true);
  const waehle = (i: number) => {
    setGewaehlt(i);
    setOffen(true);
  };
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
            aufAenderung={(v) => waehle(Number(v))}
            optionen={monate.map((m, i) => ({ wert: String(i), text: m.monat }))}
          />
          <Button variant="ghost" onClick={onSchliessen}>{t("budgets.verlaufSchliessen")}</Button>
        </span>
      }
    >
      <BudgetVerlaufChart
        monate={monate}
        art={stand.budget.art === "aufbauend" ? "aufbauend" : "monatlich"}
        aktivIndex={gewaehlt}
        onMonatClick={waehle}
      />

      {/* Die Monatszeile sieht aus wie eine aufgeklappte Zeile der Monatskarten in der
          Übersicht (Pfeil, getönte Fläche, Liste direkt darunter) und verhält sich auch so:
          ein Klick klappt die Buchungen zu. Vorher stand sie als lose Textzeile über der
          Liste, und man sah nicht, dass beides zusammengehört.
          Base UI `Collapsible`: Rolle, Tasten und `aria-controls` kommen von dort; die Zeile
          bleibt ein `div`, damit ihr Flex-Layout unverändert bleibt. */}
      <Collapsible.Root open={offen} onOpenChange={setOffen}>
      <Collapsible.Trigger
        nativeButton={false}
        render={<div />}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
          marginTop: "var(--sp-4)",
          padding: "9px 10px",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line-soft)",
          cursor: "pointer",
          background: offen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "var(--fw-bold)" }}>
            <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{offen ? "▾" : "▸"}</span>
            {monat.monat}
          </span>
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
      </Collapsible.Trigger>

      <Collapsible.Panel>
        <BudgetPostenliste
          posten={posten}
          empfaenger={empfaenger}
          kategorieNamen={kategorieNamen}
          verbraucht={monat.verbraucht}
          leerText={t("budgets.verlaufMonatLeer", { monat: monat.monat })}
          onBuchung={onBuchung}
          kopf
        />
      </Collapsible.Panel>
      </Collapsible.Root>
    </Card>
  );
}
