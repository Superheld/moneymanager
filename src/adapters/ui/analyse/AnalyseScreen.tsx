// Analyse (Rückblick) — echte Einnahmen und Ausgaben pro Monat aus den verbuchten
// Ist-Buchungen, realer Saldo-Verlauf über die Zeit, Aufschlüsselung nach Kategorien.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().
//
// Abgetrennt von der Übersicht (2026-08-19): dort steht, was JETZT gilt — die drei
// Monatskarten und die Budgets des laufenden Monats. Alles, was einen Zeitraum
// auswertet, hat einen eigenen Bereich bekommen. Vorher war das ein Screen, den man
// nach unten scrollen musste, bis die Kategorien kamen.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseAufschluesselung,
  analyseBuchungen,
  analyseFenster,
  analyseFensterTaggenau,
  analyseGruppen,
  analyseVerlauf,
  type Analysebasis,
  type GruppenSumme,
  type Depotdaten,
  type IstBuchung,
} from "../../../application";
import { analyse, depots } from "../../dienste";
import { Button, Card, CoverageTrack, DataTable, KPIStat, Pill } from "../bausteine";
import { AUFKLAPP_ZEILEN_BREIT, AUFKLAPP_ZEILEN_SCHMAL, aufklappHoehe } from "../bausteine/aufklappen";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { DepotAnsicht } from "./DepotAnsicht";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { Auswahl } from "../bausteine/Auswahl";
import { PageHead } from "../bausteine/PageHead";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

import type { KategorieSumme } from "../../../application";

type Zeitraum = "12" | "24" | "jahr" | "alles";

/**
 * Eine Sektion (Ausgaben/Einnahmen/Umschichtungen) mit ihren Zeilen.
 *
 * `monate` > 1 blendet den Schnitt pro Monat ein: über einen Zeitraum sagt „4.800 € für
 * Lebensmittel" wenig, „Ø 400 €/Monat" dagegen sofort etwas.
 */
function KategorieSektion({ titel, items, ohneLabel, onSelect, aktivId, renderDetail, monate = 1 }: { titel: string; items: KategorieSumme[]; ohneLabel?: string; onSelect?: (id: string, name: string) => void; aktivId?: string; renderDetail?: (id: string) => ReactNode; monate?: number }) {
  const { t } = useTranslation();
  const geld = useGeld();
  /** „450,00 € · Ø 37,50" — der Schnitt steht bei der Zahl, mit der er sich vergleicht. */
  const mitSchnitt = (summe: number) =>
    monate > 1
      ? `${geld.formatMitSymbol(summe, { mitVorzeichen: true })} · Ø ${geld.format(Math.round(summe / monate))}`
      : geld.formatMitSymbol(summe, { mitVorzeichen: true });

  if (items.length === 0) return null;
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.summe)));
  const summe = items.reduce((s, i) => s + i.summe, 0);
  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
        <span>{titel}</span>
        <span className="num">{geld.formatMitSymbol(summe, { mitVorzeichen: true })}</span>
      </div>
      {items.map((i) => {
        const klickbar = !!onSelect && !!i.kategorieId;
        const aktiv = !!aktivId && i.kategorieId === aktivId;
        return (
          // Zeile und Detail sind GESCHWISTER, nicht ineinander — wie in der
          // Gruppen-Ansicht. Lag das Detail im klickbaren Div, schloss jeder Klick in
          // die Tabelle die Kategorie wieder (der Klick blubberte zur Zeile hoch), und
          // die Einfärbung der offenen Zeile legte sich als Rahmen um die Tabelle.
          <div key={i.kategorieId ?? "__ohne"}>
            <div
              onClick={klickbar ? () => onSelect!(i.kategorieId!, i.name) : undefined}
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: klickbar ? "pointer" : "default", background: aktiv ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
            >
              <CoverageTrack
                value={Math.abs(i.summe)}
                max={maxAbs}
                over={false}
                label={`${aktiv ? "▾ " : "▸ "}${i.kategorieId ? i.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${i.anzahl}`}
                right={mitSchnitt(i.summe)}
              />
            </div>
            {aktiv && renderDetail && i.kategorieId && renderDetail(i.kategorieId)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sektion in der Hauptgruppen-Ansicht: drei Ebenen statt zwei. Aufklappen zeigt erst die
 * Unterkategorien der Gruppe, deren Aufklappen dann die Buchungen — so bleibt die oberste
 * Ebene lesbar, auch wenn darunter 69 Kategorien hängen.
 */
function GruppenSektion({ titel, gruppen, ohneLabel, offeneGruppe, onGruppe, offeneKat, onKat, renderDetail, monate = 1 }: {
  titel: string;
  gruppen: GruppenSumme[];
  ohneLabel?: string;
  offeneGruppe?: string;
  onGruppe: (id: string) => void;
  offeneKat?: string;
  onKat: (id: string) => void;
  renderDetail: (id: string) => ReactNode;
  monate?: number;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  /** „450,00 € · Ø 37,50" — der Schnitt steht bei der Zahl, mit der er sich vergleicht. */
  const mitSchnitt = (summe: number) =>
    monate > 1
      ? `${geld.formatMitSymbol(summe, { mitVorzeichen: true })} · Ø ${geld.format(Math.round(summe / monate))}`
      : geld.formatMitSymbol(summe, { mitVorzeichen: true });

  if (gruppen.length === 0) return null;
  const maxAbs = Math.max(1, ...gruppen.map((g) => Math.abs(g.summe)));
  const summe = gruppen.reduce((s, g) => s + g.summe, 0);

  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
        <span>{titel}</span>
        <span className="num">{geld.formatMitSymbol(summe, { mitVorzeichen: true })}</span>
      </div>
      {gruppen.map((g) => {
        const schluessel = g.kategorieId ?? "__ohne";
        const offen = offeneGruppe === schluessel;
        return (
          <div key={schluessel}>
            <div
              onClick={() => onGruppe(schluessel)}
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: "pointer", background: offen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
            >
              <CoverageTrack
                value={Math.abs(g.summe)}
                max={maxAbs}
                over={false}
                label={`${offen ? "▾ " : "▸ "}${g.kategorieId ? g.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${g.anzahl}`}
                right={mitSchnitt(g.summe)}
              />
            </div>
            {offen && (
              <div style={{
                marginLeft: "var(--sp-4)", borderLeft: "2px solid var(--line-soft)", paddingLeft: "var(--sp-2)",
                // Fünf Unterkategorien, dann wird gescrollt (siehe bausteine/aufklappen.ts).
                // Die 43 px sind die gerechnete Zeilenhöhe: Polsterung 5 px oben und unten,
                // darin der Balken mit seiner Beschriftung.
                //
                // Der Deckel gilt NUR, solange nichts darin aufgeklappt ist. Sonst läge die
                // Buchungstabelle einer Unterkategorie in einem Rahmen von fünf Zeilen
                // Höhe — ein Scrollbereich in einem Scrollbereich, und der äussere frisst
                // die Hälfte des inneren.
                maxHeight: g.kinder.some((k) => !!k.kategorieId && offeneKat === k.kategorieId)
                  ? undefined
                  : aufklappHoehe(AUFKLAPP_ZEILEN_SCHMAL, 43),
                overflowY: "auto",
              }}>
                {g.kinder.map((k) => {
                  const katOffen = !!k.kategorieId && offeneKat === k.kategorieId;
                  return (
                    <div key={k.kategorieId ?? "__k-ohne"}>
                      <div
                        onClick={(e) => { e.stopPropagation(); if (k.kategorieId) onKat(k.kategorieId); }}
                        style={{ padding: "5px 8px", borderRadius: "var(--r-md)", cursor: k.kategorieId ? "pointer" : "default", background: katOffen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
                      >
                        <CoverageTrack
                          value={Math.abs(k.summe)}
                          max={Math.max(1, ...g.kinder.map((x) => Math.abs(x.summe)))}
                          over={false}
                          label={`${katOffen ? "▾ " : "▸ "}${k.kategorieId ? k.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${k.anzahl}`}
                          right={mitSchnitt(k.summe)}
                        />
                      </div>
                      {katOffen && k.kategorieId && renderDetail(k.kategorieId)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Heute als ISO — die Uhr wird hier gelesen, gerechnet wird in der Anwendungsschicht. */
function toIsoHeute(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function AnalyseScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [basis, setBasis] = useState<Analysebasis | null>(null);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("12");
  const [aktivMonat, setAktivMonat] = useState<number | null>(null);
  const [offeneKat, setOffeneKat] = useState<string | null>(null);
  const [detail, setDetail] = useState<IstBuchung | null>(null);
  /**
   * Dieselben Monatsdaten in drei Darstellungen. Vorher standen alle drei untereinander —
   * dreimal dieselbe Information, und der Screen wurde so lang, dass die Kategorien
   * darunter aus dem Blick gerieten. Jetzt eine Fläche, umschaltbar.
   */
  const [ansicht, setAnsicht] = useState<"fluss" | "saldo" | "tabelle">("fluss");
  /** Kategorien einzeln oder zu Hauptgruppen gebündelt. */
  const [ebene, setEbene] = useState<"kategorie" | "gruppe">("kategorie");
  const [offeneGruppe, setOffeneGruppe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [geladen, setGeladen] = useState(false);
  /**
   * Die Depots. Getrennt geladen, weil sie mit der übrigen Analyse nichts teilen: sie
   * bestehen aus Beobachtungen, nicht aus Buchungen, und gehen in keine Kennzahl ein.
   */
  const [depotdaten, setDepotdaten] = useState<Depotdaten | null>(null);

  // Gemeinsam laden und in EINEM Schritt setzen — kein Render-Fenster, in dem die
  // Aufschlüsselung gegen eine noch leere Kategorie-Liste rechnet (sonst „ohne Kategorie").
  async function laden() {
    try {
      setBasis(await analyse());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setGeladen(true);
    }
  }
  useEffect(() => {
    laden();
    depots()
      .then(setDepotdaten)
      .catch(() => setDepotdaten(null));
  }, []);

  const heute = useMemo(() => toIsoHeute(), []);
  const { von, bis } = useMemo(
    () => (basis ? analyseFenster(basis, zeitraum, heute) : { von: heute, bis: heute }),
    [basis, zeitraum, heute],
  );

  // Der Monatsverlauf rechnet in Monaten und bekommt deshalb `bis` als Monatsmarke.
  // Alles, was an einzelnen TAGEN hängt — bislang nur das Depot —, braucht das Ende
  // desselben Monats, sonst fällt der halbe laufende Monat aus dem Fenster.
  const bisTag = useMemo(() => analyseFensterTaggenau(bis), [bis]);

  const verlauf = useMemo(() => (basis ? analyseVerlauf(basis, von, bis) : []), [basis, von, bis]);

  const aufschluesselung = useMemo(() => {
    if (!basis || verlauf.length === 0) return null;
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    const bvon = idx != null ? `${verlauf[idx].label}-01` : von;
    const bbis = idx != null ? `${verlauf[idx].label}-01` : bis;
    return { label: idx != null ? verlauf[idx].label : null, items: analyseAufschluesselung(basis, bvon, bbis) };
  }, [aktivMonat, verlauf, basis, von, bis]);

  const ist = basis?.buchungen ?? [];
  const kategorien = basis?.kategorien ?? [];

  const detailFenster = useMemo(() => {
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    return {
      bvon: idx != null ? `${verlauf[idx].label}-01` : von,
      bbis: idx != null ? `${verlauf[idx].label}-01` : bis,
    };
  }, [aktivMonat, verlauf, von, bis]);

  /**
   * Kennzahlen — entweder über den ganzen Zeitraum oder über den gewählten Monat.
   *
   * Der Durchschnitt bleibt IMMER der des Zeitraums: er ist der Maßstab, gegen den ein
   * einzelner Monat etwas aussagt. Ein „Durchschnitt eines Monats" wäre der Monat selbst.
   */
  const monat = aktivMonat != null && aktivMonat < verlauf.length ? verlauf[aktivMonat] : null;
  /** Über wie viele Monate die Aufschlüsselung rechnet — bei gewähltem Monat genau einer. */
  const monateImFenster = monat ? 1 : Math.max(1, verlauf.length);

  const oeEin = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.einnahmen, 0) / verlauf.length) : 0;
  const oeAus = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.ausgaben, 0) / verlauf.length) : 0;

  const summeEin = monat ? monat.einnahmen : verlauf.reduce((s, m) => s + m.einnahmen, 0);
  const summeAus = monat ? monat.ausgaben : verlauf.reduce((s, m) => s + m.ausgaben, 0);
  const netto = summeEin + summeAus;
  const saldoJetzt = verlauf.length ? verlauf[verlauf.length - 1].saldo : 0;

  /**
   * Abweichung eines Monatswerts vom Zeitraum-Durchschnitt, in Prozent.
   * `null`, wenn es keinen Vergleich gibt (kein Monat gewählt, oder Ø ist 0).
   */
  function abweichung(wert: number, schnitt: number): number | null {
    if (!monat || schnitt === 0) return null;
    return Math.round(((wert - schnitt) / Math.abs(schnitt)) * 100);
  }

  /** „+12 %" / „−8 %" als Zusatz an einer Kennzahl; U+2212 wie überall beim Geld. */
  function vergleich(wert: number, schnitt: number): string | undefined {
    const a = abweichung(wert, schnitt);
    if (a == null || a === 0) return undefined;
    return t("historie.vsDurchschnitt", { prozent: (a > 0 ? "+" : "\u2212") + Math.abs(a) });
  }

  // `sticky`: die Kopfzeile bleibt beim Scrollen im aufgeklappten Bereich stehen. Ohne das
  // scrollt sie nach oben weg, und ab der elften Zeile steht man vor fuenf namenlosen
  // Spalten. Der Hintergrund ist Pflicht — ein durchsichtiger Kopf laesst die Zeilen
  // durchscheinen, waehrend sie darunter durchlaufen.
  const detailTh = { textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 } as const;
  const detailTd = { padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", color: "var(--ink)" } as const;

  function detailTabelle(kategorieId: string) {
    const bs = basis ? analyseBuchungen(basis, kategorieId, detailFenster.bvon, detailFenster.bbis) : [];
    if (bs.length === 0) return <div className="muted" style={{ padding: "8px" }}>{t("historie.detailLeer")}</div>;
    return (
      <div style={{
        background: "var(--surface-2, rgba(0,0,0,.015))", borderRadius: "var(--r-md)",
        padding: "4px 8px", margin: "4px 0 10px",
        // Zehn Zeilen, dann wird gescrollt (siehe bausteine/aufklappen.ts). Die Zahlen sind
        // die gerechnete Zeilenhoehe dieser Tabelle: 8 px Polsterung oben und unten, eine
        // Textzeile in 12,5 px und die Haarlinie darunter; die Kopfzeile faellt etwas
        // niedriger aus, weil ihre Schrift kleiner ist.
        maxHeight: aufklappHoehe(AUFKLAPP_ZEILEN_BREIT, 36, 34),
        overflowY: "auto",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
          <thead>
            <tr>
              <th style={detailTh}>{t("historie.spalteDatum")}</th>
              <th style={detailTh}>{t("historie.spalteEmpf")}</th>
              <th style={detailTh}>{t("historie.spalteZweck")}</th>
              <th style={detailTh}>{t("historie.spalteKonto")}</th>
              <th style={{ ...detailTh, textAlign: "right" }}>{t("historie.spalteBetrag")} {geld.symbol}</th>
            </tr>
          </thead>
          <tbody>
            {bs.slice(0, 50).map((z) => {
              const zweck = z.verwendungszweck;
              return (
                // Anklickbar: beim Durchsehen einer Kategorie stößt man auf Buchungen,
                // die eine Korrektur brauchen — der Umweg über den Konto-Auszug entfällt.
                //
                // `buchungszeile` faerbt die Zeile beim Ueberfahren ein. Der Zeiger allein
                // war zu wenig: er zeigt sich erst, wenn man schon draufsteht, und in einer
                // Liste probiert niemand jede Zeile durch. Dieselbe Klasse tragen die
                // Buchungszeilen in der Uebersicht — was gleich funktioniert, sieht gleich aus.
                <tr key={z.buchung.id} className="buchungszeile" onClick={() => setDetail(z.buchung)} title={t("historie.detailOeffnen")}>
                  <td style={detailTd}>{z.buchung.datum.split("-").reverse().join(".")}</td>
                  <td style={{ ...detailTd, fontWeight: "var(--fw-bold)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {z.empfaenger || "—"}
                      </span>
                      {/* Dieselbe Markierung wie im Kontoauszug. Sie zählt hier sogar
                          mehr: die Analyse fragt „wofür ging das Geld", und dass ein
                          Posten aus einem laufenden Vertrag stammt, ist die halbe
                          Antwort — bei ihm ist die Frage nicht „war das nötig", sondern
                          „läuft der noch". */}
                      {z.vertragsname && (
                        <span title={t("konten.pillVertrag", { anbieter: z.vertragsname })} style={{ flex: "0 0 auto" }}>
                          <Pill variant="plan">{z.vertragsname}</Pill>
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={{ ...detailTd, color: "var(--ink-3)" }}>{zweck.length > 45 ? zweck.slice(0, 45) + "…" : zweck}</td>
                  <td style={{ ...detailTd, color: "var(--ink-3)" }}>{z.kontoName || "—"}</td>
                  <td style={{ ...detailTd, textAlign: "right", fontVariantNumeric: "tabular-nums", color: geldFarbe(z.buchung.betrag) }}>{geld.format(z.buchung.betrag, { mitVorzeichen: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bs.length > 50 && <div className="muted" style={{ padding: "6px 8px", fontSize: "var(--fs-2xs)" }}>{t("historie.detailMehr", { n: bs.length - 50 })}</div>}
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHead title={t("analyse.titel")} subtitle={t("analyse.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--danger, #c0392b)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {!geladen ? null : ist.length === 0 && !fehler ? (
        <Card>{t("historie.leer")}</Card>
      ) : (
        <>
          <div className="kpis">
            <KPIStat size="chip" label={monat ? t("historie.kpiEinnahmenMonat", { monat: monat.label }) : t("historie.kpiEinnahmen")}
              value={geld.format(summeEin)} unit={geld.symbol} tone="ok" meta={vergleich(summeEin, oeEin)} />
            <KPIStat size="chip" label={monat ? t("historie.kpiAusgabenMonat", { monat: monat.label }) : t("historie.kpiAusgaben")}
              value={geld.format(summeAus)} unit={geld.symbol} tone={summeAus < 0 ? "warn" : "default"} meta={vergleich(summeAus, oeAus)} />
            <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={netto < 0 ? "warn" : "ok"} />
            {/* Der Maßstab: was ein Monat im Schnitt kostet. Bleibt beim Zeitraum-Ø,
                auch wenn ein einzelner Monat gewählt ist — sonst gäbe es nichts zu vergleichen. */}
            <KPIStat size="chip" label={t("historie.kpiOeAusgaben")} value={geld.format(oeAus)} unit={geld.symbol} tone={oeAus < 0 ? "warn" : "default"} />
            <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={saldoJetzt < 0 ? "warn" : "default"} />
          </div>

          <Card
            title={t("historie.verlaufTitel")}
            subtitle={t(`historie.verlauf.${ansicht}`)}
            action={
              <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                {/* Monat direkt wählbar — der Klick auf den Chart macht dasselbe, ist bei
                    vielen Monaten aber Zielübung. Beide schreiben denselben Zustand. */}
                <Auswahl
                  ariaLabel={t("historie.monatWaehlen")}
                  wert={aktivMonat == null ? "" : String(aktivMonat)}
                  aufAenderung={(v) => { setAktivMonat(v === "" ? null : Number(v)); setOffeneKat(null); }}
                  optionen={[
                    { wert: "", text: t("historie.alleMonate") },
                    ...verlauf.map((m, i) => ({ wert: String(i), text: m.label })),
                  ]}
                />
                <Auswahl
                  ariaLabel={t("historie.zeitraumWaehlen")}
                  wert={zeitraum}
                  aufAenderung={(v) => { setZeitraum(v as Zeitraum); setAktivMonat(null); setOffeneKat(null); }}
                  optionen={[
                    { wert: "12", text: t("historie.zr12") },
                    { wert: "24", text: t("historie.zr24") },
                    { wert: "jahr", text: t("historie.zrJahr") },
                    { wert: "alles", text: t("historie.zrAlles") },
                  ]}
                />
              </span>
            }
          >
            {/* Umschalter: eine Fläche, drei Blicke auf dieselben Monate. */}
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)", marginBottom: "var(--sp-3)" }}>
              {(["fluss", "saldo", "tabelle"] as const).map((a, i) => {
                const an = ansicht === a;
                return (
                  <button key={a} type="button" aria-pressed={an} onClick={() => setAnsicht(a)}
                    style={{ padding: "6px 12px", fontSize: "12.5px", fontWeight: an ? "var(--fw-bold)" : "var(--fw-semi)", fontFamily: "var(--font-ui)", border: "none", borderLeft: i ? "1px solid var(--line-soft)" : "none", background: an ? "var(--accent-wash)" : "transparent", color: an ? "var(--accent-deep)" : "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {t(`historie.ansicht.${a}`)}
                  </button>
                );
              })}
            </div>

            {verlauf.length > 0 && ansicht === "fluss" && (
              <MonatsFlussChart
                labels={verlauf.map((m) => m.label)}
                einnahmen={verlauf.map((m) => m.einnahmen)}
                ausgaben={verlauf.map((m) => -m.ausgaben)}
                onMonatClick={(i) => setAktivMonat((cur) => (cur === i ? null : i))}
                aktivIndex={aktivMonat}
              />
            )}

            {verlauf.length > 0 && ansicht === "saldo" && (
              <SaldoVerlaufChart labels={verlauf.map((m) => m.label)} werte={verlauf.map((m) => m.saldo)} legende={t("historie.saldoLegende")} />
            )}

            {verlauf.length > 0 && ansicht === "tabelle" && (
              <DataTable
                sortable
                pageSize={24}
                onRowClick={(m) => setAktivMonat((cur) => { const i = verlauf.findIndex((v) => v.label === m.label); return cur === i ? null : i; })}
                istAktiv={(m) => aktivMonat != null && verlauf[aktivMonat]?.label === m.label}
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
          </Card>

          {aufschluesselung && kategorien.length > 0 && (
            <Card
              title={t("historie.katTitel")}
              subtitle={aufschluesselung.label ? t("historie.katMonat", { monat: aufschluesselung.label }) : t("historie.katZeitraum")}
              action={
                <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                  {aufschluesselung.label && <Button variant="ghost" onClick={() => setAktivMonat(null)}>{t("historie.alleMonate")}</Button>}
                  <Auswahl
                    ariaLabel={t("historie.ebeneWaehlen")}
                    wert={ebene}
                    aufAenderung={(v) => { setEbene(v as "kategorie" | "gruppe"); setOffeneKat(null); setOffeneGruppe(null); }}
                    optionen={[
                      { wert: "kategorie", text: t("historie.ebeneKategorie") },
                      { wert: "gruppe", text: t("historie.ebeneGruppe") },
                    ]}
                  />
                </span>
              }
                         >
              {(["Aufwand", "Ertrag", "Umschichtung"] as const).map((ch) => {
                const titel = ch === "Aufwand" ? t("historie.sektionAusgaben") : ch === "Ertrag" ? t("historie.sektionEinnahmen") : t("historie.sektionUmschichtung");
                const ohneLabel = ch === "Umschichtung" ? t("historie.umbuchungen") : undefined;
                const items = aufschluesselung.items.filter((i) => i.charakter === ch);
                return ebene === "gruppe" ? (
                  <GruppenSektion
                    key={ch}
                    titel={titel}
                    gruppen={basis ? analyseGruppen(basis, items) : []}
                    ohneLabel={ohneLabel}
                    monate={monateImFenster}
                    offeneGruppe={offeneGruppe ?? undefined}
                    onGruppe={(id) => { setOffeneGruppe((cur) => (cur === id ? null : id)); setOffeneKat(null); }}
                    offeneKat={offeneKat ?? undefined}
                    onKat={(id) => setOffeneKat((cur) => (cur === id ? null : id))}
                    renderDetail={detailTabelle}
                  />
                ) : (
                  <KategorieSektion
                    key={ch}
                    titel={titel}
                    items={items}
                    ohneLabel={ohneLabel}
                    monate={monateImFenster}
                    onSelect={(id) => setOffeneKat((cur) => (cur === id ? null : id))}
                    aktivId={offeneKat ?? undefined}
                    renderDetail={detailTabelle}
                  />
                );
              })}
              {aufschluesselung.items.length === 0 && <div className="muted">{t("historie.katLeer")}</div>}
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>{t("historie.katKlickHinweis")}</div>
            </Card>
          )}

          {/* Depots zuletzt: sie beantworten eine eigene Frage und mischen sich in die
              Kategorien-Auswertung darüber nicht ein. Nebeneinander wie in der Übersicht —
              bei einem einzelnen Depot nimmt es die volle Breite. */}
          {depotdaten && depotdaten.depots.length > 0 && (
            <div className="karten-paar">
              {depotdaten.depots.map((d) => (
                <DepotAnsicht key={d.depot.id} sicht={d} von={von} bis={bisTag} />
              ))}
            </div>
          )}

        </>
      )}

      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}
    </div>
  );
}
