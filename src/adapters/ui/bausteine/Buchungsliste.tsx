// Die Buchungen unter einer Auswertung — unter einem Budget (Übersicht, Budget-Verlauf)
// und unter einer Kategorie (Analyse). EINE Liste mit EINEM Satz Spalten.
//
// **Warum es sie gibt.** Bis 2026-11-12 zeigten diese Stellen dieselben Buchungen
// verschieden: unter einem Budget Datum, Name (aus der Notiz) und den Betrag ohne
// Vorzeichen; in der Analyse Datum mit Jahr, Empfänger, Zweck, Konto und den Betrag mit
// Vorzeichen und Farbe. Zwei Komponenten, zwei Zeilentypen, zwei Namensregeln — und eine
// Verbesserung an der einen erreichte die andere nie. Die Fläche teilten sie schon
// (`Aufklapptabelle`); jetzt teilen sie auch den Inhalt (`Buchungszeile` aus
// `application/buchung/buchungszeile.ts`).
//
// **Was sich je Stelle unterscheiden darf, entscheidet der INHALT, nicht der Aufrufer.**
// Eine Spalte, die in jeder Zeile denselben Wert trägt, fällt weg — die Kategorie unter
// einer Kategorie, das Konto, wenn alles vom selben kommt. Sie sagte nichts, was die Zeile
// darüber nicht schon sagt. Ein Schalter je Aufrufer („ohne Konto") wäre der Weg zurück
// zu drei Fassungen.
//
// Der Zeilenklick öffnet die Buchung (`onBuchung`); ohne ihn bleiben die Zeilen Text.

import { useTranslation } from "react-i18next";
import type { Buchungszeile, IstBuchung } from "../../../application";
import { AUFKLAPP_ZEILEN_BREIT } from "./aufklappen";
import { Aufklapptabelle, type Aufklappspalte } from "./Aufklapptabelle";
import { useDatum, useGeld } from "./einstellungenKontext";
import { geldFarbe } from "./geldFarbe";
import { Pill } from "./Pill";

/** Mehr Zeilen zeigt keine Liste — darüber hilft Eingrenzen mehr als Scrollen. */
const HOECHSTENS = 50;

/** Ob eine Spalte etwas unterscheidet: mehr als ein Wert in der Liste. */
function unterscheidet(zeilen: readonly Buchungszeile[], wert: (z: Buchungszeile) => string): boolean {
  return new Set(zeilen.map(wert)).size > 1;
}

export function Buchungsliste({
  zeilen,
  onBuchung,
  sichtbar = AUFKLAPP_ZEILEN_BREIT,
  leer,
  summe = false,
}: {
  zeilen: readonly Buchungszeile[];
  onBuchung?: (buchung: IstBuchung) => void;
  /** Wie viele Zeilen sichtbar bleiben, bevor gescrollt wird (siehe `aufklappen.ts`). */
  sichtbar?: number;
  /** Was steht, wenn es keine Zeilen gibt. Ohne Angabe der Standardtext. */
  leer?: string;
  /**
   * Eine Summenzeile darunter. Nur, wo die Liste die Hauptsache ist (Budget-Verlauf) —
   * steht derselbe Betrag schon in der Zeile darüber (Übersicht), wiederholte sie ihn.
   */
  summe?: boolean;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();

  const gezeigt = zeilen.slice(0, HOECHSTENS);
  const spalten: Aufklappspalte<Buchungszeile>[] = [
    { key: "datum", label: t("buchungsliste.datum"), breite: "9ch", gedimmt: true, render: (z) => datum.kurz(z.buchung.datum) },
    {
      key: "name",
      label: t("buchungsliste.buchung"),
      fett: true,
      kappen: true,
      // Der Name hat Vorrang vor dem Zweck: beide werden gekappt, und ohne feste Breite
      // teilten sie den Platz gleich — in der halben Karte der Übersicht stand dann vom
      // Namen kaum etwas da, vom Zweck mehr. Der Name ist das, wonach man sucht.
      breite: "36%",
      render: (z) => (
        <span title={z.name} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {z.name || t("buchungsliste.ohneName")}
          </span>
          {/* Dieselbe Markierung wie im Kontoauszug: dass ein Posten aus einem laufenden
              Vertrag stammt, ist die halbe Antwort auf „wofür ging das Geld". */}
          {z.vertragsname && (
            <span title={t("konten.pillVertrag", { anbieter: z.vertragsname })} style={{ flex: "0 0 auto" }}>
              <Pill variant="plan">{z.vertragsname}</Pill>
            </span>
          )}
        </span>
      ),
    },
    ...(unterscheidet(zeilen, (z) => z.kategorieName)
      ? [{ key: "kategorie", label: t("buchungsliste.kategorie"), gedimmt: true, kappen: true, render: (z: Buchungszeile) => z.kategorieName || "—" }]
      : []),
    {
      key: "zweck",
      label: t("buchungsliste.zweck"),
      gedimmt: true,
      kappen: true,
      render: (z) => <span title={z.verwendungszweck}>{z.verwendungszweck}</span>,
    },
    ...(unterscheidet(zeilen, (z) => z.kontoName)
      ? [{ key: "konto", label: t("buchungsliste.konto"), gedimmt: true, render: (z: Buchungszeile) => z.kontoName || "—" }]
      : []),
    {
      key: "betrag",
      label: `${t("buchungsliste.betrag")} ${geld.symbol}`,
      align: "right",
      render: (z) => <span style={{ color: geldFarbe(z.betrag) }}>{geld.format(z.betrag, { mitVorzeichen: true })}</span>,
    },
  ];

  const gesamt = zeilen.reduce((s, z) => s + z.betrag, 0);

  return (
    <Aufklapptabelle
      zeilen={gezeigt}
      schluessel={(z, i) => `${z.buchung.id}#${i}`}
      sichtbar={sichtbar}
      leer={leer ?? t("buchungsliste.leer")}
      onZeile={onBuchung ? (z) => onBuchung(z.buchung) : undefined}
      zeilenTitel={t("buchungsliste.oeffnen")}
      mehr={zeilen.length > HOECHSTENS ? t("buchungsliste.mehr", { n: zeilen.length - HOECHSTENS }) : undefined}
      spalten={spalten}
      fuss={
        summe && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 8px 5px", borderTop: "1px solid var(--line)", fontSize: "var(--fs-ui)", fontWeight: "var(--fw-bold)" }}>
            <span>{t("buchungsliste.summe")}</span>
            {/* Mit Vorzeichen, wie jede Zeile darüber — die Summe ist ihre Summe. */}
            <span className="num" style={{ color: geldFarbe(gesamt) }}>{geld.formatMitSymbol(gesamt, { mitVorzeichen: true })}</span>
          </div>
        )
      }
    />
  );
}
