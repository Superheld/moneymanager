// Was eine Zeile im Kontoauszug kaufmännisch IST — als Pille.
//
// Die Art wird hier NICHT bestimmt: sie kommt fertig aus der Sicht (`Registerzeile
// .einordnung`), und die liest sie aus `core/einordnung.ts`, derselben Stelle, aus der die
// Ergebnisrechnung der Übersicht rechnet. Diese Datei wählt nur Wort und Farbe. Wer hier
// eine Bedingung auf Charakter, Kategorie oder Vertrag schreibt, baut die zweite
// Sortierlogik, gegen die es die eine Stelle im Kern gibt.
//
// Liegt in `konten/` und nicht in `bausteine/`: benutzt wird sie nur vom Kontoauszug. Der
// Buchungsdialog sagt dasselbe als Satz (`buchung/EinordnungsBlock`), nicht als Pille.

import { useTranslation } from "react-i18next";
import type { Buchungseinordnung, Einordnungsart } from "../../../application";
import { Pill } from "../bausteine";
import type { PillVariante } from "../bausteine/Pill";

/**
 * Die Farbe folgt der Frage „kostet das den Monat?", nicht der Art einzeln:
 * grün, was hereinkommt; Akzent, was nur den Ort wechselt; kräftiger Rahmen, was schon
 * vorher bezahlt wurde (Rücklage). Alles, was den Monat als Kosten trifft, bleibt
 * neutral — auch „Ungeplant": es ist eine Auskunft und keine Mahnung, und eine
 * Warnfarbe an jeder zweiten Zeile läse nach einer Woche niemand mehr. Was auf eine
 * Zuordnung wartet, trägt den gestrichelten Rahmen des Geplanten: es ist noch offen.
 */
const VARIANTE: Record<Einordnungsart, PillVariante> = {
  einnahme: "ertrag",
  fixkosten: "neutral",
  laufend: "neutral",
  ungeplant: "neutral",
  ruecklage: "ist",
  vorsorge: "um",
  umbuchung: "um",
};

/** Der Text einer Pille — auch der Sortierwert der Spalte, damit beides dasselbe sagt. */
export function einordnungsText(
  t: (schluessel: string, werte?: Record<string, string>) => string,
  e: Buchungseinordnung,
): string {
  // Eine Rücklage mit Namen nennt ihn; eine Entnahme über eine alte Ausbuchung hat keinen.
  // Eine Buchung, die auf eine Zuordnung wartet, sagt das statt „Ungeplant": gerechnet
  // wird sie so, aber an ihr ist etwas zu tun.
  const schluessel = e.wartetAuf
    ? "wartet"
    : e.art === "ruecklage" && (e.budgetName || e.ruecklageId)
      ? "ruecklageBenannt"
      : e.art;
  return t(`einordnung.pille.${schluessel}`, { budget: e.budgetName ?? "—" });
}

/**
 * Die Pillen einer Zeile: eine, bei einer aufgeteilten Buchung je verschiedener
 * Einordnung eine. Nichts, wenn die Zeile keine Buchung ist.
 */
export function EinordnungsPillen({ einordnung }: { einordnung: readonly Buchungseinordnung[] }) {
  const { t } = useTranslation();
  if (einordnung.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "nowrap", maxWidth: "100%" }}>
      {einordnung.map((e, i) => {
        const text = einordnungsText(t, e);
        return (
          // Der title sitzt am Wrapper, nicht an der Pille — `Pill` kennt die Eigenschaft
          // nicht (dieselbe Regel wie bei Vertrag und Dublettenverdacht nebenan). Er
          // trägt den vollen Text, weil ein langer Budgetname abgeschnitten wird.
          <span key={i} title={text} style={{ display: "inline-flex", minWidth: 0, maxWidth: 190, overflow: "hidden" }}>
            <Pill variant={e.wartetAuf ? "plan" : VARIANTE[e.art]} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{text}</Pill>
          </span>
        );
      })}
    </span>
  );
}
