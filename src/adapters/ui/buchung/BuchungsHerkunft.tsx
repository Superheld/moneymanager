// Woher diese Zeile kommt — alles, was über sie bekannt ist und hier nicht geändert wird.
//
// Eigene Datei seit dem Entzerren von `BuchungDetail.tsx` (2026-08-25). Der Abschnitt ist
// reine ANZEIGE: er nimmt entgegen, was da ist, und meldet nichts zurück. Damit ist er
// der Teil des Formulars, der am wenigsten mit dem Rest zu tun hat.
//
// Nicht zu verwechseln mit `konten/HerkunftBereich`: der zeigt, was für ein KONTO in der
// Datenbank steht (alle eingelesenen Zeilen). Hier geht es um eine einzelne Buchung.

import { useTranslation } from "react-i18next";
import { useState, type ReactNode } from "react";
import type { IstBuchung } from "../../../application";
import type { ImportLauf, Umsatz } from "../../../application/import";

/** Ein Label/Wert-Paar im Herkunfts-Abschnitt. Lange Werte (Hash, Zweck) dürfen umbrechen. */
function Infozeile({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "var(--sp-3)", padding: "5px 0", alignItems: "baseline" }}>
      <span style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: "break-word", fontFamily: mono ? "var(--font-mono, monospace)" : undefined, color: mono ? "var(--ink-2)" : "var(--ink)" }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Der Herkunfts-Abschnitt. Rendert nichts, solange es weder Buchung noch Entwurf gibt —
 * beim Anlegen von Hand ist noch nichts bekannt, was hier stehen könnte.
 *
 * **Zugeklappt, solange niemand danach fragt.** Der Abschnitt ist bis zu sieben Zeilen
 * lang und steht ganz unten im Dialog; er beantwortet die Frage „woher kommt das", die
 * man selten und dann gezielt stellt. Ausgeklappt schob er den Dialog über die
 * Fensterhöhe hinaus, und die Knöpfe, die man wirklich braucht, wanderten aus dem Bild.
 * Dieselbe Form wie bei der Erkennung darüber (`MerkmaleBlock`) — zwei Abschnitte, die
 * beide „auf Nachfrage" sind, sollen auch gleich aussehen.
 */
export function BuchungsHerkunft({
  buchung,
  entwurf,
  umsatz,
  importLauf,
}: {
  buchung?: IstBuchung;
  entwurf?: Umsatz;
  /** Der Beleg: beim Entwurf er selbst, bei einer Buchung der Umsatz dahinter. */
  umsatz?: Umsatz;
  importLauf?: ImportLauf;
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  if (!buchung && !entwurf) return null;

  return (
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      <button className="linkbtn" onClick={() => setOffen((x) => !x)} aria-expanded={offen}>
        {offen ? "▾" : "▸"} {t("konten.detail.herkunft")}
      </button>

      {offen && (
        <div style={{ marginTop: 8 }}>
          {buchung && <Infozeile label={t("konten.detail.erfasstUeber")}>{t(`konten.quelleName.${buchung.quelle}`)}</Infozeile>}

          {umsatz ? (
            <>
              <Infozeile label={t("konten.detail.empfaenger")}>{umsatz.gegenpartei || "—"}</Infozeile>
              <Infozeile label={t("konten.detail.zweck")}>{umsatz.verwendungszweck || "—"}</Infozeile>
              {importLauf && (
                <Infozeile label={t("konten.detail.importlauf")}>
                  {t("konten.detail.importlaufWert", {
                    quelle: importLauf.dateiname || importLauf.quelle,
                    zeitpunkt: importLauf.zeitpunkt.slice(0, 10),
                  })}
                </Infozeile>
              )}
              {umsatz.nativeId && <Infozeile label={t("konten.detail.nativeId")} mono>{umsatz.nativeId}</Infozeile>}
              <Infozeile label={t("konten.detail.rohHash")} mono>{umsatz.rohHash}</Infozeile>
            </>
          ) : (
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.detail.ohneImport")}</div>
          )}

        </div>
      )}
    </div>
  );
}
