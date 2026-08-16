// Historie (Rückblick) — Gegenstück zur zukunfts-reinen Übersicht: echte Einnahmen/
// Ausgaben pro Monat aus den verbuchten Ist-Buchungen + realer Saldo-Verlauf über die Zeit.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { addMonate, buchungenDerKategorie, fruehesterMonat, istInterneUmbuchung, istMonatsverlauf, kategorieAggregat, nachHauptgruppe, toIso, type Budget, type GruppenSumme, type Inventargegenstand, type IstBuchung, type Kategorie, type Zahlungskonto, type Zahlungsregel } from "../../core";
import type { Umsatz } from "../../application/import";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository as kontoRepo, sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { Button, Card, CoverageTrack, DataTable, KPIStat } from "./ds";
import { BuchungDetail } from "./BuchungDetail";
import { MonatsAusblick } from "./MonatsAusblick";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { PageHead } from "./PageHead";
import { useGeld } from "./einstellungenKontext";

import type { KategorieSumme } from "../../core";

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
              <div style={{ marginLeft: "var(--sp-4)", borderLeft: "2px solid var(--line-soft)", paddingLeft: "var(--sp-2)" }}>
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

function aktuellerMonat(): { y: number; m: number; d: number } {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: 1 };
}

function heuteIso(): string {
  const n = new Date();
  return toIso({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}

export function HistorieScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inventar, setInventar] = useState<Inventargegenstand[]>([]);
  const heute = useMemo(heuteIso, []);
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

  // Gemeinsam laden und in EINEM Schritt setzen — kein Render-Fenster, in dem die
  // Aufschlüsselung gegen eine noch leere Kategorie-Liste rechnet (sonst „ohne Kategorie").
  async function laden() {
    try {
      const [i, k, kat, u, r, b, inv] = await Promise.all([
        ledgerRepo.alle(), kontoRepo.alle(), kategorieRepo.alle(), umsatzRepo.alle(), regelRepo.alle(), budgetRepo.alle(),
        inventarRepo.alle(),
      ]);
      setIst(i);
      setKonten(k);
      setKategorien(kat);
      setUmsaetze(u);
      setRegeln(r);
      setBudgets(b);
      setInventar(inv);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setGeladen(true);
    }
  }
  useEffect(() => {
    laden();
  }, []);

  const { von, bis } = useMemo(() => {
    const bisYmd = aktuellerMonat();
    const bisIso = toIso(bisYmd);
    if (zeitraum === "jahr") return { von: `${bisYmd.y}-01-01`, bis: bisIso };
    if (zeitraum === "alles") return { von: fruehesterMonat(ist) ?? bisIso, bis: bisIso };
    const monate = zeitraum === "24" ? 23 : 11;
    return { von: toIso(addMonate(bisYmd, -monate)), bis: bisIso };
  }, [zeitraum, ist]);

  const verlauf = useMemo(() => istMonatsverlauf(konten, ist, von, bis), [konten, ist, von, bis]);

  const aufschluesselung = useMemo(() => {
    if (verlauf.length === 0) return null;
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    const bvon = idx != null ? `${verlauf[idx].label}-01` : von;
    const bbis = idx != null ? `${verlauf[idx].label}-01` : bis;
    // Interne Umbuchungen raus — sie verschieben nur Geld zwischen eigenen Konten.
    const relevant = ist.filter((b) => !istInterneUmbuchung(b));
    return { label: idx != null ? verlauf[idx].label : null, items: kategorieAggregat(relevant, bvon, bbis, kategorien) };
  }, [aktivMonat, verlauf, ist, kategorien, von, bis]);

  const umsatzByIst = useMemo(() => {
    const m = new Map<string, Umsatz>();
    for (const u of umsaetze) if (u.istbuchungId) m.set(u.istbuchungId, u);
    return m;
  }, [umsaetze]);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);

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

  const detailTh = { textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" } as const;
  const detailTd = { padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", color: "var(--ink)" } as const;

  function detailTabelle(kategorieId: string) {
    const bs = buchungenDerKategorie(ist, kategorieId, detailFenster.bvon, detailFenster.bbis);
    if (bs.length === 0) return <div className="muted" style={{ padding: "8px" }}>{t("historie.detailLeer")}</div>;
    return (
      <div style={{ background: "var(--surface-2, rgba(0,0,0,.015))", borderRadius: "var(--r-md)", padding: "4px 8px", margin: "4px 0 10px" }}>
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
            {bs.slice(0, 50).map((b) => {
              const u = umsatzByIst.get(b.id);
              const zweck = u?.verwendungszweck ?? "";
              return (
                // Anklickbar: beim Durchsehen einer Kategorie stößt man auf Buchungen,
                // die eine Korrektur brauchen — der Umweg über den Konto-Auszug entfällt.
                <tr key={b.id} onClick={() => setDetail(b)} style={{ cursor: "pointer" }} title={t("historie.detailOeffnen")}>
                  <td style={detailTd}>{b.datum.split("-").reverse().join(".")}</td>
                  <td style={{ ...detailTd, fontWeight: "var(--fw-bold)" }}>{u?.gegenpartei ?? b.notiz ?? "—"}</td>
                  <td style={{ ...detailTd, color: "var(--ink-3)" }}>{zweck.length > 45 ? zweck.slice(0, 45) + "…" : zweck}</td>
                  <td style={{ ...detailTd, color: "var(--ink-3)" }}>{kontoName.get(b.kontoId) ?? "—"}</td>
                  <td style={{ ...detailTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{geld.format(b.betrag, { mitVorzeichen: true })}</td>
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
      <PageHead title={t("historie.titel")} subtitle={t("historie.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--danger, #c0392b)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {/* Der Ausblick steht vor dem Rückblick: die Frage „was bleibt diesen Monat?" ist
          beim Öffnen die dringendere. Er lebt vom Plan und braucht keine Ist-Buchungen. */}
      {geladen && !fehler && (
        <MonatsAusblick regeln={regeln} budgets={budgets} inventar={inventar} ist={ist} kategorien={kategorien} heute={heute} />
      )}

      {!geladen ? null : ist.length === 0 && !fehler ? (
        <Card>{t("historie.leer")}</Card>
      ) : (
        <>
          <div className="kpis">
            <KPIStat size="chip" label={monat ? t("historie.kpiEinnahmenMonat", { monat: monat.label }) : t("historie.kpiEinnahmen")}
              value={geld.format(summeEin)} unit={geld.symbol} tone="ok" meta={vergleich(summeEin, oeEin)} />
            <KPIStat size="chip" label={monat ? t("historie.kpiAusgabenMonat", { monat: monat.label }) : t("historie.kpiAusgaben")}
              value={geld.format(summeAus)} unit={geld.symbol} meta={vergleich(summeAus, oeAus)} />
            <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={netto < 0 ? "warn" : "ok"} />
            {/* Der Maßstab: was ein Monat im Schnitt kostet. Bleibt beim Zeitraum-Ø,
                auch wenn ein einzelner Monat gewählt ist — sonst gäbe es nichts zu vergleichen. */}
            <KPIStat size="chip" label={t("historie.kpiOeAusgaben")} value={geld.format(oeAus)} unit={geld.symbol} />
            <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={saldoJetzt < 0 ? "warn" : "default"} />
          </div>

          <Card
            title={t("historie.verlaufTitel")}
            subtitle={t(`historie.verlauf.${ansicht}`)}
            action={
              <span style={{ display: "inline-flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                {/* Monat direkt wählbar — der Klick auf den Chart macht dasselbe, ist bei
                    vielen Monaten aber Zielübung. Beide schreiben denselben Zustand. */}
                <select
                  className="field"
                  style={{ width: "auto" }}
                  aria-label={t("historie.monatWaehlen")}
                  value={aktivMonat ?? ""}
                  onChange={(e) => { setAktivMonat(e.target.value === "" ? null : Number(e.target.value)); setOffeneKat(null); }}
                >
                  <option value="">{t("historie.alleMonate")}</option>
                  {verlauf.map((m, i) => (<option key={m.label} value={i}>{m.label}</option>))}
                </select>
                <select className="field" style={{ width: "auto" }} value={zeitraum} onChange={(e) => { setZeitraum(e.target.value as Zeitraum); setAktivMonat(null); setOffeneKat(null); }}>
                  <option value="12">{t("historie.zr12")}</option>
                  <option value="24">{t("historie.zr24")}</option>
                  <option value="jahr">{t("historie.zrJahr")}</option>
                  <option value="alles">{t("historie.zrAlles")}</option>
                </select>
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
                  { key: "netto", label: `${t("historie.spalteNetto")} ${geld.symbol}`, align: "right", render: (m) => <span style={{ color: m.netto < 0 ? "var(--warn-deep)" : "var(--ink)", fontWeight: "var(--fw-bold)" }}>{geld.format(m.netto, { mitVorzeichen: true })}</span> },
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
                <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                  {aufschluesselung.label && <Button variant="ghost" onClick={() => setAktivMonat(null)}>{t("historie.alleMonate")}</Button>}
                  <select className="field" style={{ width: "auto" }} aria-label={t("historie.ebeneWaehlen")}
                    value={ebene} onChange={(e) => { setEbene(e.target.value as "kategorie" | "gruppe"); setOffeneKat(null); setOffeneGruppe(null); }}>
                    <option value="kategorie">{t("historie.ebeneKategorie")}</option>
                    <option value="gruppe">{t("historie.ebeneGruppe")}</option>
                  </select>
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
                    gruppen={nachHauptgruppe(items, kategorien)}
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

        </>
      )}

      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}
    </div>
  );
}
