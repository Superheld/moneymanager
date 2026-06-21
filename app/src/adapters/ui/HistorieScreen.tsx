// Historie (Rückblick) — Gegenstück zur zukunfts-reinen Übersicht: echte Einnahmen/
// Ausgaben pro Monat aus den verbuchten Ist-Buchungen + realer Saldo-Verlauf über die Zeit.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonate, buchungenDerKategorie, fruehesterMonat, istInterneUmbuchung, istMonatsverlauf, kategorieAggregat, toIso, type IstBuchung, type Kategorie, type Zahlungskonto } from "../../core";
import type { Umsatz } from "../../application/import";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository as kontoRepo, sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, DataTable, KPIStat } from "./ds";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { PageHead } from "./PageHead";
import { useGeld } from "./EinstellungenProvider";

import type { KategorieSumme } from "../../core";

type Zeitraum = "12" | "24" | "jahr" | "alles";

function KategorieSektion({ titel, items, ohneLabel, onSelect, aktivId }: { titel: string; items: KategorieSumme[]; ohneLabel?: string; onSelect?: (id: string, name: string) => void; aktivId?: string }) {
  const { t } = useTranslation();
  const geld = useGeld();
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
          <div
            key={i.kategorieId ?? "__ohne"}
            onClick={klickbar ? () => onSelect!(i.kategorieId!, i.name) : undefined}
            style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: klickbar ? "pointer" : "default", background: aktiv ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
          >
            <CoverageTrack
              value={Math.abs(i.summe)}
              max={maxAbs}
              over={false}
              label={`${i.kategorieId ? i.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${i.anzahl}`}
              right={geld.formatMitSymbol(i.summe, { mitVorzeichen: true })}
            />
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

export function HistorieScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("12");
  const [aktivMonat, setAktivMonat] = useState<number | null>(null);
  const [selectedKat, setSelectedKat] = useState<{ id: string; name: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Gemeinsam laden und in EINEM Schritt setzen — kein Render-Fenster, in dem die
        // Aufschlüsselung gegen eine noch leere Kategorie-Liste rechnet (sonst „ohne Kategorie").
        const [i, k, kat, u] = await Promise.all([ledgerRepo.alle(), kontoRepo.alle(), kategorieRepo.alle(), umsatzRepo.alle()]);
        setIst(i);
        setKonten(k);
        setKategorien(kat);
        setUmsaetze(u);
        setFehler(null);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : String(e));
      } finally {
        setGeladen(true);
      }
    })();
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

  const detail = useMemo(() => {
    if (!selectedKat) return null;
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    const bvon = idx != null ? `${verlauf[idx].label}-01` : von;
    const bbis = idx != null ? `${verlauf[idx].label}-01` : bis;
    return buchungenDerKategorie(ist, selectedKat.id, bvon, bbis);
  }, [selectedKat, aktivMonat, verlauf, ist, von, bis]);

  const summeEin = verlauf.reduce((s, m) => s + m.einnahmen, 0);
  const summeAus = verlauf.reduce((s, m) => s + m.ausgaben, 0);
  const netto = summeEin + summeAus;
  const oeAus = verlauf.length ? Math.round(summeAus / verlauf.length) : 0;
  const saldoJetzt = verlauf.length ? verlauf[verlauf.length - 1].saldo : 0;

  const detailTh = { textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" } as const;
  const detailTd = { padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", color: "var(--ink)" } as const;

  return (
    <div className="screen">
      <PageHead title={t("historie.titel")} subtitle={t("historie.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--danger, #c0392b)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {!geladen ? null : ist.length === 0 && !fehler ? (
        <Card>{t("historie.leer")}</Card>
      ) : (
        <>
          <div className="kpis">
            <KPIStat size="chip" label={t("historie.kpiEinnahmen")} value={geld.format(summeEin)} unit={geld.symbol} tone="ok" />
            <KPIStat size="chip" label={t("historie.kpiAusgaben")} value={geld.format(summeAus)} unit={geld.symbol} />
            <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={netto < 0 ? "warn" : "ok"} />
            <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={saldoJetzt < 0 ? "warn" : "default"} />
          </div>

          <Card
            title={t("historie.flussTitel")}
            subtitle={t("historie.flussUntertitel")}
            action={
              <select className="field" style={{ width: "auto" }} value={zeitraum} onChange={(e) => { setZeitraum(e.target.value as Zeitraum); setAktivMonat(null); setSelectedKat(null); }}>
                <option value="12">{t("historie.zr12")}</option>
                <option value="24">{t("historie.zr24")}</option>
                <option value="jahr">{t("historie.zrJahr")}</option>
                <option value="alles">{t("historie.zrAlles")}</option>
              </select>
            }
          >
            {verlauf.length > 0 && (
              <MonatsFlussChart
                labels={verlauf.map((m) => m.label)}
                einnahmen={verlauf.map((m) => m.einnahmen)}
                ausgaben={verlauf.map((m) => -m.ausgaben)}
                onMonatClick={(i) => setAktivMonat((cur) => (cur === i ? null : i))}
                aktivIndex={aktivMonat}
              />
            )}
            <div className="muted" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-xs)" }}>{t("historie.flussHinweis", { betrag: geld.formatMitSymbol(oeAus) })}</div>
          </Card>

          {aufschluesselung && kategorien.length > 0 && (
            <Card
              title={t("historie.katTitel")}
              subtitle={aufschluesselung.label ? t("historie.katMonat", { monat: aufschluesselung.label }) : t("historie.katZeitraum")}
              action={aufschluesselung.label ? <Button variant="ghost" onClick={() => setAktivMonat(null)}>{t("historie.alleMonate")}</Button> : undefined}
                         >
              <KategorieSektion titel={t("historie.sektionAusgaben")} items={aufschluesselung.items.filter((i) => i.charakter === "Aufwand")} onSelect={(id, name) => setSelectedKat((cur) => (cur?.id === id ? null : { id, name }))} aktivId={selectedKat?.id} />
              <KategorieSektion titel={t("historie.sektionEinnahmen")} items={aufschluesselung.items.filter((i) => i.charakter === "Ertrag")} onSelect={(id, name) => setSelectedKat((cur) => (cur?.id === id ? null : { id, name }))} aktivId={selectedKat?.id} />
              <KategorieSektion titel={t("historie.sektionUmschichtung")} items={aufschluesselung.items.filter((i) => i.charakter === "Umschichtung")} ohneLabel={t("historie.umbuchungen")} onSelect={(id, name) => setSelectedKat((cur) => (cur?.id === id ? null : { id, name }))} aktivId={selectedKat?.id} />
              {aufschluesselung.items.length === 0 && <div className="muted">{t("historie.katLeer")}</div>}
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>{t("historie.katKlickHinweis")}</div>
            </Card>
          )}

          {selectedKat && (
            <Card
              title={t("historie.detailTitel", { kategorie: selectedKat.name })}
              subtitle={aufschluesselung?.label ? t("historie.katMonat", { monat: aufschluesselung.label }) : t("historie.katZeitraum")}
              action={<Button variant="ghost" onClick={() => setSelectedKat(null)}>{t("historie.schliessen")}</Button>}
            >
              {detail && detail.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
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
                    {detail.map((b) => {
                      const u = umsatzByIst.get(b.id);
                      const zweck = u?.verwendungszweck ?? "";
                      return (
                        <tr key={b.id}>
                          <td style={detailTd}>{b.datum.split("-").reverse().join(".")}</td>
                          <td style={{ ...detailTd, fontWeight: "var(--fw-bold)" }}>{u?.gegenpartei ?? b.notiz ?? "—"}</td>
                          <td style={{ ...detailTd, color: "var(--ink-3)" }}>{zweck.length > 50 ? zweck.slice(0, 50) + "…" : zweck}</td>
                          <td style={{ ...detailTd, color: "var(--ink-3)" }}>{kontoName.get(b.kontoId) ?? "—"}</td>
                          <td style={{ ...detailTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{geld.format(b.betrag, { mitVorzeichen: true })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="muted">{t("historie.detailLeer")}</div>
              )}
            </Card>
          )}

          <Card title={t("historie.saldoTitel")} subtitle={t("historie.saldoUntertitel")} style={{ marginTop: "var(--gap-card)" }}>
            {verlauf.length > 0 && (
              <SaldoVerlaufChart labels={verlauf.map((m) => m.label)} werte={verlauf.map((m) => m.saldo)} legende={t("historie.saldoLegende")} />
            )}
          </Card>

          <Card title={t("historie.tabelleTitel")} subtitle={t("historie.tabelleHinweis")} style={{ marginTop: "var(--gap-card)" }}>
            <DataTable
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
          </Card>
        </>
      )}
    </div>
  );
}
