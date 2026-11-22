// „Ungeplant" in den Befunden — je Kategorie Summe und Anzahl, aufklappbar bis zur Buchung.
//
// Gerechnet wird nichts hier: die Zeilen kommen fertig aus `analyseBefunde`
// (`ungeplantNachKategorie` über die Einordnung), samt den Buchungen darunter. Diese Datei
// entscheidet nur, welche Kategorie offen ist.
//
// Aufgeklappt wird UNTER der Tabelle und nicht in ihr (`bausteine/CLAUDE.md`,
// „Zeilenlink" — die ganze Zeile ist klickbar, der Name trägt den Link-Stil): eine `DataTable` hat keine Zeile, unter der etwas aufgeht, und die
// Buchungsliste steht dann als `Buchungsliste` da — dieselbe Form wie unter einer Kategorie
// im Verlauf. Keine zweite Karte: sie gehört zur Zeile, die man eben angeklickt hat.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, UngeplantZeile } from "../../../application";
import { DataTable, Pill } from "../bausteine";
import { Buchungsliste } from "../bausteine/Buchungsliste";
import { AUFKLAPP_ZEILEN_SCHMAL } from "../bausteine/aufklappen";
import { useGeld } from "../bausteine/einstellungenKontext";
import { useSchmal } from "../bausteine/useSchmal";

/** Wie in den übrigen Befunden: sieben Karten untereinander, keine frisst den Bildschirm. */
const SEITE = 8;

const schluessel = (z: UngeplantZeile) => z.kategorieId ?? "__ohne__";

export function UngeplantTabelle({
  zeilen,
  onBuchung,
  tabellentexte,
}: {
  zeilen: readonly UngeplantZeile[];
  onBuchung?: (b: IstBuchung) => void;
  tabellentexte: Record<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const schmal = useSchmal();
  const [offen, setOffen] = useState<string | null>(null);

  if (zeilen.length === 0) return <div className="muted">{t("befunde.ungeplantKeine")}</div>;

  // Ist die offene Kategorie aus dem Zeitraum gefallen, steht nichts mehr offen.
  const offeneZeile = zeilen.find((z) => schluessel(z) === offen);
  const umschalten = (z: UngeplantZeile) => setOffen(offen === schluessel(z) ? null : schluessel(z));
  const name = (z: UngeplantZeile) => (z.kategorieId ? z.name : t("historie.ohneKategorie"));
  const wartet = zeilen.some((z) => z.wartend > 0);

  return (
    <>
      <DataTable
        sortable
        pageSize={SEITE}
        {...tabellentexte}
        rows={[...zeilen]}
        onRowClick={umschalten}
        istAktiv={(z) => schluessel(z) === offen}
        columns={[
          {
            key: "name",
            label: t("befunde.spalteKategorie"),
            schmal: "titel",
            sortValue: (z) => name(z),
            render: (z) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                {/* Den Link-Stil setzt die Tabelle selbst an die erste Spalte einer klickbaren
                    Zeile; ein eigener `Zeilenlink` hier schaltete beim Klick zweimal um. */}
                <span title={t("befunde.ungeplantOeffnen", { name: name(z) })}>{name(z)}</span>
                {/* Kein Warnton: an der Buchung fehlt keine Planung, nur eine Wahl. Dieselbe
                    Pille wie im Kontoauszug. */}
                {z.wartend > 0 && <Pill variant="plan">{t("befunde.ungeplantWartend", { count: z.wartend })}</Pill>}
              </span>
            ),
          },
          {
            key: "summe",
            label: `${t("befunde.spalteSumme")} ${geld.symbol}`,
            align: "right",
            schmal: "wert",
            // Eine Ausgabe als Höhe, wie in den übrigen Ranglisten der Befunde: neutral.
            render: (z) => geld.format(z.summe),
          },
          {
            key: "anzahl",
            label: t("befunde.spalteAnzahl"),
            align: "right",
            schmal: "zweitzeile",
          },
        ]}
      />

      {offeneZeile && (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <div style={{ fontSize: "var(--fs-ui)", fontWeight: "var(--fw-bold)" }}>
            {t("befunde.ungeplantBuchungen", { name: name(offeneZeile) })}
          </div>
          <Buchungsliste
            zeilen={offeneZeile.zeilen}
            onBuchung={onBuchung}
            sichtbar={schmal ? AUFKLAPP_ZEILEN_SCHMAL : undefined}
            summe
          />
        </div>
      )}

      {/* Eine Einschränkung der Summe, kein Hilfetext: offen, und nur, wenn sie trifft. */}
      {wartet && <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("befunde.ungeplantHinweis")}</p>}
    </>
  );
}
