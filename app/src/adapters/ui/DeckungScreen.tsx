// Deckung (P2, plan-basiert) — „Sind meine Töpfe finanziert?". Globale Deckung =
// freie Liquidität (liquide Mittel − Σ Topf-Sollstände); darf ins Minus (Überplanung).
// Plus je Topf der Sollstand-Fortschritt. Die konten-zentrische Ist-Sicht (echte
// Salden) kommt mit dem Ist-Schritt (P3) — ein Konto ist „nur eine Zahl".

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  formatBetrag,
  projiziereLiquiditaet,
  sollstand,
  zielwert,
  type Budget,
  type Topf,
  type TopfTyp,
  type Zahlungsregel,
} from "../../core";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { Card, CoverageTrack, KPIStat, Pill } from "./ds";
import { PageHead } from "./PageHead";

const TYP_LABEL: Record<TopfTyp, string> = { ersatz: "Ersatz", puffer: "Puffer", spartopf: "Spartopf" };

function aktuellerMonatAb(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function DeckungScreen() {
  const ab = useMemo(aktuellerMonatAb, []);
  const heute = useMemo(heuteIso, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);

  useEffect(() => {
    (async () => {
      setRegeln(await regelRepo.alle());
      setBudgets(await budgetRepo.alle());
      setToepfe(await topfRepo.alle());
    })();
  }, []);

  // Reine Planung: Start bei 0, kein angenommener Ist-Saldo.
  const jetzt = useMemo(() => projiziereLiquiditaet(regeln, budgets, toepfe, ab, 1, 0)[0], [regeln, budgets, toepfe, ab]);
  const planSaldo = jetzt?.kontosaldo ?? 0;
  const sollSumme = jetzt?.sollSumme ?? 0;
  const frei = jetzt?.freieLiquiditaet ?? planSaldo;
  const deckung = sollSumme > 0 ? Math.max(0, Math.min(100, Math.round((planSaldo / sollSumme) * 100))) : 100;
  const sollToepfe = toepfe.filter((t) => zielwert(t) != null);

  return (
    <div className="screen">
      <PageHead title="Deckung" subtitle="Sind deine Töpfe finanziert? Reine Planung — Ist-Sicht kommt mit P3" />

      <div className="kpis">
        <KPIStat size="hero" label="Freie Liquidität (Plan)" value={formatBetrag(frei, true)} unit="€" tone={frei < 0 ? "warn" : "plan"} />
        <KPIStat size="chip" label="Plan-Saldo (1. Monat)" value={formatBetrag(planSaldo, true)} unit="€" />
        <KPIStat size="chip" label="Σ Topf-Sollstände" value={formatBetrag(sollSumme)} unit="€" />
        <KPIStat size="chip" label="Deckungsgrad" value={String(deckung)} unit="%" tone={frei < 0 ? "warn" : "plan"} />
      </div>

      <Card title="Globale Deckung" subtitle="Plan-Saldo gegen die Summe aller Topf-Sollstände">
        <CoverageTrack
          value={centZuEuro(planSaldo)}
          max={Math.max(1, centZuEuro(sollSumme))}
          over={frei < 0}
          label={frei < 0 ? "Überplanung — zu viel verplant" : "gedeckt"}
          right={`${formatBetrag(planSaldo, true)} / ${formatBetrag(sollSumme)} €`}
        />
        <p className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {frei < 0
            ? `Die freie Liquidität ist negativ (${formatBetrag(frei)} €) — die geplanten Töpfe übersteigen den Plan-Saldo. Kein Konto wird gekürzt; die Überplanung erscheint als globale Zahl.`
            : `Nach Abzug aller Topf-Sollstände bleiben rechnerisch ${formatBetrag(frei, true)} € frei.`}
          {" "}Die konten-zentrische Sicht mit echten Salden kommt mit dem Ist-Schritt (P3).
        </p>
      </Card>

      <Card title="Töpfe im Detail" subtitle="Plan-Sollstand heute gegen Zielwert">
        {sollToepfe.length === 0 ? (
          <div className="muted">Keine Töpfe mit Zielwert. Lege Töpfe an, dann erscheint hier ihre Deckung.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {sollToepfe.map((t) => {
              const ziel = zielwert(t)!;
              const soll = sollstand(t, heute) ?? 0;
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {t.bezeichnung} <Pill variant="neutral">{TYP_LABEL[t.typ]}</Pill>
                    </span>
                  </div>
                  <CoverageTrack value={centZuEuro(soll)} max={centZuEuro(ziel)} right={`${formatBetrag(soll)} / ${formatBetrag(ziel)} €`} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
