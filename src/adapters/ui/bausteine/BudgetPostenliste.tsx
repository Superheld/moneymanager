// Woraus der Verbrauch eines Budgets in einem Monat besteht — die Buchungen selbst, nicht
// noch eine Zahl. Die Liste kommt aus `budgetPostenZu`/`budgetPostenImMonat`, also aus
// derselben Auswahl, die auch den Verbrauch summiert; sie kann gar nicht anders ausfallen
// als der Balken darüber.
//
// Baustein, weil sie zwei Bereiche bedient: die Übersicht klappt sie unter einer Budgetzeile
// auf, der Verlauf unter Budgets zeigt sie für den im Chart gewählten Monat. Sie lag vorher
// in `UebersichtScreen.tsx` und wäre beim zweiten Aufrufer nachgebaut worden.
//
// Bewusst KEINE Karte: sie hängt unter einer Zeile, die schon in einer steckt (siehe
// `ui/CLAUDE.md`). Eine getönte Fläche mit Radius reicht, um sie abzusetzen.

import { useTranslation } from "react-i18next";
import type { IstBuchung, Verbrauchsposten } from "../../../application";
import { AUFKLAPP_ZEILEN_BREIT, aufklappHoehe } from "./aufklappen";
import { useGeld } from "./einstellungenKontext";

export interface BudgetPostenlisteProps {
  posten: readonly Verbrauchsposten[];
  /** Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung. */
  empfaenger: ReadonlyMap<string, string>;
  kategorieNamen: ReadonlyMap<string, string>;
  /** Die Summe darunter — sie kommt von aussen, damit dieselbe Zahl steht wie in der Zeile. */
  verbraucht: number;
  /** Was über der Liste steht, wenn sie leer ist. Ohne Angabe der Standardtext. */
  leerText?: string;
  /**
   * Wieviele Zeilen sichtbar bleiben, bevor gescrollt wird.
   *
   * Steht hier und nicht fest im Baustein, weil dieselbe Liste in zwei verschiedenen
   * Breiten hängt: im Verlauf über die volle Kartenbreite, in der Übersicht in einer
   * halben Karte neben einer zweiten, die mitwächst. Die Regel dazu steht in
   * `aufklappen.ts`; ohne Angabe gilt die breite.
   */
  zeilen?: number;
  /**
   * Klick auf eine Zeile — sie öffnet die Buchung.
   *
   * Optional, weil die Liste damit von einer ANZEIGE zu einem Weg wird, und wer sie
   * einbaut, muss den Dialog dahinter auch anbieten. Ohne die Angabe bleiben die Zeilen
   * Text; ein Knopf, der nichts tut, wäre schlechter als keiner.
   */
  onBuchung?: (buchung: IstBuchung) => void;
}

export function BudgetPostenliste({ posten, empfaenger, kategorieNamen, verbraucht, leerText, zeilen = AUFKLAPP_ZEILEN_BREIT, onBuchung }: BudgetPostenlisteProps) {
  const { t } = useTranslation();
  const geld = useGeld();

  if (posten.length === 0) {
    return (
      <div className="muted" style={{ fontSize: "var(--fs-xs)", padding: "8px 0 2px" }}>
        {leerText ?? t("uebersicht.budgetOhneBuchungen")}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-2, rgba(0,0,0,.015))",
        borderRadius: "var(--r-md)",
        padding: "4px 10px",
        margin: "8px 0 2px",
        // Die 30 px sind die gerechnete Zeilenhöhe unten: 5 px Polsterung oben und unten,
        // eine Textzeile in 12,5 px und die Haarlinie darunter.
        maxHeight: aufklappHoehe(zeilen, 30),
        overflowY: "auto",
      }}
    >
      {posten.map((p, i) => {
        const kategorie = p.kategorieId ? kategorieNamen.get(p.kategorieId) : undefined;
        const name =
          p.buchung.notiz || empfaenger.get(p.buchung.id) || kategorie || t("uebersicht.budgetBuchung");
        const inhalt = (
          <>
            <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
              {p.buchung.datum.slice(8)}.{p.buchung.datum.slice(5, 7)}.{p.buchung.datum.slice(2, 4)}
            </span>
            <span title={name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
              {name}
            </span>
            {kategorie && kategorie !== name && (
              <span style={{ color: "var(--ink-3)", fontSize: "11.5px", flex: "0 0 auto" }}>{kategorie}</span>
            )}
            <span className="num" style={{ marginLeft: "auto", flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>
              {geld.format(p.betrag)}
            </span>
          </>
        );
        // Dieselbe Zeile, einmal als Text und einmal als Knopf. Das Aussehen darf sich
        // dabei NICHT unterscheiden — der Unterschied ist der Weg, nicht die Zeile.
        const zeilenstil = { display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: "12.5px", borderBottom: i < posten.length - 1 ? "1px solid var(--line-soft)" : "none" } as const;
        return onBuchung ? (
          <button
            key={`${p.buchung.id}#${i}`}
            type="button"
            className="buchungszeile"
            title={t("uebersicht.buchungOeffnen")}
            style={zeilenstil}
            onClick={() => onBuchung(p.buchung)}
          >
            {inhalt}
          </button>
        ) : (
          <div key={`${p.buchung.id}#${i}`} style={zeilenstil}>
            {inhalt}
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0 5px", borderTop: "1px solid var(--line)", fontSize: "12.5px", fontWeight: "var(--fw-bold)" }}>
        {/* Ist die Summe negativ, kam unterm Strich Geld ZURÜCK. Das Wort „Verbraucht"
            über einem Minusbetrag behauptet das Gegenteil dessen, was daneben steht —
            und ein Wort gewinnt gegen ein Vorzeichen. Die EINZELNEN Posten behalten ihres:
            dort widerspricht ihm keins. */}
        <span>{t(verbraucht < 0 ? "uebersicht.budgetSummeZurueck" : "uebersicht.budgetSumme")}</span>
        <span className="num">{geld.formatMitSymbol(Math.abs(verbraucht))}</span>
      </div>
    </div>
  );
}
