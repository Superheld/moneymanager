// Die Belegung EINES Kontos als Tabelle: jede Rücklage mit ihrem Anspruch (und, wenn es
// nicht reicht, was davon gedeckt ist), darunter Stand, gebunden und frei.
//
// Zwei Bereiche zeigen das: der Kontoauszug für das gewählte Konto (`kontoauszug/BelegungKarte`)
// und die Rücklagen für alle Konten auf einem Blatt (`ruecklagen/GeldJeKontoKarte`). Ohne
// Karte drumherum, weil die zweite mehrere davon in EINE Karte setzt — eine Karte in
// einer Karte gibt es nicht. Gerechnet wird nichts; die Zahlen kommen aus der
// Kontobelegung.

import { useTranslation } from "react-i18next";
import type { Belegungsposten, Kontobelegung } from "../../../application";
import { DataTable } from "./DataTable";
import { useGeld } from "./einstellungenKontext";
import { geldFarbe } from "./geldFarbe";

export function BelegungTabelle({
  belegung,
  namen,
}: {
  belegung: Kontobelegung;
  namen: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const unterdeckt = belegung.anteil < 1;

  return (
    <>
      <DataTable
        columns={[
          {
            key: "name",
            label: t("konten.belegung.spalteWofuer"),
            // Ohne Pille für die Art: Rücklage und aufbauendes Budget heissen seit
            // 2026-11-15 beide „Rücklage", die Pille sagte an jeder Zeile dasselbe.
            render: (p: Belegungsposten) => namen.get(p.id) ?? p.id,
          },
          {
            key: "betrag",
            label: `${t("konten.belegung.spalteAnspruch")} ${geld.symbol}`,
            align: "right",
            render: (p: Belegungsposten) => geld.format(p.betrag),
          },
          // Die Spalte „gedeckt" nur, wenn sie etwas anderes sagt als die davor.
          ...(unterdeckt
            ? [
                {
                  key: "gedeckt",
                  label: `${t("konten.belegung.spalteGedeckt")} ${geld.symbol}`,
                  align: "right" as const,
                  render: (p: Belegungsposten) => geld.format(p.gedeckt),
                },
              ]
            : []),
        ]}
        rows={[...belegung.posten]}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-5)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
        <span className="muted">
          {t("konten.belegung.stand")} <b className="num">{geld.formatMitSymbol(belegung.stand)}</b>
        </span>
        <span className="muted">
          {t("konten.belegung.gebunden")} <b className="num">{geld.formatMitSymbol(belegung.gebunden)}</b>
        </span>
        <span className="muted">
          {t("konten.belegung.frei")}{" "}
          <b className="num" style={{ color: geldFarbe(belegung.frei) }}>{geld.formatMitSymbol(belegung.frei)}</b>
        </span>
      </div>
      {/* Eine EINSCHRÄNKUNG: sie sagt, dass die Zahlen oben nicht vollständig gedeckt sind
          und wie verteilt wurde. Deshalb offen und nicht eingeklappt. */}
      {unterdeckt && (
        <p className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: 0 }}>
          {t("konten.belegung.unterdeckt", {
            betrag: geld.formatMitSymbol(-belegung.frei),
            prozent: Math.round(belegung.anteil * 100),
          })}
        </p>
      )}
    </>
  );
}
