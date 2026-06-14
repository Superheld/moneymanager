// Budgets (P2.2) — Übersicht der Rahmen je Kategorie; Anlegen im Modal.
// Plan-only; Reset zum Periodenende (kein Übertrag). Ist-Wirkung ab P3.

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
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";

const PERIODEN: { wert: BudgetPeriode; label: string }[] = [
  { wert: "monatlich", label: "monatlich" },
  { wert: "jaehrlich", label: "jährlich" },
];

export function BudgetsScreen() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [offen, setOffen] = useState(false);
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
      setKategorieId("");
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title="Budgets"
        subtitle="Limit pro Periode für laufende Ausgaben — Reset zum Periodenende"
        action={
          <Button variant="primary" plus onClick={() => setOffen(true)}>
            Budget anlegen
          </Button>
        }
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        Ein Budget ist ein <b style={{ color: "var(--ink)" }}>Limit pro Monat</b> für laufende Ausgaben (Lebensmittel, Auswärts essen). Der Rest <b style={{ color: "var(--ink)" }}>verfällt</b> — es wird nicht angespart. Was sich <b style={{ color: "var(--ink)" }}>ansammeln</b> soll (Urlaub, Ersatz), gehört in einen <b style={{ color: "var(--ink)" }}>Topf</b>.
      </p>

      <Card>
        {budgets.length === 0 ? (
          <div className="muted">Noch keine Budgets. Lege Kategorien an, dann Budgets darauf.</div>
        ) : (
          <DataTable
            columns={[
              { key: "kategorie", label: "Kategorie", render: (b) => kategorieName.get(b.kategorieId) ?? "?" },
              { key: "periode", label: "Periode" },
              { key: "rahmen", label: "Rahmen €", align: "right", render: (b) => formatBetrag(b.rahmen) },
              { key: "geglaettet", label: "≈ /Monat €", align: "right", render: (b) => formatBetrag(geglaetteterMonatsabfluss(b)) },
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

      {offen && (
        <Modal
          title="Budget anlegen"
          subtitle="Ein Budget je Kategorie und Periode"
          onClose={() => setOffen(false)}
          footer={
            <>
              <Button variant="primary" onClick={anlegen}>
                Speichern
              </Button>
              <button className="linkbtn" onClick={() => setOffen(false)}>
                Abbrechen
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <FormField label="Kategorie" required>
            <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
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
        </Modal>
      )}
    </div>
  );
}
