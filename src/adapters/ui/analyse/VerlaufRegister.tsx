// Register „Verlauf" — was Monat für Monat geflossen ist, und darunter, wofür.
//
// Seit 2026-11-11 trägt es die Auswertung eines Monats SELBST: ein Klick auf einen Monat
// (im Chart oder in der Tabelle) öffnet unter der Karte die Aufschlüsselung dieses Monats
// nach Kategorien. Vorher stand sie im Register „Kategorien", das denselben Monat
// mitführte — man klickte hier und musste dort nachsehen.
//
// Zeitraum, gewählter Monat und Darstellung gehören diesem Register allein. Sie liegen
// trotzdem im Screen (`zustand`), damit ein Wechsel des Reiters sie nicht verwirft.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { analyseFenster, analyseVerlauf, type Analysebasis, type IstBuchung, type Zeitraum } from "../../../application";
import { Card, DataTable, KPIStat } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe, geldTon } from "../bausteine/geldFarbe";
import { Umschalter } from "../bausteine/Umschalter";
import { Auswahl } from "../bausteine/Auswahl";
import { Aufschluesselung } from "./Aufschluesselung";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { Filterleiste, ZeitraumWahl } from "./ZeitraumWahl";

export interface VerlaufZustand {
  readonly zeitraum: Zeitraum;
  /** „YYYY-MM" des gewählten Monats — als Label, nicht als Index: der Index verschiebt sich, wenn der Zeitraum wechselt. */
  readonly monat: string | null;
  /**
   * Dieselben Monatsdaten in drei Darstellungen. Vorher standen alle drei untereinander —
   * dreimal dieselbe Information. Jetzt eine Fläche, umschaltbar.
   */
  readonly ansicht: "fluss" | "saldo" | "tabelle";
}

export const VERLAUF_ANFANG: VerlaufZustand = { zeitraum: "12", monat: null, ansicht: "fluss" };

export function VerlaufRegister({
  basis,
  heute,
  zustand,
  setZustand,
  onBuchung,
}: {
  basis: Analysebasis;
  heute: string;
  zustand: VerlaufZustand;
  setZustand: (z: VerlaufZustand) => void;
  onBuchung: (b: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const { von, bis } = useMemo(() => analyseFenster(basis, zustand.zeitraum, heute), [basis, zustand.zeitraum, heute]);
  const verlauf = useMemo(() => analyseVerlauf(basis, von, bis), [basis, von, bis]);

  const monat = verlauf.find((m) => m.label === zustand.monat) ?? null;
  const aktivIndex = monat ? verlauf.indexOf(monat) : null;
  const waehlen = (label: string | null) => setZustand({ ...zustand, monat: label === zustand.monat ? null : label });

  /**
   * Kennzahlen — über den ganzen Zeitraum oder über den gewählten Monat. Der Durchschnitt
   * bleibt IMMER der des Zeitraums: er ist der Massstab, gegen den ein einzelner Monat
   * etwas aussagt.
   */
  const oeEin = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.einnahmen, 0) / verlauf.length) : 0;
  const oeAus = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.ausgaben, 0) / verlauf.length) : 0;
  const summeEin = monat ? monat.einnahmen : verlauf.reduce((s, m) => s + m.einnahmen, 0);
  const summeAus = monat ? monat.ausgaben : verlauf.reduce((s, m) => s + m.ausgaben, 0);
  const netto = summeEin + summeAus;
  const saldoJetzt = verlauf.length ? verlauf[verlauf.length - 1].saldo : 0;

  /** „+12 %" / „−8 %" als Zusatz an einer Kennzahl; U+2212 wie überall beim Geld. */
  function vergleich(wert: number, schnitt: number): string | undefined {
    if (!monat || schnitt === 0) return undefined;
    const a = Math.round(((wert - schnitt) / Math.abs(schnitt)) * 100);
    if (a === 0) return undefined;
    return t("historie.vsDurchschnitt", { prozent: (a > 0 ? "+" : "−") + Math.abs(a) });
  }

  // Monat direkt wählbar — der Klick auf den Chart macht dasselbe, ist bei vielen
  // Monaten aber Zielübung. Beide schreiben denselben Zustand.
  const monatWahl = (
    <Auswahl
      ariaLabel={t("historie.monatWaehlen")}
      wert={zustand.monat ?? ""}
      aufAenderung={(v) => setZustand({ ...zustand, monat: v === "" ? null : v })}
      optionen={[{ wert: "", text: t("historie.alleMonate") }, ...verlauf.map((m) => ({ wert: m.label, text: m.label }))]}
    />
  );

  return (
    <>
      <Card
        title={t("historie.verlaufTitel")}
        subtitle={t(`historie.verlauf.${zustand.ansicht}`)}
        action={
          <Filterleiste>
            {monatWahl}
            <ZeitraumWahl wert={zustand.zeitraum} aufAenderung={(z) => setZustand({ ...zustand, zeitraum: z, monat: null })} />
          </Filterleiste>
        }
      >
        {/* Alle fünf tragen GERICHTETES Geld, also kommt die Farbe aus dem Vorzeichen
            (`bausteine/geldFarbe`). */}
        <div className="kpis" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
          <KPIStat size="chip" label={monat ? t("historie.kpiEinnahmenMonat", { monat: monat.label }) : t("historie.kpiEinnahmen")}
            value={geld.format(summeEin)} unit={geld.symbol} tone={geldTon(summeEin)} meta={vergleich(summeEin, oeEin)} />
          <KPIStat size="chip" label={monat ? t("historie.kpiAusgabenMonat", { monat: monat.label }) : t("historie.kpiAusgaben")}
            value={geld.format(summeAus)} unit={geld.symbol} tone={geldTon(summeAus)} meta={vergleich(summeAus, oeAus)} />
          <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={geldTon(netto)} />
          {/* Der Massstab: was ein Monat im Schnitt kostet — auch bei gewähltem Monat. */}
          <KPIStat size="chip" label={t("historie.kpiOeAusgaben")} value={geld.format(oeAus)} unit={geld.symbol} tone={geldTon(oeAus)} />
          <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={geldTon(saldoJetzt)} />
        </div>

        <Umschalter
          label={t("historie.ansichtWahl")}
          optionen={(["fluss", "saldo", "tabelle"] as const).map((a) => ({ wert: a, text: t(`historie.ansicht.${a}`) }))}
          wert={zustand.ansicht}
          aufAendern={(a) => setZustand({ ...zustand, ansicht: a })}
          style={{ marginBottom: "var(--sp-3)" }}
        />

        {verlauf.length > 0 && zustand.ansicht === "fluss" && (
          <MonatsFlussChart
            labels={verlauf.map((m) => m.label)}
            einnahmen={verlauf.map((m) => m.einnahmen)}
            ausgaben={verlauf.map((m) => -m.ausgaben)}
            onMonatClick={(i) => waehlen(verlauf[i].label)}
            aktivIndex={aktivIndex}
          />
        )}

        {verlauf.length > 0 && zustand.ansicht === "saldo" && (
          <SaldoVerlaufChart labels={verlauf.map((m) => m.label)} werte={verlauf.map((m) => m.saldo)} legende={t("historie.saldoLegende")} />
        )}

        {verlauf.length > 0 && zustand.ansicht === "tabelle" && (
          <DataTable
            sortable
            pageSize={24}
            onRowClick={(m) => waehlen(m.label)}
            istAktiv={(m) => m.label === zustand.monat}
            columns={[
              { key: "label", label: t("historie.spalteMonat") },
              { key: "einnahmen", label: `${t("historie.spalteEinnahmen")} ${geld.symbol}`, align: "right", render: (m) => (m.einnahmen ? geld.format(m.einnahmen) : "—") },
              { key: "ausgaben", label: `${t("historie.spalteAusgaben")} ${geld.symbol}`, align: "right", render: (m) => (m.ausgaben ? geld.format(m.ausgaben) : "—") },
              { key: "netto", label: `${t("historie.spalteNetto")} ${geld.symbol}`, align: "right", render: (m) => <span style={{ color: geldFarbe(m.netto), fontWeight: "var(--fw-bold)" }}>{geld.format(m.netto, { mitVorzeichen: true })}</span> },
              { key: "umschichtung", label: `${t("historie.spalteUmschichtung")} ${geld.symbol}`, align: "right", render: (m) => (m.umschichtung ? geld.format(m.umschichtung, { mitVorzeichen: true }) : "—") },
              { key: "saldo", label: `${t("historie.spalteSaldo")} ${geld.symbol}`, align: "right", render: (m) => geld.format(m.saldo, { mitVorzeichen: true }) },
            ]}
            rows={[...verlauf].reverse()}
          />
        )}

        {!monat && zustand.ansicht !== "saldo" && (
          <div className="hinweis" style={{ marginTop: "var(--sp-3)" }}>{t("historie.monatAnklicken")}</div>
        )}
      </Card>

      {/* Neben der Karte, nicht darin — keine Karte in einer Karte. Der `key` lässt die
          Aufschlüsselung bei jedem Monat zugeklappt beginnen. */}
      {monat && (
        <Card title={t("historie.monatAuswertung", { monat: monat.label })} subtitle={t("historie.monatAuswertungUntertitel")}>
          <Aufschluesselung key={monat.label} basis={basis} von={`${monat.label}-01`} bis={`${monat.label}-01`} onBuchung={onBuchung} />
        </Card>
      )}
    </>
  );
}
