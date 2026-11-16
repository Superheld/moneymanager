// Der Verlauf EINER Rücklage — zwölf Monate als Balken mit dem Stand als Linie, darunter die
// Aufrechnung des gewählten Monats und die Buchungen, die sie in ihm getragen hat.
//
// Seit Paket 4 (ADR-0006) für jede Rücklage, beide Sorten; bis dahin hatte nur das
// aufbauende Budget einen Verlauf (`budgets/BudgetVerlauf`). Der Chart ist derselbe
// (`bausteine/BudgetVerlaufChart`, Form `ruecklage`), die Zahlen kommen fertig aus der
// Anwendungsschicht (`ruecklagenVerlauf`, `ruecklagenzeilenImMonat`) und rechnen gegen
// DIESELBE Sicht wie die Liste darüber.
//
// Eigene Karte NEBEN der Liste, nicht darin (`ui/CLAUDE.md`, keine Karte in einer Karte).

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ruecklagenVerlauf,
  ruecklagenzeilenImMonat,
  type IstBuchung,
  type Ruecklage,
  type Ruecklagensicht,
} from "../../../application";
import { Button, Card } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Buchungsliste } from "../bausteine/Buchungsliste";
import { BudgetVerlaufChart } from "../bausteine/BudgetVerlaufChart";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";
import { Fortschreibung } from "./Fortschreibung";

export function RuecklageVerlauf({
  sicht,
  ruecklage,
  heute,
  onSchliessen,
  onBuchung,
}: {
  sicht: Ruecklagensicht;
  ruecklage: Ruecklage;
  heute: string;
  onSchliessen: () => void;
  /** Klick auf eine Buchung der Liste — der Screen öffnet sie und rechnet danach neu. */
  onBuchung?: (buchung: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const monate = useMemo(() => ruecklagenVerlauf(sicht, ruecklage, heute, 12), [sicht, ruecklage, heute]);
  // Vorbelegt ist der letzte Monat — derselbe, den die Zeile darüber zeigt.
  const [gewaehlt, setGewaehlt] = useState(monate.length - 1);
  const monat = monate[Math.min(gewaehlt, monate.length - 1)];
  const zeilen = useMemo(() => (monat ? ruecklagenzeilenImMonat(sicht, ruecklage, monat) : []), [sicht, ruecklage, monat]);
  const titel = t("ruecklagen.verlaufTitel", { name: ruecklage.bezeichnung });
  const schliessen = <Button variant="ghost" onClick={onSchliessen}>{t("budgets.verlaufSchliessen")}</Button>;

  if (!monat) {
    return (
      <Card title={titel} action={schliessen}>
        <div className="muted">{t("ruecklagen.verlaufVorBeginn")}</div>
      </Card>
    );
  }

  return (
    <Card
      title={titel}
      subtitle={t("budgets.verlaufUntertitel", { monate: monate.length })}
      action={
        <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Auswahl
            ariaLabel={t("budgets.verlaufMonatWaehlen")}
            wert={String(gewaehlt)}
            aufAenderung={(v) => setGewaehlt(Number(v))}
            optionen={monate.map((m, i) => ({ wert: String(i), text: m.monat }))}
          />
          {schliessen}
        </span>
      }
    >
      <BudgetVerlaufChart monate={monate} art="ruecklage" aktivIndex={gewaehlt} onMonatClick={setGewaehlt} />
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap",
          marginTop: "var(--sp-4)", padding: "9px 10px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <span style={{ fontWeight: "var(--fw-bold)" }}>{monat.monat}</span>
        <span style={{ display: "inline-flex", gap: "var(--sp-3)", alignItems: "baseline", flexWrap: "wrap" }}>
          <Fortschreibung monat={monat} />
          <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap", fontWeight: "var(--fw-bold)", color: geldFarbe(monat.rest) }}>
            {geld.formatMitSymbol(monat.rest)}
          </span>
        </span>
      </div>
      <Buchungsliste zeilen={zeilen} leer={t("ruecklagen.verlaufMonatLeer", { monat: monat.monat })} onBuchung={onBuchung} summe />
    </Card>
  );
}
