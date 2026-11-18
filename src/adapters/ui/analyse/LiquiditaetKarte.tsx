// „Reicht das Geld?" — die Liquiditätsvorschau je Konto, taggenau.
//
// Die Rechnung dahinter (`core/liquiditaet.ts`) stand bis 2026-11-08 als Karte
// „Da ist etwas zu tun" ganz oben in der Übersicht: rot gerahmt, nur sichtbar, wenn ein
// Konto ins Minus lief. Im Gebrauch war das zu laut für eine Seite, die sagen soll, wie
// man dasteht. Hier ist ihr leiserer Ort: eine Tabelle im Register „Ausblick", unter dem
// Saldo, den sie verfeinert — der Ausblick darüber rechnet monatsweise und über alle
// liquiden Konten zusammen, das hier Tag für Tag und je Konto.
//
// Drei Dinge unterscheiden sie von der alten Karte, und alle drei folgen aus „leiser":
//
//   • Sie zeigt JEDES liquide Konto, nicht nur die mit Minus. Eine Fläche, die nur
//     erscheint, wenn etwas brennt, ist eine Warnung — und die war es, die zu laut war.
//   • Kein Rahmen in Warnfarbe und kein Dauergrün: amber steht nur an der Zahl, die
//     unter null fällt (`warnFarbe`), alles andere bleibt neutral. Ein Tiefstand ist eine
//     Höhe, keine Richtung.
//   • Keine Aufforderung. Die Tabelle sagt, wie tief es geht und wann; was daraus folgt,
//     entscheidet, wer sie liest.
//
// ZWEI TEXTE stehen darunter, und sie haben verschiedene Ränge (`ui/CLAUDE.md`, „Drei
// Ränge für jeden Text neben einer Zahl" — der Fall ist dort an genau dieser Rechnung
// beschrieben):
//
//   • Was „fest" und „erwartet" bedeuten, ist eine ERKLÄRUNG: sie hilft beim ersten Mal
//     und ist beim zehnten Ballast. Sie klappt ein, hinter die ausgeschriebene Frage.
//   • Was es heisst, wenn ein Konto hier NICHT im Minus steht, ist eine EINSCHRÄNKUNG:
//     sie begrenzt, was die Tabelle überhaupt behauptet, und steht auf jeder Breite
//     offen da. Lägen beide in einem Absatz, nähme das Einklappen der Erklärung die
//     Einschränkung mit — und eine Tabelle ohne Minus läse sich als Freigabe.

import { useTranslation } from "react-i18next";
import type { Liquiditaetssicht, Liquiditaetszeile, Verlaufsbefund } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { warnFarbe } from "../bausteine/geldFarbe";

export function LiquiditaetKarte({ sicht }: { sicht: Liquiditaetssicht }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  // Ohne liquides, aktives Konto gibt es nichts vorzurechnen — und eine leere Tabelle
  // mit dem Satz darunter behauptete, es sei etwas geprüft worden.
  if (sicht.zeilen.length === 0) return null;

  const bis = datum.mitJahr(sicht.bis);

  /** Der Tiefstand einer Linie mit seinem Tag. Amber nur unter null. */
  const tiefstand = (b: Verlaufsbefund) => (
    <span style={{ color: warnFarbe(b.tiefstand < 0) }}>
      {geld.format(b.tiefstand)}
      {/* Das Fenster reicht ein Quartal weit: das Jahr folgt aus dem Zusammenhang. */}
      <span className="hinweis" style={{ marginLeft: 6 }}>{datum.ohneJahr(b.tiefstandAm)}</span>
    </span>
  );

  /**
   * Ab wann es ins Minus geht — und auf welcher Linie. Ein festes Minus geht vor: es ist
   * ein Termin, das erwartete eine Annahme. Die Pille trägt das WORT, und ein Wort wird
   * gelesen; die Farbe daran ist deshalb erlaubt, wo sie an der Zahl nichts sagte.
   */
  const minus = (z: Liquiditaetszeile) => {
    const fest = z.fest.minusAb;
    const ab = fest ?? z.erwartet.minusAb;
    if (!ab) return <span className="muted">—</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: warnFarbe(true) }}>{datum.ohneJahr(ab)}</span>
        <Pill variant={fest ? "warn" : "neutral"}>{t(fest ? "blickNachVorn.reicht.fest" : "blickNachVorn.reicht.erwartet")}</Pill>
      </span>
    );
  };

  return (
    <Card title={t("blickNachVorn.reicht.titel")} subtitle={t("blickNachVorn.reicht.untertitel", { bis })}>
      <DataTable<Liquiditaetszeile>
        columns={[
          { key: "name", label: t("blickNachVorn.reicht.spalteKonto"), schmal: "titel" },
          {
            key: "start",
            label: `${t("blickNachVorn.reicht.spalteHeute")} ${geld.symbol}`,
            align: "right",
            // Ein Bestand, kein Fluss: im Plus neutral, sonst stünde hier dauerhaft Grün.
            render: (z) => <span style={{ color: warnFarbe(z.start < 0) }}>{geld.format(z.start)}</span>,
          },
          { key: "fest", label: `${t("blickNachVorn.reicht.spalteFest")} ${geld.symbol}`, align: "right", render: (z) => tiefstand(z.fest) },
          // Schmal bleibt die erwartete Linie als Wert: sie ist die tiefere der beiden
          // und damit die, an der man zuerst sieht, ob es eng wird.
          { key: "erwartet", label: `${t("blickNachVorn.reicht.spalteErwartet")} ${geld.symbol}`, align: "right", schmal: "wert", render: (z) => tiefstand(z.erwartet) },
          { key: "minus", label: t("blickNachVorn.reicht.spalteMinus"), schmal: "zweitzeile", render: minus },
        ]}
        rows={[...sicht.zeilen]}
      />

      {/* Die ERKLÄRUNG: darf einklappen, weil auf dem Deckel die Frage ausgeschrieben
          steht — anders als ein Reiter sagt er, was darunter liegt. */}
      <details style={{ marginTop: "var(--sp-3)" }}>
        <summary className="hinweis" style={{ cursor: "pointer" }}>{t("blickNachVorn.reicht.legendeFrage")}</summary>
        <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("blickNachVorn.reicht.legende")}</p>
      </details>
      {/* Die EINSCHRÄNKUNG: offen, auf jeder Breite, und nicht im `details` darüber. */}
      <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("blickNachVorn.reicht.hinweis", { bis })}</p>
    </Card>
  );
}
