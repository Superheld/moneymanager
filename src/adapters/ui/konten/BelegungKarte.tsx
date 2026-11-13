// Was auf einem Konto gebunden ist — Rücklagen und aufbauende Budgets, und was frei bleibt.
//
// Die Karte zeigt die Kontobelegung (`core/konten/kontobelegung`) und rechnet nichts
// selbst. Sie steht NEBEN der Kontenliste und nicht darin, und sie fehlt, wenn auf dem
// Konto niemand etwas beansprucht: eine Aufstellung „gebunden: 0" sagte nur, was die
// Spalte darüber schon sagt.

import { useTranslation } from "react-i18next";
import type { Kontobelegung } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

export function BelegungKarte({
  belegung,
  namen,
  konto,
}: {
  belegung: Kontobelegung;
  namen: ReadonlyMap<string, string>;
  konto: string;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (belegung.posten.length === 0) return null;
  const unterdeckt = belegung.anteil < 1;

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("konten.belegung.titel", { konto })}
      subtitle={t("konten.belegung.untertitel")}
    >
      <DataTable
        columns={[
          {
            key: "name",
            label: t("konten.belegung.spalteWofuer"),
            render: (p) => (
              <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center" }}>
                {namen.get(p.id) ?? p.id}
                <Pill variant="neutral">{t(`konten.belegung.art.${p.art}`)}</Pill>
              </span>
            ),
          },
          {
            key: "betrag",
            label: `${t("konten.belegung.spalteAnspruch")} ${geld.symbol}`,
            align: "right",
            render: (p) => geld.format(p.betrag),
          },
          // Die Spalte „gedeckt" nur, wenn sie etwas anderes sagt als die davor.
          ...(unterdeckt
            ? [
                {
                  key: "gedeckt",
                  label: `${t("konten.belegung.spalteGedeckt")} ${geld.symbol}`,
                  align: "right" as const,
                  render: (p: (typeof belegung.posten)[number]) => geld.format(p.gedeckt),
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
    </Card>
  );
}
