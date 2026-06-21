// Historie (Rückblick) — Gegenstück zur zukunfts-reinen Übersicht: echte Einnahmen/
// Ausgaben pro Monat aus den verbuchten Ist-Buchungen + realer Saldo-Verlauf über die Zeit.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonate, fruehesterMonat, istMonatsverlauf, toIso, type IstBuchung, type Zahlungskonto } from "../../core";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { Card, DataTable, KPIStat } from "./ds";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { PageHead } from "./PageHead";
import { useGeld } from "./EinstellungenProvider";

type Zeitraum = "12" | "24" | "jahr" | "alles";

function aktuellerMonat(): { y: number; m: number; d: number } {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: 1 };
}

export function HistorieScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("12");
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIst(await ledgerRepo.alle());
        setKonten(await kontoRepo.alle());
        setFehler(null);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : String(e));
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

  const summeEin = verlauf.reduce((s, m) => s + m.einnahmen, 0);
  const summeAus = verlauf.reduce((s, m) => s + m.ausgaben, 0);
  const netto = summeEin + summeAus;
  const oeAus = verlauf.length ? Math.round(summeAus / verlauf.length) : 0;
  const saldoJetzt = verlauf.length ? verlauf[verlauf.length - 1].saldo : 0;

  return (
    <>
      <PageHead title={t("historie.titel")} subtitle={t("historie.untertitel")} />

      {fehler && <Card style={{ marginBottom: "var(--sp-4)", borderColor: "var(--danger, #c0392b)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {ist.length === 0 && !fehler ? (
        <Card>{t("historie.leer")}</Card>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: "var(--gap-card)" }}>
            <KPIStat size="chip" label={t("historie.kpiEinnahmen")} value={geld.format(summeEin)} unit={geld.symbol} tone="ok" />
            <KPIStat size="chip" label={t("historie.kpiAusgaben")} value={geld.format(summeAus)} unit={geld.symbol} />
            <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={netto < 0 ? "warn" : "ok"} />
            <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={saldoJetzt < 0 ? "warn" : "default"} />
          </div>

          <Card
            title={t("historie.flussTitel")}
            subtitle={t("historie.flussUntertitel")}
            action={
              <select className="field" style={{ width: "auto" }} value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}>
                <option value="12">{t("historie.zr12")}</option>
                <option value="24">{t("historie.zr24")}</option>
                <option value="jahr">{t("historie.zrJahr")}</option>
                <option value="alles">{t("historie.zrAlles")}</option>
              </select>
            }
          >
            {verlauf.length > 0 && (
              <MonatsFlussChart labels={verlauf.map((m) => m.label)} einnahmen={verlauf.map((m) => m.einnahmen)} ausgaben={verlauf.map((m) => m.ausgaben)} />
            )}
            <div className="muted" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-xs)" }}>{t("historie.flussDurchschnitt", { betrag: geld.formatMitSymbol(oeAus) })}</div>
          </Card>

          <Card title={t("historie.saldoTitel")} subtitle={t("historie.saldoUntertitel")} style={{ marginTop: "var(--gap-card)" }}>
            {verlauf.length > 0 && (
              <SaldoVerlaufChart labels={verlauf.map((m) => m.label)} werte={verlauf.map((m) => m.saldo)} legende={t("historie.saldoLegende")} />
            )}
          </Card>

          <Card title={t("historie.tabelleTitel")} style={{ marginTop: "var(--gap-card)" }}>
            <DataTable
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
    </>
  );
}
