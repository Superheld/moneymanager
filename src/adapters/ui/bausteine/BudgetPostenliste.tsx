// Woraus der Verbrauch eines Budgets in einem Monat besteht — die Buchungen selbst, nicht
// noch eine Zahl. Die Liste kommt aus `budgetPostenZu`/`budgetPostenImMonat`, also aus
// derselben Auswahl, die auch den Verbrauch summiert; sie kann gar nicht anders ausfallen
// als der Balken darüber.
//
// Baustein, weil sie zwei Bereiche bedient: die Übersicht klappt sie unter einer Budgetzeile
// auf, der Verlauf unter Budgets zeigt sie für den im Chart gewählten Monat. Sie lag vorher
// in `UebersichtScreen.tsx` und wäre beim zweiten Aufrufer nachgebaut worden.
//
// Gezeichnet wird sie seit 2026-11-09 mit `Aufklapptabelle` — derselben Fläche und Tabelle
// wie die Buchungen einer Kategorie in der Analyse. Vorher baute sie ihre Zeilen selbst,
// und dasselbe Aufklappen sah hier anders aus als dort.

import { useTranslation } from "react-i18next";
import type { IstBuchung, Verbrauchsposten } from "../../../application";
import { AUFKLAPP_ZEILEN_BREIT } from "./aufklappen";
import { Aufklapptabelle } from "./Aufklapptabelle";
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
  /**
   * Spaltenköpfe über den Buchungen (Datum · Buchung · Betrag).
   *
   * Optional, weil die Liste an zwei Stellen hängt, die verschieden viel Platz haben: im
   * Verlauf steht sie über die volle Kartenbreite und ist dort die Hauptsache, in der
   * Übersicht hängt sie in einer halben Karte unter einer Zeile, die schon sagt, was
   * darunter kommt. Die Köpfe stehen beim Scrollen fest, sonst wären sie nach den
   * ersten Zeilen weg.
   */
  kopf?: boolean;
}

/** Feste Breite der Datumsspalte — damit fluchten Kopf und Zeilen. */
const DATUM_BREITE = "8ch";

export function BudgetPostenliste({ posten, empfaenger, kategorieNamen, verbraucht, leerText, zeilen = AUFKLAPP_ZEILEN_BREIT, onBuchung, kopf = false }: BudgetPostenlisteProps) {
  const { t } = useTranslation();
  const geld = useGeld();

  const nameVon = (p: Verbrauchsposten) =>
    p.buchung.notiz ||
    empfaenger.get(p.buchung.id) ||
    (p.kategorieId ? kategorieNamen.get(p.kategorieId) : undefined) ||
    t("uebersicht.budgetBuchung");

  return (
    <Aufklapptabelle
      zeilen={posten}
      schluessel={(p, i) => `${p.buchung.id}#${i}`}
      sichtbar={zeilen}
      kopf={kopf}
      leer={leerText ?? t("uebersicht.budgetOhneBuchungen")}
      onZeile={onBuchung ? (p) => onBuchung(p.buchung) : undefined}
      zeilenTitel={t("uebersicht.buchungOeffnen")}
      spalten={[
        {
          key: "datum",
          label: t("uebersicht.budgetKopfDatum"),
          breite: DATUM_BREITE,
          gedimmt: true,
          fett: true,
          render: (p) => `${p.buchung.datum.slice(8)}.${p.buchung.datum.slice(5, 7)}.${p.buchung.datum.slice(2, 4)}`,
        },
        {
          key: "buchung",
          label: t("uebersicht.budgetKopfBuchung"),
          kappen: true,
          render: (p) => {
            const name = nameVon(p);
            const kategorie = p.kategorieId ? kategorieNamen.get(p.kategorieId) : undefined;
            return (
              <span title={name}>
                <span style={{ color: "var(--ink-2)" }}>{name}</span>
                {kategorie && kategorie !== name && (
                  <span style={{ color: "var(--ink-3)", fontSize: "11.5px", marginLeft: 8 }}>{kategorie}</span>
                )}
              </span>
            );
          },
        },
        {
          key: "betrag",
          label: t("uebersicht.budgetKopfBetrag"),
          align: "right",
          render: (p) => <span style={{ fontWeight: "var(--fw-semi)" }}>{geld.format(p.betrag)}</span>,
        },
      ]}
      fuss={
        <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 8px 5px", borderTop: "1px solid var(--line)", fontSize: "12.5px", fontWeight: "var(--fw-bold)" }}>
          {/* Ist die Summe negativ, kam unterm Strich Geld ZURÜCK. Das Wort „Verbraucht"
              über einem Minusbetrag behauptet das Gegenteil dessen, was daneben steht —
              und ein Wort gewinnt gegen ein Vorzeichen. Die EINZELNEN Posten behalten ihres:
              dort widerspricht ihm keins. */}
          <span>{t(verbraucht < 0 ? "uebersicht.budgetSummeZurueck" : "uebersicht.budgetSumme")}</span>
          <span className="num">{geld.formatMitSymbol(Math.abs(verbraucht))}</span>
        </div>
      }
    />
  );
}
