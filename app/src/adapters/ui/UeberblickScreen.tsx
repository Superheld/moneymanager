// Übersicht — die EINE Planungsseite (Übersicht + Liquidität zusammengeführt). Reine
// PLANUNG (kein Ist, kein angenommener Startsaldo): Projektion ab 0. Fokuszahl +
// Jahresverlauf (zwei Kurven) + optionales Szenario + Monatstabelle + Info-Karten.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  bezahlteSchluessel,
  centZuEuro,
  geglaetteterMonatsabfluss,
  kuendigungsterminNaht,
  liquideMittelReal,
  naechsterKuendigungstermin,
  planRefKey,
  projiziereLiquiditaet,
  projiziereRegel,
  type Budget,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type Planbuchung,
  type Rhythmus,
  type Szenario,
  type Topf,
  type Vertrag,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { szenarioAnlegen, szenarioPostenAnlegen } from "../../application/szenarioAnlegen";
import { bezahltZuruecknehmen, postenBezahltMarkieren } from "../../application/bezahltMarkieren";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteSzenarioRepository as szenarioRepo } from "../persistence/sqliteSzenarioRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, DataTable, FormField, KPIStat, Pill } from "./ds";
import { ZweiKurvenChart } from "./ZweiKurvenChart";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

const MONATE = 12;
const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];

function aktuellerMonatAb(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

export function UeberblickScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const ab = useMemo(aktuellerMonatAb, []);
  const heute = useMemo(heuteIso, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [szenarien, setSzenarien] = useState<Szenario[]>([]);
  const [szenarioId, setSzenarioId] = useState("");
  const [posten, setPosten] = useState<Zahlungsregel[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);

  async function basisLaden() {
    setRegeln(await regelRepo.alle());
    setBudgets(await budgetRepo.alle());
    setToepfe(await topfRepo.alle());
    setKonten(await kontoRepo.alle());
    setVertraege(await vertragRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setSzenarien(await szenarioRepo.alle());
    setIst(await ledgerRepo.alle());
  }
  useEffect(() => {
    basisLaden();
  }, []);

  async function postenLaden() {
    setPosten(szenarioId ? await szenarioRepo.posten(szenarioId) : []);
  }
  useEffect(() => {
    postenLaden();
  }, [szenarioId]);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  // Reconciliation light: Start = realer Stand (Anfangsbestand + Σ Ist); bezahlte
  // Plan-Posten sind Fakt → aus der Vorschau ausgeschlossen, damit nichts doppelt zählt.
  const bezahlt = useMemo(() => bezahlteSchluessel(ist), [ist]);
  const start = useMemo(() => liquideMittelReal(konten, ist), [konten, ist]);
  const basis = useMemo(() => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, start, bezahlt), [regeln, budgets, toepfe, ab, start, bezahlt]);
  const verlauf = useMemo(
    () => (szenarioId ? projiziereLiquiditaet([...regeln, ...posten], budgets, toepfe, ab, MONATE, start, bezahlt) : basis),
    [szenarioId, regeln, posten, budgets, toepfe, ab, start, bezahlt, basis],
  );

  const verfuegbar = verlauf.length ? verlauf[0].freieLiquiditaet : start;
  const planSaldo = verlauf.length ? verlauf[verlauf.length - 1].kontosaldo : start;
  const tiefpunkt = verlauf.reduce(
    (min, m) => (m.freieLiquiditaet < min.freieLiquiditaet ? m : min),
    verlauf[0] ?? { freieLiquiditaet: 0, label: "—" },
  );
  const summeZu = verlauf.reduce((s, m) => s + m.zufluss, 0);
  const summeAb = verlauf.reduce((s, m) => s + m.abfluss + m.budgetAbfluss, 0);
  const deltaFrei =
    szenarioId && verlauf.length && basis.length
      ? verlauf[verlauf.length - 1].freieLiquiditaet - basis[basis.length - 1].freieLiquiditaet
      : null;

  const regelById = useMemo(() => new Map(regeln.map((r) => [r.id, r])), [regeln]);
  const [markFehler, setMarkFehler] = useState<string | null>(null);

  // Nächste Zahlungen: bewusst OHNE Ausschluss projizieren, damit bereits bezahlte
  // Posten mit Häkchen sichtbar bleiben (Plan/Ist je Posten, ADR-0002 §4).
  const naechste = useMemo(() => {
    const alle = regeln.flatMap((r) => projiziereRegel(r, heute, 2));
    return alle.sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 6);
  }, [regeln, heute]);

  /** Konto, über das ein Posten gebucht würde — von der Regel, sonst das einzige Konto. */
  function loeseKonto(p: Planbuchung): string | undefined {
    return regelById.get(p.regelId)?.kontoId ?? (konten.length === 1 ? konten[0].id : undefined);
  }

  async function toggleBezahlt(p: Planbuchung, schonBezahlt: boolean) {
    setMarkFehler(null);
    const regel = regelById.get(p.regelId);
    if (!regel) return;
    try {
      if (schonBezahlt) {
        await bezahltZuruecknehmen(ledgerRepo, p.regelId, p.datum);
      } else {
        await postenBezahltMarkieren(ledgerRepo, { regel, faelligkeit: p.datum, kontoId: loeseKonto(p) });
      }
      setIst(await ledgerRepo.alle());
    } catch (e) {
      setMarkFehler(fehlerNachricht(t, e));
    }
  }

  const hinweise: { text: string; warn: boolean }[] = [];
  if (tiefpunkt.freieLiquiditaet < 0)
    hinweise.push({ text: t("ueberblick.hinweisUeberplanung", { label: tiefpunkt.label, betrag: geld.formatMitSymbol(tiefpunkt.freieLiquiditaet) }), warn: true });
  for (const v of vertraege) {
    if (kuendigungsterminNaht(v, heute)) {
      const termin = naechsterKuendigungstermin(v, heute);
      hinweise.push({ text: t("ueberblick.hinweisKuendigung", { anbieter: v.anbieter, datum: termin?.kuendigenBis }), warn: true });
    }
  }
  if (hinweise.length === 0) hinweise.push({ text: t("ueberblick.hinweisKeine"), warn: false });

  const datumLang = new Date().toLocaleDateString(geld.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="screen">
      <div className="ctxbar">{datumLang} · {szenarioId ? t("ueberblick.ctxSzenario", { name: szenarien.find((s) => s.id === szenarioId)?.name ?? "?" }) : t("ueberblick.ctxBasis")}</div>

      <div style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-semi)", color: "var(--ink-2)" }}>{t("ueberblick.fokusLabel")}</div>
      <div className="num" style={{ fontSize: "var(--fs-display)", fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", lineHeight: 1, marginTop: 6 }}>
        {geld.format(verfuegbar)} <small style={{ fontSize: 28, fontWeight: "var(--fw-bold)", color: "var(--ink-2)" }}>{geld.symbol}</small>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: 620 }}>
        {konten.length === 0 ? (
          <Trans i18nKey="ueberblick.einleitungLeer" components={{ b: <b style={{ color: "var(--ink)" }} /> }} />
        ) : (
          <>
            <Trans
              i18nKey="ueberblick.einleitungStart"
              values={{ start: geld.formatMitSymbol(start), frei: geld.formatMitSymbol(verfuegbar), plan: geld.formatMitSymbol(planSaldo) }}
              components={{
                b: <b style={{ color: "var(--ink)" }} />,
                frei: <b style={{ color: verfuegbar < 0 ? "var(--warn-deep)" : "var(--accent-deep)", fontWeight: 700 }} />,
              }}
            />
            {tiefpunkt.freieLiquiditaet < 0 ? (
              <Trans
                i18nKey="ueberblick.einleitungTiefpunkt"
                values={{ label: tiefpunkt.label, betrag: geld.formatMitSymbol(tiefpunkt.freieLiquiditaet) }}
                components={{ b: <b style={{ color: "var(--ink)" }} />, warn: <b style={{ color: "var(--warn-deep)", fontWeight: 700 }} /> }}
              />
            ) : (
              <>{t("ueberblick.einleitungPlus")}</>
            )}
          </>
        )}
      </p>

      <div className="kpis" style={{ marginTop: 22 }}>
        <KPIStat size="chip" label={t("ueberblick.kpiTiefpunkt", { label: tiefpunkt.label })} value={geld.format(tiefpunkt.freieLiquiditaet)} unit={geld.symbol} tone={tiefpunkt.freieLiquiditaet < 0 ? "warn" : "default"} />
        <KPIStat size="chip" label={t("ueberblick.kpiZufluesse")} value={geld.format(summeZu)} unit={geld.symbol} tone="ok" />
        <KPIStat size="chip" label={t("ueberblick.kpiAbfluesse")} value={geld.format(summeAb)} unit={geld.symbol} />
        {deltaFrei != null && <KPIStat size="chip" label={t("ueberblick.kpiDelta")} value={geld.format(deltaFrei, { mitVorzeichen: true })} unit={geld.symbol} tone={deltaFrei < 0 ? "warn" : "ok"} />}
      </div>

      <Card
        title={t("ueberblick.planSaldoTitel")}
        subtitle={t("ueberblick.planSaldoUntertitel")}
        style={{ marginTop: 24 }}
        action={
          <select className="field" style={{ width: "auto" }} value={szenarioId} onChange={(e) => setSzenarioId(e.target.value)}>
            <option value="">{t("ueberblick.basisPlan")}</option>
            {szenarien.map((s) => (
              <option key={s.id} value={s.id}>{t("ueberblick.szenarioOption", { name: s.name })}</option>
            ))}
          </select>
        }
      >
        {verlauf.length > 0 && (
          <ZweiKurvenChart
            labels={verlauf.map((m) => m.label)}
            kontosaldo={verlauf.map((m) => m.kontosaldo)}
            freieLiquiditaet={verlauf.map((m) => m.freieLiquiditaet)}
          />
        )}
      </Card>

      <Card
        title={t("ueberblick.flussTitel")}
        subtitle={t("ueberblick.flussUntertitel")}
        style={{ marginTop: "var(--gap-card)" }}
        action={<span className="muted">{t("ueberblick.flussDurchschnitt", { betrag: geld.formatMitSymbol(Math.round(summeAb / (verlauf.length || 1))) })}</span>}
      >
        {verlauf.length > 0 && (
          <MonatsFlussChart
            labels={verlauf.map((m) => m.label)}
            einnahmen={verlauf.map((m) => m.zufluss)}
            ausgaben={verlauf.map((m) => -(m.abfluss + m.budgetAbfluss))}
          />
        )}
      </Card>

      <SzenarioCard
        szenarien={szenarien}
        aktivId={szenarioId}
        posten={posten}
        onSelect={setSzenarioId}
        onSzenarienChanged={basisLaden}
        onPostenChanged={postenLaden}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr", gap: "var(--gap-card)", marginTop: "var(--gap-card)", alignItems: "start" }}>
        <Card title={t("ueberblick.naechsteTitel")} subtitle={t("ueberblick.naechsteUntertitel")}>
          {naechste.length === 0 ? (
            <div className="muted">{t("ueberblick.naechsteLeer")}</div>
          ) : (
            naechste.map((p, i) => {
              const paid = bezahlt.has(planRefKey(p.regelId, p.datum));
              const kannMarkieren = paid || !!loeseKonto(p);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: "1px solid var(--line-soft)", opacity: paid ? 0.6 : 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={paid}
                      disabled={!kannMarkieren}
                      onChange={() => toggleBezahlt(p, paid)}
                      title={kannMarkieren ? (paid ? t("ueberblick.titelHaekchenEntfernen") : t("ueberblick.titelAlsBezahlt")) : t("ueberblick.titelKeinKonto")}
                      style={{ cursor: kannMarkieren ? "pointer" : "not-allowed", accentColor: "var(--accent-deep)" }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(p.datum)}</span>
                    <span style={{ textDecoration: paid ? "line-through" : "none" }}>{p.bezeichnung}</span>
                    {paid && <Pill variant="neutral">{t("ueberblick.pillBezahlt")}</Pill>}
                    {p.charakter === "Umschichtung" && <Pill variant="um">{t("charakter.Umschichtung")}</Pill>}
                  </span>
                  <span className="num" style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", color: paid ? "var(--ink-3)" : p.charakter === "Ertrag" ? "var(--ok-deep)" : p.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)" }}>
                    {geld.formatMitSymbol(p.betrag, { mitVorzeichen: true })}
                  </span>
                </div>
              );
            })
          )}
          {markFehler && <div className="err" style={{ marginTop: 10 }}>{markFehler}</div>}
        </Card>

        <Card title={t("ueberblick.budgetsTitel")} subtitle={t("ueberblick.budgetsUntertitel")}>
          {budgets.length === 0 ? (
            <div className="muted">{t("ueberblick.budgetsLeer")}</div>
          ) : (
            budgets.map((b) => (
              <div key={b.id} style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <CoverageTrack value={0} max={Math.abs(centZuEuro(geglaetteterMonatsabfluss(b)))} label={kategorieName.get(b.kategorieId) ?? "?"} right={t("ueberblick.proMonat", { betrag: geld.formatMitSymbol(Math.abs(geglaetteterMonatsabfluss(b))) })} />
              </div>
            ))
          )}
        </Card>

        <Card title={t("ueberblick.imBlickTitel")} subtitle={t("ueberblick.imBlickUntertitel")}>
          {hinweise.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.42, padding: "9px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flex: "0 0 auto", background: h.warn ? "var(--warn)" : "var(--ink-3)" }} />
              {h.text}
            </div>
          ))}
        </Card>
      </div>

      <Card title={t("ueberblick.monatsverlaufTitel")} subtitle={t("ueberblick.monatsverlaufUntertitel")} style={{ marginTop: "var(--gap-card)" }}>
        <DataTable
          columns={[
            { key: "label", label: t("ueberblick.spalteMonat") },
            { key: "netto", label: `${t("ueberblick.spalteNetto")} ${geld.symbol}`, align: "right", render: (m) => geld.format(m.netto, { mitVorzeichen: true }) },
            { key: "budget", label: `${t("ueberblick.spalteBudget")} ${geld.symbol}`, align: "right", render: (m) => (m.budgetAbfluss ? geld.format(m.budgetAbfluss) : "—") },
            { key: "soll", label: `${t("ueberblick.spalteToepfe")} ${geld.symbol}`, align: "right", render: (m) => (m.sollSumme ? geld.format(m.sollSumme) : "—") },
            { key: "konto", label: `${t("ueberblick.spaltePlanSaldo")} ${geld.symbol}`, align: "right", render: (m) => geld.format(m.kontosaldo, { mitVorzeichen: true }) },
            {
              key: "frei",
              label: `${t("ueberblick.spalteFrei")} ${geld.symbol}`,
              align: "right",
              render: (m) => (
                <span style={{ color: m.freieLiquiditaet < 0 ? "var(--warn-deep)" : "var(--ink)", fontWeight: "var(--fw-bold)" }}>{geld.format(m.freieLiquiditaet, { mitVorzeichen: true })}</span>
              ),
            },
          ]}
          rows={verlauf}
        />
      </Card>
    </div>
  );
}

function SzenarioCard({
  szenarien,
  aktivId,
  posten,
  onSelect,
  onSzenarienChanged,
  onPostenChanged,
}: {
  szenarien: Szenario[];
  aktivId: string;
  posten: Zahlungsregel[];
  onSelect: (id: string) => void;
  onSzenarienChanged: () => void;
  onPostenChanged: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [neuOffen, setNeuOffen] = useState(false);
  const [postenOffen, setPostenOffen] = useState(false);
  const [name, setName] = useState("");
  const [pBez, setPBez] = useState("");
  const [pBetrag, setPBetrag] = useState("");
  const [pRhythmus, setPRhythmus] = useState<Rhythmus>("monatlich");
  const [pCharakter, setPCharakter] = useState<Charakter>("Aufwand");
  const [pStart, setPStart] = useState(aktuellerMonatAb());
  const [fehler, setFehler] = useState<string | null>(null);

  async function neuesSzenario() {
    setFehler(null);
    try {
      const s = await szenarioAnlegen(szenarioRepo, name);
      setName("");
      setNeuOffen(false);
      onSzenarienChanged();
      onSelect(s.id);
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function postenHinzufuegen() {
    setFehler(null);
    try {
      await szenarioPostenAnlegen(szenarioRepo, aktivId, { bezeichnung: pBez, betrag: geld.parse(pBetrag) ?? 0, rhythmus: pRhythmus, charakter: pCharakter, startdatum: pStart });
      setPBez("");
      setPBetrag("");
      setPostenOffen(false);
      onPostenChanged();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function szenarioLoeschen() {
    await szenarioRepo.loeschen(aktivId);
    onSelect("");
    onSzenarienChanged();
  }

  return (
    <Card
      title={t("ueberblick.szenarioTitel")}
      subtitle={t("ueberblick.szenarioUntertitel")}
      style={{ marginTop: "var(--gap-card)" }}
      action={
        <span style={{ display: "flex", gap: "var(--sp-2)" }}>
          {aktivId && <Button plus onClick={() => setPostenOffen(true)}>{t("ueberblick.btnPosten")}</Button>}
          <Button variant="primary" plus onClick={() => setNeuOffen(true)}>{t("ueberblick.btnSzenario")}</Button>
        </span>
      }
    >
      {aktivId ? (
        posten.length > 0 ? (
          <DataTable
            columns={[
              { key: "bezeichnung", label: t("ueberblick.spaltePosten") },
              { key: "charakter", label: t("ueberblick.spalteCharakter"), render: (p) => <Pill variant="neutral">{t(`charakter.${p.charakter}`)}</Pill> },
              { key: "rhythmus", label: t("ueberblick.spalteRhythmus"), render: (p) => t(`ueberblick.rhythmus.${p.rhythmus}`) },
              { key: "betrag", label: `${t("ueberblick.spalteBetrag")} ${geld.symbol}`, align: "right", render: (p) => geld.format(p.betrag, { mitVorzeichen: true }) },
              { key: "_x", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => szenarioRepo.postenLoeschen(p.id).then(onPostenChanged)}>{t("ueberblick.loeschen")}</button> },
            ]}
            rows={posten}
          />
        ) : (
          <div className="muted">{t("ueberblick.postenLeer")}</div>
        )
      ) : (
        <div className="muted">{szenarien.length ? t("ueberblick.szenarioWaehlen") : t("ueberblick.keinSzenario")}</div>
      )}
      {aktivId && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <button className="linkbtn" onClick={szenarioLoeschen}>{t("ueberblick.szenarioVerwerfen")}</button>
        </div>
      )}

      {neuOffen && (
        <Modal title={t("ueberblick.modalSzenarioTitel")} subtitle={t("ueberblick.modalSzenarioUntertitel")} onClose={() => setNeuOffen(false)} footer={<><Button variant="primary" onClick={neuesSzenario}>{t("ueberblick.speichern")}</Button><button className="linkbtn" onClick={() => setNeuOffen(false)}>{t("ueberblick.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}>
          <FormField label={t("ueberblick.feldName")} required>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ueberblick.feldNamePlaceholder")} />
          </FormField>
        </Modal>
      )}

      {postenOffen && (
        <Modal title={t("ueberblick.modalPostenTitel")} subtitle={t("ueberblick.modalPostenUntertitel")} onClose={() => setPostenOffen(false)} footer={<><Button variant="primary" onClick={postenHinzufuegen}>{t("ueberblick.speichern")}</Button><button className="linkbtn" onClick={() => setPostenOffen(false)}>{t("ueberblick.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}>
          <div className="form-grid">
            <FormField label={t("ueberblick.feldBezeichnung")}>
              <input className="field" value={pBez} onChange={(e) => setPBez(e.target.value)} placeholder={t("ueberblick.feldBezeichnungPlaceholder")} />
            </FormField>
            <FormField label={t("ueberblick.feldBetrag")} hint={t("ueberblick.feldBetragHinweis")}>
              <input className="field" inputMode="decimal" value={pBetrag} onChange={(e) => setPBetrag(e.target.value)} placeholder="0,00" />
            </FormField>
            <FormField label={t("ueberblick.feldRhythmus")}>
              <select className="field" value={pRhythmus} onChange={(e) => setPRhythmus(e.target.value as Rhythmus)}>
                {RHYTHMEN.map((r) => (<option key={r} value={r}>{t(`ueberblick.rhythmus.${r}`)}</option>))}
              </select>
            </FormField>
            <FormField label={t("ueberblick.feldCharakter")}>
              <select className="field" value={pCharakter} onChange={(e) => setPCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (<option key={c} value={c}>{t(`charakter.${c}`)}</option>))}
              </select>
            </FormField>
            <FormField label={t("ueberblick.feldFaelligkeit")}>
              <input className="field" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}
    </Card>
  );
}
