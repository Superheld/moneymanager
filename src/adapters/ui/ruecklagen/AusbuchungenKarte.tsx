// Die Geschichte der Rücklagen: wofür sie gebraucht wurden — auch die beendeten.
//
// Seit Migration 76 wird eine freie Rücklage beim Ausbuchen beendet statt gelöscht und
// bleibt stehen. Zu sehen war sie danach trotzdem nirgends: die Liste darüber zeigt nur
// laufende, und diese Karte suchte den Namen einer Ausbuchung in genau dieser Liste — für
// eine beendete Rücklage stand dann „Rücklage gelöscht" da, obwohl es sie noch gibt.
//
// EINE Tabelle für beide Formen (Begründung an `Ausbuchungszeile`): die beendete Rücklage
// ist eine Ausbuchung mit einer Pille, kein eigener Abschnitt.
//
// Steht unter der Liste und nicht daneben: es ist ein Nachschlagen und kein Überblick —
// wer den Bereich öffnet, will wissen, wie er gerade dasteht. Und sie erscheint nur, wenn
// es etwas zu zeigen gibt; eine leere Geschichte sagt nichts.
//
// Ohne Seiten: Ausbuchungen sind seltene Ereignisse, kein Kontoauszug.
//
// Seit Paket 5 stehen hier auch die Abschlüsse einer Rücklage mit Kategorie, in derselben
// Tabelle: „Ausgegeben" ist dann, was sie im Zyklus über ihre Kategorie getragen hat, und
// die Spalte „Frei geworden" sagt, was auf dem Konto frei wurde. Ein Abschluss im Minus
// steht unter „Ungedeckt".

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ausbuchungszeile, IstBuchung } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import type { DataColumn } from "../bausteine/DataTable";
import { BuchungDetail } from "../bausteine/BuchungDetail";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { warnFarbe } from "../bausteine/geldFarbe";

export function AusbuchungenKarte({
  zeilen,
  onGeaendert,
}: {
  zeilen: readonly Ausbuchungszeile[];
  /** Nach einer Änderung im Buchungsdialog: die Sicht neu rechnen lassen. */
  onGeaendert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const [offen, setOffen] = useState<IstBuchung | null>(null);

  if (zeilen.length === 0) return null;

  // Ohne festgehaltenen Zyklus (Ausbuchungen von vor Migration 76) ist „angespart"
  // unbekannt, nicht null. Ein Strich mit Erklärung statt einer 0, die etwas behauptete.
  const unbekannt = <span className="muted" title={t("ruecklagen.geschichteUnbekannt")}>—</span>;

  const spalten: DataColumn<Ausbuchungszeile>[] = [
    {
      key: "datum",
      label: t("ruecklagen.feldAusDatum"),
      // Die Geschichte reicht über Jahre; ohne Jahr wäre das Datum keine Auskunft.
      render: (z) => datum.kurz(z.datum),
      sortValue: (z) => z.datum,
      schmal: "zweitzeile",
    },
    {
      key: "bezeichnung",
      label: t("ruecklagen.geschichteRuecklage"),
      // Der Name trägt den Link-Stil, nicht das Datum: ein unterstrichenes Datum sagt
      // nicht, WAS sich öffnet.
      bezeichner: true,
      render: (z) => (
        <>
          {z.bezeichnung || t("ruecklagen.ausgebuchtWeg")}
          {z.beendet && <> <Pill variant="neutral">{t("ruecklagen.pillBeendet")}</Pill></>}
        </>
      ),
      sortValue: (z) => z.bezeichnung,
      schmal: "titel",
    },
    {
      key: "buchung",
      label: t("ruecklagen.feldAusBuchung"),
      render: (z) => (z.buchung ? z.buchungsname || t("ruecklagen.mitBuchung") : ""),
      sortValue: (z) => z.buchungsname,
      maxWidth: 240,
      schmal: "zweitzeile",
    },
    {
      key: "angespart",
      label: `${t("ruecklagen.geschichteAngespart")} ${geld.symbol}`,
      align: "right",
      render: (z) => (z.angespart == null ? unbekannt : geld.format(z.angespart)),
      sortValue: (z) => z.angespart ?? -1,
    },
    {
      key: "ungedeckt",
      label: `${t("ruecklagen.geschichteUngedeckt")} ${geld.symbol}`,
      align: "right",
      // Ungerichtet, an einer Schwelle: über null ist es ein Befund, sonst nichts —
      // und nie grün, ein gedeckter Kauf ist der Normalfall.
      render: (z) =>
        z.ungedeckt == null ? unbekannt : (
          <span style={{ color: warnFarbe(z.ungedeckt > 0) }}>{geld.format(z.ungedeckt)}</span>
        ),
      sortValue: (z) => z.ungedeckt ?? -1,
      schmal: "zweitzeile",
    },
    {
      key: "frei",
      label: `${t("ruecklagen.geschichteFrei")} ${geld.symbol}`,
      align: "right",
      // Nur beim Abschliessen (seit Paket 5): beim Ausbuchen mit Kauf wurde nichts frei
      // gerechnet, und eine 0 behauptete dort etwas, das nie gefragt war.
      render: (z) => (z.frei == null ? "" : geld.format(z.frei)),
      sortValue: (z) => z.frei ?? -1,
      schmal: "zweitzeile",
    },
    {
      key: "ausgabe",
      label: `${t("ruecklagen.feldAusBetrag")} ${geld.symbol}`,
      align: "right",
      render: (z) => geld.format(z.ausgabe),
      sortValue: (z) => z.ausgabe,
      schmal: "wert",
    },
  ];

  return (
    <>
      <Card title={t("ruecklagen.ausbuchungenTitel")} subtitle={t("ruecklagen.ausbuchungenUntertitel")}>
        <DataTable
          columns={spalten}
          rows={zeilen}
          sortable
          // Nur was eine Buchung IST, öffnet etwas: eine Ausbuchung ohne verknüpfte
          // Buchung bliebe sonst eine Zeile, die nach Klick aussieht und nichts tut.
          onRowClick={(z) => { if (z.buchung) setOffen(z.buchung); }}
          istKlickbar={(z) => !!z.buchung}
        />
      </Card>
      {/* Neben der Karte, nicht darin: das Modal hängt ohnehin per Portal am body. */}
      {offen && <BuchungDetail buchung={offen} onClose={() => setOffen(null)} onGeaendert={onGeaendert} />}
    </>
  );
}
