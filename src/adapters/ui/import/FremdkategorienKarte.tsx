// Was die Importdatei an Kategorien mitbringt — und was hier daraus wird.
//
// **Warum es diese Karte gibt.** Die Übersetzung der fremden Kategorien steckte als
// Tabelle im Adapter und wirkte unsichtbar: sie entschied mit, unter welcher Kategorie
// hunderte Zeilen ankommen, und war vor dem Übernehmen nirgends zu sehen. Das trug,
// solange die Tabelle zum Katalog passte — und **das ist die Annahme, die nicht hält**:
// jeder legt seine eigenen Kategorien an. Ein Ziel, das dieser Bestand nicht kennt, fiel
// wortlos durch; man sah es erst hinterher an den Zeilen in der Durchsicht, wenn
// überhaupt.
//
// Die Karte macht daraus eine Entscheidung, die man vor sich hat: welcher fremde Name wie
// oft vorkommt, worauf er hinausläuft, und ein Klick, um es zu ändern.
//
// **Die Wahl gilt für diesen Import.** Gemerkt wird sie nicht — dafür bräuchte es eine
// eigene Tabelle, denn ein fremdes Vokabular gehört zur QUELLE und nicht zum Katalog.
// Das ist der bewusst kleine Schritt: sichtbar und änderbar zuerst.
//
// **Zugeklappt, aber nicht stumm.** Im Regelfall stimmt die Zuordnung, und dann ist eine
// aufgeschlagene Tabelle über zwanzig Zeilen im Weg. Was nicht zugeklappt werden darf,
// ist der Fall, für den es die Karte gibt: eine Zuordnung, die ins Leere zeigt. Die Zahl
// dazu steht deshalb IN der Kopfzeile — wer nichts aufklappt, erfährt trotzdem, dass es
// etwas zu entscheiden gibt. Eine Karte, die zugeklappt schweigt, wäre keine Karte,
// sondern ein Versteck.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fremdkategorienbefund } from "../../../application/import";
import type { Kategorie } from "../../../application";
import { Card } from "../bausteine";
import { CategoryPicker } from "../bausteine/CategoryPicker";

const KOPF = {
  textAlign: "left",
  fontSize: "var(--fs-2xs)",
  fontWeight: "var(--fw-bold)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--ink-3)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
} as const;

export function FremdkategorienKarte({
  befund,
  kategorien,
  zuordnung,
  aufAenderung,
}: {
  befund: Fremdkategorienbefund;
  kategorien: readonly Kategorie[];
  /** Fremder Name → Kategorie-Id. Leer heisst „nicht zuordnen". */
  zuordnung: Record<string, string>;
  aufAenderung: (fremdName: string, kategorieId: string) => void;
}) {
  const { t } = useTranslation();
  // Aufgeklappt startet die Karte, sobald eine Zuordnung ins Leere zeigt — dann ist sie
  // nicht Beiwerk, sondern die offene Frage der Seite.
  const offeneZiele = befund.zeilen.filter(
    (z) => z.uebersetzung !== undefined && z.kategorieId === undefined,
  ).length;
  const [offen, setOffen] = useState(offeneZiele > 0);
  if (befund.zeilen.length === 0) return null;

  return (
    <Card
      style={{ marginTop: "var(--sp-4)" }}
      title={
        <button
          className="linkbtn"
          aria-expanded={offen}
          onClick={() => setOffen((x) => !x)}
          style={{ font: "inherit", color: "inherit" }}
        >
          {offen ? "▾" : "▸"} {t("import.fremd.titel")}
        </button>
      }
      subtitle={
        offen
          ? t("import.fremd.untertitel")
          : offeneZiele > 0
            ? t("import.fremd.kurzOffen", { n: befund.zeilen.length, offen: offeneZiele })
            : t("import.fremd.kurz", { n: befund.zeilen.length })
      }
    >
      {offen && (
      <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={KOPF}>{t("import.fremd.spalteQuelle")}</th>
            <th style={KOPF}>{t("import.fremd.spalteZiel")}</th>
          </tr>
        </thead>
        <tbody>
          {befund.zeilen.map((z) => {
            // Der Fall, um dessentwillen die Karte gebaut ist: die Tabelle hat eine
            // Meinung, und dieser Katalog kennt sie nicht. Vorher fiel die Zeile
            // stillschweigend ans Modell.
            const verwaist = z.uebersetzung !== undefined && z.kategorieId === undefined;
            return (
              <tr key={z.fremdName}>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" }}>
                  <div style={{ fontWeight: "var(--fw-bold)", color: "var(--ink)" }}>{z.fremdName}</div>
                  <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)" }}>
                    {t("import.buchungenAnzahl", { n: z.anzahl })}
                  </div>
                </td>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)" }}>
                  <CategoryPicker
                    kompakt
                    kategorien={[...kategorien]}
                    value={zuordnung[z.fremdName] ?? ""}
                    onChange={(id) => aufAenderung(z.fremdName, id)}
                    placeholder={t("import.fremd.nichtZuordnen")}
                    ariaLabel={t("import.fremd.zielFuer", { name: z.fremdName })}
                  />
                  {verwaist && (
                    <div style={{ fontSize: "var(--fs-2xs)", color: "var(--warn, #d9822b)", marginTop: 4 }}>
                      {t("import.fremd.zielFehlt", { name: z.uebersetzung })}
                    </div>
                  )}
                  {z.uebersetzung === undefined && (
                    <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)", marginTop: 4 }}>
                      {t("import.fremd.ohneUebersetzung")}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Was NICHT in der Tabelle steht, gehört trotzdem ins Bild: sonst sieht die
          Zuordnung nach „alle Zeilen der Datei" aus, und die Zahlen gehen nicht auf. */}
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
        {t("import.fremd.rest", { ohne: befund.ohneAngabe, um: befund.umbuchungen })}
      </div>
      </>
      )}
    </Card>
  );
}
