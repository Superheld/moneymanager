// „Wartet auf Zuordnung" — die Buchungen, bei denen offen ist, welche Rücklage sie trägt.
//
// Hängen mehrere Rücklagen an einer Kategorie, wartet eine Buchung dort, bis jemand wählt
// (ADR-0006, Entscheidung 5). Solange zählt sie als ungeplant. Bis Paket 5 stand das nur
// als Pille im Kontoauszug, und was offen ist, fand man nur durch Durchsehen; hier steht
// es gesammelt, und gewählt wird direkt in der Zeile — dieselbe Wahl wie im Buchungsdialog
// (`bausteine/RuecklagenwahlBlock`), über denselben Use-Case (`ruecklageZuordnen`).
//
// Was wartet und was zur Wahl steht, kommt fertig aus der Sicht (`wartend`). Vorbelegt
// wird nichts: eine Vorbelegung sähe aus wie eine Entscheidung, die niemand getroffen hat.
//
// Ist nichts offen, steht die Karte nicht da — eine leere Liste offener Arbeit sagt
// nichts, und ein „alles erledigt" daneben würde nach zwei Wochen niemand mehr lesen.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WartendeZuordnung } from "../../../application";
import { ruecklageZuordnen } from "../../dienste";
import { Card, DataTable } from "../bausteine";
import type { DataColumn } from "../bausteine/DataTable";
import { Zeilenauswahl } from "../bausteine/Zeilenauswahl";
import { fehlerNachricht, useDatum, useGeld } from "../bausteine/einstellungenKontext";

/** Der Wert für „ausdrücklich keine Rücklage" — keine ID kann so heissen. */
const KEINE = "\u0000keine";

export function WartetKarte({
  zeilen,
  onGewaehlt,
}: {
  zeilen: readonly WartendeZuordnung[];
  /** Nach einer Wahl: die Sicht neu rechnen lassen — die Zeile fällt dann weg. */
  onGewaehlt: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const [fehler, setFehler] = useState<string | null>(null);

  if (zeilen.length === 0) return null;

  async function waehlen(z: WartendeZuordnung, wert: string) {
    if (!wert) return;
    setFehler(null);
    try {
      await ruecklageZuordnen({ istbuchungId: z.buchungId, kategorieId: z.kategorieId, ruecklageId: wert === KEINE ? null : wert });
      await onGewaehlt();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  const spalten: DataColumn<WartendeZuordnung>[] = [
    {
      key: "datum",
      label: t("ruecklagen.wartend.spalteDatum"),
      // Was wartet, kann Monate zurückliegen — ohne Jahr wäre das Datum keine Auskunft.
      render: (z) => datum.kurz(z.datum),
      sortValue: (z) => z.datum,
      schmal: "zweitzeile",
    },
    {
      key: "name",
      label: t("ruecklagen.wartend.spalteName"),
      render: (z) => z.name,
      sortValue: (z) => z.name,
      maxWidth: 240,
      schmal: "titel",
    },
    {
      key: "kategorie",
      label: t("ruecklagen.wartend.spalteKategorie"),
      render: (z) => z.kategorieName ?? "—",
      sortValue: (z) => z.kategorieName ?? "",
      schmal: "zweitzeile",
    },
    {
      key: "betrag",
      label: `${t("ruecklagen.wartend.spalteBetrag")} ${geld.symbol}`,
      align: "right",
      render: (z) => geld.format(z.betrag),
      sortValue: (z) => z.betrag,
      schmal: "wert",
    },
    {
      key: "wahl",
      label: t("ruecklagen.wartend.spalteWahl"),
      sortable: false,
      render: (z) => (
        <Zeilenauswahl
          label={t("ruecklagen.wartend.spalteWahl")}
          wert=""
          onChange={(v) => waehlen(z, v)}
          moeglichkeiten={[
            // Sichtbar, aber nicht wählbar: der Zustand „noch offen" ist keine Wahl.
            { wert: "", text: t("buchungRuecklage.offen"), gesperrt: true },
            ...z.ruecklagen.map((r) => ({ wert: r.id, text: r.bezeichnung })),
            { wert: KEINE, text: t("buchungRuecklage.keine") },
          ]}
        />
      ),
      schmal: "zweitzeile",
    },
  ];

  return (
    <Card title={t("ruecklagen.wartend.titel")} subtitle={t("ruecklagen.wartend.untertitel")}>
      <DataTable columns={spalten} rows={zeilen} sortable />
      {fehler && <div className="err" style={{ marginTop: 6 }}>{fehler}</div>}
    </Card>
  );
}
