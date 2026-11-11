// Register „Kategorien" — eine reine Kategorienauswertung über die Zeit (seit 2026-11-11).
//
// Vorher war es die Aufschlüsselung eines Fensters („wie viel ging wohin"), mit Monat und
// Zeitraum aus dem Verlauf. Die steht jetzt im Verlauf unter dem gewählten Monat
// (`Aufschluesselung`). Hier steht die Frage, die keine andere Stelle beantwortet: **wie
// entwickelt sich jede Kategorie?** — je Zeile Summe, Schnitt, Anteil, die Monate als
// kleine Balken und der Trend der letzten drei abgeschlossenen Monate.
//
// Ein Klick auf eine Zeile öffnet darunter die Kategorie im Einzelnen: Monat für Monat
// gross, dazu ihre Buchungen. Neben der Karte, nicht darin.
//
// Kategorien, nicht Hauptgruppen: eine Gruppe bringt die Buchungen ihrer Unterkategorien
// nicht mit (`analyseBuchungen` fragt eine Kategorie), und eine aufgeklappte Gruppe ohne
// Buchungen wäre ein Weg ins Leere. Die Hauptgruppe steht als Zusatz am Namen.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseFenster,
  analyseKategorienreihen,
  type Analysebasis,
  type IstBuchung,
  type KategorieReihe,
  type Zeitraum,
} from "../../../application";
import { Card, DataTable } from "../bausteine";
import { useGeld, useProzent } from "../bausteine/einstellungenKontext";
import { flussFarbe, geldFarbe, warnFarbe } from "../bausteine/geldFarbe";
import { Umschalter } from "../bausteine/Umschalter";
import { KategorieBuchungen } from "./Aufschluesselung";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { Filterleiste, ZeitraumWahl } from "./ZeitraumWahl";

type Seite = "Aufwand" | "Ertrag" | "Umschichtung";

export interface KategorienZustand {
  readonly zeitraum: Zeitraum;
  readonly seite: Seite;
  /** Die geöffnete Kategorie; `"__ohne"` steht für die Zeile ohne Kategorie. */
  readonly offen: string | null;
}

export const KATEGORIEN_ANFANG: KategorienZustand = { zeitraum: "12", seite: "Aufwand", offen: null };

const schluessel = (z: KategorieReihe) => z.kategorieId ?? "__ohne";

/**
 * Die Monate einer Zeile als kleine Balken — eine Form, keine Zahl. Gemessen am grössten
 * Monat DIESER Zeile: es geht um ihren eigenen Verlauf, nicht um den Vergleich mit der
 * Nachbarzeile (dafür stehen Summe und Anteil daneben).
 */
function Monatsbalken({ werte }: { werte: readonly number[] }) {
  const breite = 5;
  const luecke = 2;
  const hoehe = 22;
  const max = Math.max(1, ...werte.map((v) => Math.abs(v)));
  return (
    <svg width={werte.length * (breite + luecke)} height={hoehe} aria-hidden="true" style={{ display: "block" }}>
      {werte.map((v, i) => {
        const h = Math.max(v === 0 ? 0 : 1, Math.round((Math.abs(v) / max) * hoehe));
        return <rect key={i} x={i * (breite + luecke)} y={hoehe - h} width={breite} height={h} rx={1} fill={flussFarbe(v)} />;
      })}
    </svg>
  );
}

export function KategorienRegister({
  basis,
  heute,
  zustand,
  setZustand,
  onBuchung,
}: {
  basis: Analysebasis;
  heute: string;
  zustand: KategorienZustand;
  setZustand: (z: KategorienZustand) => void;
  onBuchung: (b: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const prozent = useProzent();
  const { von, bis } = useMemo(() => analyseFenster(basis, zustand.zeitraum, heute), [basis, zustand.zeitraum, heute]);
  const reihen = useMemo(() => analyseKategorienreihen(basis, von, bis, heute), [basis, von, bis, heute]);

  // Eine Seite ohne Zeilen bekommt keinen Knopf — Umschichtungen nach aussen gibt es
  // längst nicht in jedem Bestand.
  const seiten = (["Aufwand", "Ertrag", "Umschichtung"] as const).filter((s) => reihen.zeilen.some((z) => z.charakter === s));
  const seite: Seite = seiten.includes(zustand.seite as never) ? zustand.seite : (seiten[0] ?? "Aufwand");
  const zeilen = reihen.zeilen.filter((z) => z.charakter === seite);
  const offen = zeilen.find((z) => schluessel(z) === zustand.offen) ?? null;

  const name = (z: KategorieReihe) => (z.kategorieId ? z.name : seite === "Umschichtung" ? t("historie.umbuchungen") : t("historie.ohneKategorie"));

  /**
   * Der Trend ist eine ungerichtete Grösse an einer Schwelle (`ui/CLAUDE.md`, „Zahlen
   * anzeigen"): amber, wenn Ausgaben um mehr als ein Zehntel steigen oder Einnahmen um
   * mehr als ein Zehntel fallen — sonst neutral, nie grün.
   */
  const trendAuffaellig = (tr: number) => (seite === "Ertrag" ? tr < -0.1 : tr > 0.1);
  const trendText = (tr: number) => {
    const p = Math.round(tr * 100);
    return p === 0 ? "±0 %" : `${p > 0 ? "+" : "−"}${Math.abs(p)} %`;
  };

  return (
    <>
      <Card
        title={t("kategorienAuswertung.titel")}
        subtitle={t("kategorienAuswertung.untertitel", { monate: reihen.monate.length })}
        action={
          <Filterleiste>
            <ZeitraumWahl wert={zustand.zeitraum} aufAenderung={(z) => setZustand({ ...zustand, zeitraum: z, offen: null })} />
          </Filterleiste>
        }
      >
        {seiten.length > 1 && (
          <Umschalter
            label={t("kategorienAuswertung.seiteWahl")}
            optionen={seiten.map((s) => ({
              wert: s,
              text: t(s === "Aufwand" ? "historie.sektionAusgaben" : s === "Ertrag" ? "historie.sektionEinnahmen" : "historie.sektionUmschichtung"),
            }))}
            wert={seite}
            aufAendern={(s) => setZustand({ ...zustand, seite: s, offen: null })}
            style={{ marginBottom: "var(--sp-3)" }}
          />
        )}

        {zeilen.length === 0 ? (
          <div className="muted">{t("historie.katLeer")}</div>
        ) : (
          <DataTable
            sortable
            pageSize={25}
            rows={zeilen}
            onRowClick={(z) => setZustand({ ...zustand, offen: zustand.offen === schluessel(z) ? null : schluessel(z) })}
            istAktiv={(z) => schluessel(z) === zustand.offen}
            columns={[
              {
                key: "name",
                label: t("kategorienAuswertung.spalteKategorie"),
                schmal: "titel",
                sortValue: (z) => name(z),
                render: (z) => (
                  <span>
                    {name(z)}
                    {z.elternName && <span className="hinweis" style={{ marginLeft: "var(--sp-2)" }}>{z.elternName}</span>}
                  </span>
                ),
              },
              {
                key: "verlauf",
                label: t("kategorienAuswertung.spalteVerlauf"),
                sortable: false,
                render: (z) => <Monatsbalken werte={z.monate} />,
              },
              {
                key: "schnitt",
                label: `${t("kategorienAuswertung.spalteSchnitt")} ${geld.symbol}`,
                align: "right",
                // Schmal ist der Schnitt die Zahl rechts: die Summe passt mit Tausender und
                // Vorzeichen nicht in die feste Wertspalte, und der Schnitt ist ohnehin die
                // Zahl, die sich zwischen den Zeilen vergleichen lässt.
                schmal: "wert",
                sortValue: (z) => Math.abs(z.schnitt),
                render: (z) => geld.format(z.schnitt, { mitVorzeichen: true }),
              },
              {
                key: "summe",
                label: `${t("kategorienAuswertung.spalteSumme")} ${geld.symbol}`,
                align: "right",
                schmal: "zweitzeile",
                sortValue: (z) => Math.abs(z.summe),
                render: (z) => <span style={{ color: geldFarbe(z.summe), fontWeight: "var(--fw-bold)" }}>{geld.format(z.summe, { mitVorzeichen: true })}</span>,
              },
              {
                key: "anteil",
                label: t("kategorienAuswertung.spalteAnteil"),
                align: "right",
                schmal: "zweitzeile",
                render: (z) => prozent(z.anteil, 1),
              },
              {
                key: "trend",
                label: t("kategorienAuswertung.spalteTrend"),
                align: "right",
                sortValue: (z) => z.trend ?? 0,
                render: (z) =>
                  z.trend == null ? (
                    <span className="muted">—</span>
                  ) : (
                    <span style={{ color: warnFarbe(trendAuffaellig(z.trend)) }}>{trendText(z.trend)}</span>
                  ),
              },
            ]}
          />
        )}
        <div className="hinweis" style={{ marginTop: "var(--sp-3)" }}>{t("kategorienAuswertung.hinweis")}</div>
      </Card>

      {offen && (
        <Card
          title={name(offen)}
          subtitle={t("kategorienAuswertung.detailUntertitel", {
            summe: geld.formatMitSymbol(offen.summe, { mitVorzeichen: true }),
            schnitt: geld.formatMitSymbol(offen.schnitt, { mitVorzeichen: true }),
          })}
        >
          {/* Eine Kategorie fliesst in eine Richtung; ihr Monatsbetrag steht deshalb in
              der Spalte, die zu ihrer Seite gehört, die andere bleibt leer. Ein Rückfluss
              (Erstattung) zieht den Balken nach unten — nicht auf die andere Seite. */}
          <MonatsFlussChart
            labels={[...reihen.monate]}
            einnahmen={offen.monate.map((v) => (seite === "Ertrag" ? Math.max(0, v) : 0))}
            ausgaben={offen.monate.map((v) => (seite === "Ertrag" ? 0 : Math.max(0, -v)))}
          />
          {offen.kategorieId && (
            <div style={{ marginTop: "var(--sp-4)" }}>
              <KategorieBuchungen basis={basis} kategorieId={offen.kategorieId} von={von} bis={bis} onBuchung={onBuchung} />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
