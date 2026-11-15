// Was diese Buchung kaufmännisch ist — als Satz, der auch sagt, WARUM.
//
// Die Pille im Kontoauszug nennt nur die Art. Hier steht die eigentliche Hilfe für
// jemanden ohne Rechnungswesen: „Fixkosten" erklärt nichts, „zählt als Fixkosten, weil sie
// dem Vertrag … zugeordnet ist" sagt, woran es hängt — und damit auch, was man ändern
// müsste, damit es anders zählt. Vor allem bei den beiden Arten, die NICHT als Kosten
// des Monats zählen (aus Budget, aus Rücklage), ist der Satz die Antwort auf „warum
// taucht diese grosse Ausgabe in der Übersicht nicht auf".
//
// Reine Anzeige wie `BuchungsHerkunft`: nimmt entgegen, meldet nichts zurück. Und wie die
// Pille bestimmt der Block nichts selbst — die Einordnung kommt aus `buchungsdetail()`
// und dort aus `core/einordnung.ts`. Er wählt nur den Satz zur Art.
//
// Gezeigt wird der GESPEICHERTE Stand. Wer im Formular darüber die Kategorie umstellt,
// sieht den neuen Satz nach dem Speichern — eine Vorschau müsste die Regel aus dem Kern
// hier nachbauen, und genau das soll es nicht geben.

import { useTranslation } from "react-i18next";
import type { Buchungseinordnung } from "../../../application";

/** Der Schlüssel des Satzes — zwei Arten haben zwei Begründungen. */
function grundSchluessel(e: Buchungseinordnung): string {
  if (e.art === "fixkosten") return e.vertragsname ? "einordnung.grund.fixkosten" : "einordnung.grund.fixkostenOhneName";
  // Aufs Vorsorgekonto überwiesen oder ohne Gegenbein aus der App hinaus: dieselbe Art,
  // aber wer den Satz liest, will wissen, welcher der beiden Fälle seiner ist.
  if (e.art === "vorsorge") return e.intern ? "einordnung.grund.vorsorgeKonto" : "einordnung.grund.vorsorgeUmschichtung";
  return `einordnung.grund.${e.art}`;
}

export function EinordnungsBlock({ einordnung }: { einordnung: readonly Buchungseinordnung[] }) {
  const { t } = useTranslation();
  if (einordnung.length === 0) return null;

  return (
    <div className="abschnitt" role="group" aria-label={t("einordnung.titel")}>
      <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
        {t("einordnung.titel")}
      </div>
      {einordnung.length > 1 && (
        <div className="hinweis" style={{ marginBottom: 6 }}>{t("einordnung.geteilt")}</div>
      )}
      {einordnung.map((e, i) => (
        <div key={i} style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", marginTop: i > 0 ? 6 : 0 }}>
          {t(grundSchluessel(e), { budget: e.budgetName ?? "—", vertrag: e.vertragsname ?? "" })}
        </div>
      ))}
    </div>
  );
}
