// Budgets (P2.2) — Rahmen für variable Ausgaben je Kategorie/Periode. Zeigt den
// geglätteten Monatsabfluss (linear). Plan-only; Reset zum Periodenende (kein Übertrag).
// Die Wirkung in der Liquiditätsprojektion kommt in P2.4 (zwei Kurven).

import { useEffect, useMemo, useState } from "react";
import {
  formatBetrag,
  geglaetteterMonatsabfluss,
  type Budget,
  type BudgetPeriode,
  type Kategorie,
} from "../../core";
import { budgetAnlegen } from "../../application/budgetAnlegen";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField } from "./ds";

const PERIODEN: { wert: BudgetPeriode; label: string }[] = [
  { wert: "monatlich", label: "monatlich" },
  { wert: "jaehrlich", label: "jährlich" },
];

export function BudgetsScreen() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [kategorieId, setKategorieId] = useState("");
  const [rahmenEuro, setRahmenEuro] = useState("");
  const [periode, setPeriode] = useState<BudgetPeriode>("monatlich");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setBudgets(await budgetRepo.alle());
    setKategorien(await kategorieRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  async function anlegen() {
    setFehler(null);
    try {
      await budgetAnlegen(budgetRepo, { kategorieId, rahmenEuro: Number(rahmenEuro.replace(",", ".")), periode });
      setRahmenEuro("");
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <div className="phead">
        <h1>Budgets</h1>
        <div className="psub">Rahmen für variable Ausgaben — geglättet, Reset zum Periodenende (kein Übertrag)</div>
      </div>

      <Card title="Budget anlegen" subtitle="Ein Budget je Kategorie und Periode">
        <div className="form-grid">
          <FormField label="Kategorie" required>
            <select className="field" value={kategorieId} onChange={(e) => setKategorieId(e.target.value)}>
              <option value="">— wählen —</option>
              {kategorien.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Rahmen" required hint="Betrag je Periode">
            <input className="field" inputMode="decimal" value={rahmenEuro} onChange={(e) => setRahmenEuro(e.target.value)} placeholder="0,00" />
          </FormField>
          <FormField label="Periode">
            <select className="field" value={periode} onChange={(e) => setPeriode(e.target.value as BudgetPeriode)}>
              {PERIODEN.map((p) => (
                <option key={p.wert} value={p.wert}>
                  {p.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="form-actions">
          <Button variant="primary" plus onClick={anlegen}>
            Budget anlegen
          </Button>
          {fehler && <span className="err">{fehler}</span>}
        </div>
      </Card>

      <Card title="Budgets" subtitle={`${budgets.length} Stück`}>
        {budgets.length === 0 ? (
          <div className="muted">Noch keine Budgets. Lege Kategorien an, dann Budgets darauf.</div>
        ) : (
          <DataTable
            columns={[
              { key: "kategorie", label: "Kategorie", render: (b) => kategorieName.get(b.kategorieId) ?? "?" },
              { key: "periode", label: "Periode" },
              { key: "rahmen", label: "Rahmen €", align: "right", render: (b) => formatBetrag(b.rahmen) },
              {
                key: "geglaettet",
                label: "≈ /Monat €",
                align: "right",
                render: (b) => formatBetrag(geglaetteterMonatsabfluss(b)),
              },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (b) => (
                  <button className="linkbtn" onClick={() => budgetRepo.loeschen(b.id).then(laden)}>
                    löschen
                  </button>
                ),
              },
            ]}
            rows={budgets}
          />
        )}
      </Card>
    </div>
  );
}
