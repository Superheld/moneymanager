// Übersicht — Fokus-Dashboard (Design „Variante C, flach"): die eine Zahl
// (verfügbares Geld), ein Klartext-Satz zur Lage, der Jahresverlauf und darunter
// Nächste Zahlungen · Budgets · Im Blick. Zieht echte Daten aus allen Bereichen;
// kein Daten-Eingabe-Formular mehr (das lebt in den Fachscreens).

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  euroZuCent,
  formatBetrag,
  geglaetteterMonatsabfluss,
  kuendigungsterminNaht,
  naechsterKuendigungstermin,
  projiziereLiquiditaet,
  projiziereRegel,
  type Budget,
  type Kategorie,
  type Topf,
  type Vertrag,
  type Zahlungsregel,
} from "../../core";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Card, CoverageTrack, FormField, KPIStat, Pill } from "./ds";
import { ZweiKurvenChart } from "./ZweiKurvenChart";

const MONATE = 12;

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
  const ab = useMemo(aktuellerMonatAb, []);
  const heute = useMemo(heuteIso, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  useEffect(() => {
    (async () => {
      setRegeln(await regelRepo.alle());
      setBudgets(await budgetRepo.alle());
      setToepfe(await topfRepo.alle());
      setVertraege(await vertragRepo.alle());
      setKategorien(await kategorieRepo.alle());
    })();
  }, []);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  const verlauf = useMemo(
    () => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, euroZuCent(startsaldoEuro)),
    [regeln, budgets, toepfe, ab, startsaldoEuro],
  );

  const verfuegbar = verlauf.length ? verlauf[0].freieLiquiditaet : euroZuCent(startsaldoEuro);
  const endKonto = verlauf.length ? verlauf[verlauf.length - 1].kontosaldo : euroZuCent(startsaldoEuro);
  const jahresEffekt = endKonto - euroZuCent(startsaldoEuro);
  const tiefpunkt = verlauf.reduce(
    (min, m) => (m.freieLiquiditaet < min.freieLiquiditaet ? m : min),
    verlauf[0] ?? { freieLiquiditaet: 0, label: "—" },
  );
  const deckung = verlauf.length
    ? verlauf[0].sollSumme > 0
      ? Math.max(0, Math.min(100, Math.round((verlauf[0].kontosaldo / verlauf[0].sollSumme) * 100)))
      : 100
    : 100;

  // Nächste Zahlungen: alle Regel-Fälligkeiten ab heute (2 Monate), sortiert.
  const naechste = useMemo(() => {
    const alle = regeln.flatMap((r) => projiziereRegel(r, heute, 2));
    return alle.sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 6);
  }, [regeln, heute]);

  // Im Blick: Engpass + nahende Kündigungen.
  const hinweise: { text: string; warn: boolean }[] = [];
  if (tiefpunkt.freieLiquiditaet < 0)
    hinweise.push({ text: `Überplanung: am Tiefpunkt (${tiefpunkt.label}) fehlen ${formatBetrag(tiefpunkt.freieLiquiditaet)} €`, warn: true });
  for (const v of vertraege) {
    if (kuendigungsterminNaht(v, heute)) {
      const t = naechsterKuendigungstermin(v, heute);
      hinweise.push({ text: `${v.anbieter}: Kündigung bis ${t?.kuendigenBis} möglich`, warn: true });
    }
  }
  if (hinweise.length === 0) hinweise.push({ text: "Keine offenen Hinweise — dein Plan trägt.", warn: false });

  const datumLang = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="screen">
      <div className="ctxbar">{datumLang} · Szenario: Basis</div>

      <div style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-semi)", color: "var(--ink-2)" }}>Verfügbar heute</div>
      <div className="num" style={{ fontSize: "var(--fs-display)", fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", lineHeight: 1, marginTop: 6 }}>
        {formatBetrag(verfuegbar)} <small style={{ fontSize: 28, fontWeight: "var(--fw-bold)", color: "var(--ink-2)" }}>€</small>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: 620 }}>
        Über das Jahr trägt dein Plan auf{" "}
        <b style={{ color: jahresEffekt < 0 ? "var(--warn-deep)" : "var(--accent-deep)", fontWeight: 700 }}>{formatBetrag(jahresEffekt, true)} €</b>
        {tiefpunkt.freieLiquiditaet < 0 ? (
          <>
            {" "}— am Tiefpunkt (<b style={{ color: "var(--ink)" }}>{tiefpunkt.label}</b>) wird es mit{" "}
            <b style={{ color: "var(--warn-deep)", fontWeight: 700 }}>{formatBetrag(tiefpunkt.freieLiquiditaet)} €</b> eng.
          </>
        ) : (
          <> und die freie Liquidität bleibt durchgehend im Plus.</>
        )}{" "}
        Deine Töpfe sind zu <b style={{ color: "var(--ink)", fontWeight: 700 }}>{deckung} %</b> gedeckt.
      </p>

      <div className="kpis" style={{ marginTop: 22 }}>
        <KPIStat size="chip" label={`Tiefpunkt frei (${tiefpunkt.label})`} value={formatBetrag(tiefpunkt.freieLiquiditaet)} unit="€" tone={tiefpunkt.freieLiquiditaet < 0 ? "warn" : "default"} />
        <KPIStat size="chip" label="Töpfe-Deckung" value={String(deckung)} unit="%" tone="plan" />
        <KPIStat size="chip" label="Plan-Effekt Jahr" value={formatBetrag(jahresEffekt, true)} unit="€" tone={jahresEffekt < 0 ? "warn" : "ok"} />
      </div>

      <Card title="Verfügbares Geld · Jahresverlauf" subtitle="alle Konten zusammen" style={{ marginTop: 24 }}>
        {verlauf.length > 0 && (
          <ZweiKurvenChart
            labels={verlauf.map((m) => m.label)}
            kontosaldo={verlauf.map((m) => centZuEuro(m.kontosaldo))}
            freieLiquiditaet={verlauf.map((m) => centZuEuro(m.freieLiquiditaet))}
          />
        )}
        <div style={{ marginTop: "var(--sp-4)", maxWidth: 260 }}>
          <FormField label="Startsaldo (Annahme)" hint="in P3 aus echten Kontoständen">
            <input className="field" inputMode="decimal" value={String(startsaldoEuro)} onChange={(e) => setStartsaldoEuro(Number(e.target.value.replace(",", ".")) || 0)} />
          </FormField>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr", gap: "var(--gap-card)", marginTop: "var(--gap-card)", alignItems: "start" }}>
        <Card title="Nächste Zahlungen" subtitle="kommende 2 Monate">
          {naechste.length === 0 ? (
            <div className="muted">Keine geplanten Zahlungen.</div>
          ) : (
            naechste.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(p.datum)}</span>
                  {p.bezeichnung}
                  {p.charakter === "Umschichtung" && <Pill variant="um">Umschichtung</Pill>}
                </span>
                <span className="num" style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", color: p.charakter === "Ertrag" ? "var(--ok-deep)" : p.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)" }}>
                  {formatBetrag(p.betrag, true)} €
                </span>
              </div>
            ))
          )}
        </Card>

        <Card title="Budgets diesen Monat" subtitle="Rahmen (Plan)">
          {budgets.length === 0 ? (
            <div className="muted">Keine Budgets.</div>
          ) : (
            budgets.map((b) => (
              <div key={b.id} style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <CoverageTrack
                  value={0}
                  max={Math.abs(centZuEuro(geglaetteterMonatsabfluss(b)))}
                  label={kategorieName.get(b.kategorieId) ?? "?"}
                  right={`${formatBetrag(Math.abs(geglaetteterMonatsabfluss(b)))} €/Mt`}
                />
              </div>
            ))
          )}
        </Card>

        <Card title="Im Blick" subtitle="Hinweise">
          {hinweise.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.42, padding: "9px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flex: "0 0 auto", background: h.warn ? "var(--warn)" : "var(--ink-3)" }} />
              {h.text}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
