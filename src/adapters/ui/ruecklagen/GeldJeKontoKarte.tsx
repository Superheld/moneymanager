// Wo das Geld liegt — alle Konten mit Rücklagen auf einem Blatt.
//
// Bis 2026-11-16 gab es die Antwort nur je Konto, im Kontoauszug unter dem gewählten
// Konto („Gebunden auf …"). Hier steht dieselbe Belegung für jedes Konto, das etwas
// trägt, untereinander in EINER Karte — mit derselben Tabelle (`bausteine/BelegungTabelle`),
// damit eine Zahl an beiden Stellen gleich aussieht und gleich heisst.
//
// Am Ende stehen die Rücklagen OHNE Konto, beide Formen. Sie sollen auffallen: für sie
// gibt es nur die Rechnung, und ob das Geld da ist, kann niemand sagen. Ein Klick öffnet
// sie zum Bearbeiten — dort trägt man das Konto ein.
//
// Gerechnet und ausgewählt wird nichts; die Sicht kommt fertig aus `geldJeKonto`.

import { useTranslation } from "react-i18next";
import type { GeldJeKonto, RuecklageOhneKonto } from "../../../application";
import { Card, DataTable } from "../bausteine";
import { BelegungTabelle } from "../bausteine/BelegungTabelle";
import { useGeld } from "../bausteine/einstellungenKontext";

const KONTOTITEL = { margin: "0 0 var(--sp-2)", fontSize: "var(--fs-body)", fontWeight: "var(--fw-bold)" } as const;

export function GeldJeKontoKarte({
  sicht,
  onBearbeiten,
}: {
  sicht: GeldJeKonto;
  /** Öffnet die Rücklage ohne Konto in ihrem Dialog. */
  onBearbeiten: (r: RuecklageOhneKonto) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (sicht.konten.length === 0 && sicht.ohneKonto.length === 0) return null;

  return (
    <Card title={t("ruecklagen.geldJeKonto.titel")} subtitle={t("ruecklagen.geldJeKonto.untertitel")}>
      {sicht.konten.map((k, i) => (
        <section key={k.kontoId} className={i > 0 ? "abschnitt" : undefined} aria-label={k.konto}>
          <h3 style={KONTOTITEL}>{k.konto}</h3>
          <BelegungTabelle belegung={k.belegung} namen={sicht.namen} />
        </section>
      ))}

      {sicht.ohneKonto.length > 0 && (
        <section
          className={sicht.konten.length > 0 ? "abschnitt" : undefined}
          aria-label={t("ruecklagen.geldJeKonto.ohneKontoTitel")}
        >
          <h3 style={KONTOTITEL}>{t("ruecklagen.geldJeKonto.ohneKontoTitel")}</h3>
          {/* Eine Einschränkung, keine Erklärung: für diese Rücklagen gibt es keinen Stand. */}
          <p className="hinweis" style={{ margin: "0 0 var(--sp-2)" }}>{t("ruecklagen.geldJeKonto.ohneKontoHinweis")}</p>
          <DataTable
            columns={[
              {
                key: "name",
                label: t("ruecklagen.geschichteRuecklage"),
                schmal: "titel",
                render: (r: RuecklageOhneKonto) => r.name,
              },
              {
                key: "form",
                label: t("ruecklagen.geldJeKonto.spalteForm"),
                schmal: "zweitzeile",
                render: (r: RuecklageOhneKonto) =>
                  r.form === "hand" ? t("ruecklagen.abschnittHand") : t("ruecklagen.abschnittKategorie"),
              },
              {
                key: "anspruch",
                label: `${t("konten.belegung.spalteAnspruch")} ${geld.symbol}`,
                align: "right",
                schmal: "wert",
                render: (r: RuecklageOhneKonto) => geld.format(r.anspruch),
              },
            ]}
            rows={sicht.ohneKonto}
            onRowClick={onBearbeiten}
          />
        </section>
      )}
    </Card>
  );
}
