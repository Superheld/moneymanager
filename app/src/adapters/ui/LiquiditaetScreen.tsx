// Liquidität (P2.4) — vollständiger Plan über alle Quellen: zwei Kurven. Kontosaldo
// (echte Flüsse) und freie Liquidität (= Kontosaldo − Σ Topf-Sollstände, darf ins
// Minus). Plan-only; Ist-Anteil kommt in P3.

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  euroZuCent,
  formatBetrag,
  projiziereLiquiditaet,
  type Budget,
  type Topf,
  type Zahlungsregel,
} from "../../core";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { Card, DataTable, FormField, KPIStat } from "./ds";
import { ZweiKurvenChart } from "./ZweiKurvenChart";

const MONATE = 12;

function aktuellerMonatAb(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

export function LiquiditaetScreen() {
  const ab = useMemo(aktuellerMonatAb, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  useEffect(() => {
    (async () => {
      setRegeln(await regelRepo.alle());
      setBudgets(await budgetRepo.alle());
      setToepfe(await topfRepo.alle());
    })();
  }, []);

  const verlauf = useMemo(
    () => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, euroZuCent(startsaldoEuro)),
    [regeln, budgets, toepfe, ab, startsaldoEuro],
  );

  const verfuegbar = verlauf.length ? verlauf[0].freieLiquiditaet : 0;
  const endKonto = verlauf.length ? verlauf[verlauf.length - 1].kontosaldo : 0;
  const tiefpunkt = verlauf.reduce(
    (min, m) => (m.freieLiquiditaet < min.freieLiquiditaet ? m : min),
    verlauf[0] ?? { freieLiquiditaet: 0, label: "—" },
  );

  return (
    <div className="screen">
      <div className="phead">
        <h1>Liquidität</h1>
        <div className="psub">Jahresprojektion über alle Plan-Quellen · zwei Kurven · Plan-only</div>
      </div>

      <div className="kpis">
        <KPIStat size="hero" label="Verfügbares Geld · frei" value={formatBetrag(verfuegbar)} unit="€" tone={verfuegbar < 0 ? "warn" : "plan"} />
        <KPIStat size="chip" label="Kontosaldo in 12 Mt" value={formatBetrag(endKonto)} unit="€" />
        <KPIStat
          size="chip"
          label={`Tiefpunkt frei (${tiefpunkt.label})`}
          value={formatBetrag(tiefpunkt.freieLiquiditaet)}
          unit="€"
          tone={tiefpunkt.freieLiquiditaet < 0 ? "warn" : "default"}
        />
        <KPIStat size="chip" label="Startsaldo" value={formatBetrag(euroZuCent(startsaldoEuro))} unit="€" />
      </div>

      <Card title="Jahresverlauf" subtitle="Kontosaldo (Ink) und freie Liquidität (Teal)">
        {verlauf.length > 0 && (
          <ZweiKurvenChart
            labels={verlauf.map((m) => m.label)}
            kontosaldo={verlauf.map((m) => centZuEuro(m.kontosaldo))}
            freieLiquiditaet={verlauf.map((m) => centZuEuro(m.freieLiquiditaet))}
          />
        )}
        <div style={{ marginTop: "var(--sp-5)", maxWidth: 280 }}>
          <FormField label="Startsaldo (Annahme heute)" hint="in P3 aus echten Kontoständen">
            <input
              className="field"
              inputMode="decimal"
              value={String(startsaldoEuro)}
              onChange={(e) => setStartsaldoEuro(Number(e.target.value.replace(",", ".")) || 0)}
            />
          </FormField>
        </div>
      </Card>

      <Card title="Monatsverlauf" subtitle="Netto, Budget-Anteil, Topf-Sollstände, beide Salden">
        <DataTable
          columns={[
            { key: "label", label: "Monat" },
            { key: "netto", label: "Netto €", align: "right", render: (m) => formatBetrag(m.netto, true) },
            { key: "budget", label: "davon Budget €", align: "right", render: (m) => (m.budgetAbfluss ? formatBetrag(m.budgetAbfluss) : "—") },
            { key: "soll", label: "Σ Töpfe €", align: "right", render: (m) => (m.sollSumme ? formatBetrag(m.sollSumme) : "—") },
            { key: "konto", label: "Kontosaldo €", align: "right", render: (m) => formatBetrag(m.kontosaldo) },
            {
              key: "frei",
              label: "Freie Liquidität €",
              align: "right",
              render: (m) => (
                <span style={{ color: m.freieLiquiditaet < 0 ? "var(--warn-deep)" : "var(--ink)", fontWeight: "var(--fw-bold)" }}>
                  {formatBetrag(m.freieLiquiditaet)}
                </span>
              ),
            },
          ]}
          rows={verlauf}
        />
      </Card>
    </div>
  );
}
