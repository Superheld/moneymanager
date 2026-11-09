// „Warum A und nicht B" — die kontrastive Erklärung einer Entscheidung als Tabelle.
//
// Gebraucht an zwei Stellen im Training-Bereich: an jedem Fehlgriff der Messung (gegen
// die richtige Kategorie) und an einer einzelnen Buchung (gegen die gebuchte Kategorie
// oder die Zweitbeste). Beide liegen in `training/`, deshalb liegt die Tafel hier und
// nicht in `bausteine/`.
//
// Die Spalte, auf die es ankommt, ist „Ausschlag": wie viel dieses Merkmal zum Abstand
// zwischen beiden Kategorien beitrug. Die Gewichte daneben stehen nur, damit man sieht,
// WIE ein Ausschlag zustande kam — ein Wort, das für beide stark spricht, hat einen
// kleinen Ausschlag und ist für die Entscheidung bedeutungslos, so gross seine Gewichte
// auch sind. Die Grundneigung ist eine eigene Zeile: sie entscheidet bei ungleich
// grossen Kategorien oft mit und kam in der alten Begründung gar nicht vor.

import { useTranslation } from "react-i18next";
import type { Erklaerung } from "../../../application";
import { DataTable } from "../bausteine";
import { useProzent } from "../bausteine/einstellungenKontext";

/** Wie viele Merkmale die Tafel zeigt — der Rest steht im Merkmalsvektor darunter. */
const ZEILEN = 8;

/** Ein Gewicht als Zahl mit Vorzeichen. Minus ist U+2212, wie überall in der App. */
function gewicht(x: number, locale: string): string {
  const betrag = Math.abs(x).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (betrag === (0).toLocaleString(locale, { minimumFractionDigits: 2 })) return betrag;
  return `${x < 0 ? "−" : "+"}${betrag}`;
}

export function ErklaerungsTafel({
  erklaerung,
  kategorieName,
  verteilung,
}: {
  erklaerung: Erklaerung;
  kategorieName: (id: string) => string;
  /**
   * Optional: wie sich ein Merkmal im Bestand auf die Kategorien verteilt — die Antwort
   * auf „woher hat das Wort sein Gewicht". Fehlt, wo der Bestand nicht geladen ist.
   */
  verteilung?: (merkmal: string) => readonly { kategorieId: string; anzahl: number }[] | undefined;
}) {
  const { t, i18n } = useTranslation();
  const prozent = useProzent();
  const locale = i18n.language;
  const e = erklaerung;
  const a = kategorieName(e.gewaehlt.kategorieId);
  const b = e.vergleich ? kategorieName(e.vergleich.kategorieId) : null;

  const zeilen = [
    ...e.posten.slice(0, ZEILEN).map((p) => ({ ...p, id: p.merkmal, istGrundneigung: false })),
    { ...e.grundneigung, merkmal: t("training.erklaerung.grundneigung"), id: "\u0000bias", istGrundneigung: true },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
        {t("training.erklaerung.kandidaten")}{" "}
        {e.kandidaten.map((k) => `${kategorieName(k.kategorieId)} ${prozent(k.wahrscheinlichkeit, 0)}`).join(" · ")}
      </div>

      {e.vergleichUnbekannt ? (
        // Die richtige Kategorie kam im Training nicht vor. Dann hätte kein Wort
        // geholfen — die Antwort ist „Beispiele fehlen", nicht „Merkmal fehlt".
        <div style={{ color: "var(--warn-deep)" }}>{t("training.erklaerung.vergleichUnbekannt")}</div>
      ) : b && e.vergleich ? (
        <>
          <div>
            {t("training.erklaerung.frage", {
              a,
              b,
              rang: e.vergleich.rang,
              wahrscheinlichkeit: prozent(e.vergleich.wahrscheinlichkeit, 0),
            })}
          </div>
          <DataTable
            columns={[
              {
                key: "merkmal",
                label: t("training.erklaerung.spalteMerkmal"),
                render: (r) => (
                  <span style={{ fontStyle: r.istGrundneigung ? "italic" : undefined }}>{r.merkmal}</span>
                ),
              },
              { key: "fuer", label: a, align: "right", render: (r) => gewicht(r.fuer, locale) },
              { key: "gegen", label: b, align: "right", render: (r) => gewicht(r.gegen, locale) },
              {
                key: "differenz",
                label: t("training.erklaerung.spalteAusschlag"),
                align: "right",
                render: (r) => (
                  <span
                    style={{
                      fontWeight: "var(--fw-bold)",
                      color: r.differenz > 0 ? "var(--warn-deep)" : "var(--ok-deep)",
                    }}
                  >
                    {gewicht(r.differenz, locale)}
                  </span>
                ),
              },
              ...(verteilung
                ? [
                    {
                      key: "bestand",
                      label: t("training.erklaerung.spalteBestand"),
                      render: (r: (typeof zeilen)[number]) =>
                        r.istGrundneigung
                          ? ""
                          : (verteilung(r.merkmal) ?? [])
                              .slice(0, 3)
                              .map((v) => `${kategorieName(v.kategorieId)} ${v.anzahl}`)
                              .join(" · "),
                    },
                  ]
                : []),
            ]}
            rows={zeilen}
          />
          <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
            {t("training.erklaerung.lesart", { a, b, abstand: gewicht(e.abstand, locale) })}
            {e.posten.length > ZEILEN && ` ${t("training.erklaerung.weitere", { anzahl: e.posten.length - ZEILEN })}`}
          </div>
        </>
      ) : null}

      {e.unbekannt.length > 0 && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t("training.erklaerung.unbekannt", { woerter: e.unbekannt.join(", ") })}
        </div>
      )}
    </div>
  );
}
