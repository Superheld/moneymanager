// Die Wahl des Zeitraums — dieselbe Liste in jedem Register der Analyse, aber je Register
// mit EIGENEM Wert (seit 2026-11-11).
//
// Bis dahin teilten sich die Register einen Zustand: wer in den Befunden auf zwei Jahre
// stellte, fand Verlauf und Depot auch auf zwei Jahren — und wer im Verlauf einen Monat
// anklickte, fand ihn in den Kategorien wieder. Das war als Bequemlichkeit gemeint und
// las sich als Verwechslung: jedes Register beantwortet seine eigene Frage, und was man
// in einem einstellt, soll das andere nicht verschieben.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Zeitraum } from "../../../application";
import { Auswahl } from "../bausteine/Auswahl";

export function ZeitraumWahl({ wert, aufAenderung }: { wert: Zeitraum; aufAenderung: (z: Zeitraum) => void }) {
  const { t } = useTranslation();
  return (
    <Auswahl
      ariaLabel={t("historie.zeitraumWaehlen")}
      wert={wert}
      aufAenderung={(v) => aufAenderung(v as Zeitraum)}
      optionen={[
        { wert: "12", text: t("historie.zr12") },
        { wert: "24", text: t("historie.zr24") },
        { wert: "jahr", text: t("historie.zrJahr") },
        { wert: "alles", text: t("historie.zrAlles") },
      ]}
    />
  );
}

/** Die Filter einer Karte, in Tabellengrösse nebeneinander. */
export function Filterleiste({ children }: { children: ReactNode }) {
  return (
    <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
      {children}
    </span>
  );
}

/** Für Register ohne eigene Karte (Befunde, Depot): die Leiste rechtsbündig darüber. */
export function Filterzeile({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--sp-3)" }}>
      <Filterleiste>{children}</Filterleiste>
    </div>
  );
}
