// Deckung (P2, plan-basiert) — „Sind meine Töpfe finanziert?". Globale Deckung =
// freie Liquidität (liquide Mittel − Σ Topf-Sollstände); darf ins Minus (Überplanung).
// Plus je Topf der Sollstand-Fortschritt. Die konten-zentrische Ist-Sicht (echte
// Salden) kommt mit dem Ist-Schritt (P3) — ein Konto ist „nur eine Zahl".

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  euroZuCent,
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
import { Card, CoverageTrack, FormField, KPIStat, Pill } from "./ds";
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
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  useEffect(() => {
    (async () => {
      setRegeln(await regelRepo.alle());
      setBudgets(await budgetRepo.alle());
      setToepfe(await topfRepo.alle());
    })();
  }, []);

  const jetzt = useMemo(
    () => projiziereLiquiditaet(regeln, budgets, toepfe, ab, 1, euroZuCent(startsaldoEuro))[0],
    [regeln, budgets, toepfe, ab, startsaldoEuro],
  );
  const kontosaldo = jetzt?.kontosaldo ?? euroZuCent(startsaldoEuro);
  const sollSumme = jetzt?.sollSumme ?? 0;
  const frei = jetzt?.freieLiquiditaet ?? kontosaldo;
  const deckung = sollSumme > 0 ? Math.max(0, Math.min(100, Math.round((kontosaldo / sollSumme) * 100))) : 100;
  const sollToepfe = toepfe.filter((t) => zielwert(t) != null);

  return (
    <div className="screen">
      <PageHead title="Deckung" subtitle="Sind deine Töpfe finanziert? Globale Deckung = freie Liquidität" />

      <div className="kpis">
        <KPIStat size="hero" label="Verfügbares Geld · frei" value={formatBetrag(frei)} unit="€" tone={frei < 0 ? "warn" : "plan"} />
        <KPIStat size="chip" label="Liquide Mittel" value={formatBetrag(kontosaldo)} unit="€" />
        <KPIStat size="chip" label="Σ Topf-Sollstände" value={formatBetrag(sollSumme)} unit="€" />
        <KPIStat size="chip" label="Deckungsgrad" value={String(deckung)} unit="%" tone={frei < 0 ? "warn" : "plan"} />
      </div>

      <Card title="Globale Deckung" subtitle="liquide Mittel gegen die Summe aller Topf-Sollstände">
        <CoverageTrack
          value={centZuEuro(kontosaldo)}
          max={Math.max(1, centZuEuro(sollSumme))}
          over={frei < 0}
          label={frei < 0 ? "Überplanung — zu viel verplant" : "gedeckt"}
          right={`${formatBetrag(kontosaldo)} / ${formatBetrag(sollSumme)} €`}
        />
        <p className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {frei < 0
            ? `Die freie Liquidität ist negativ (${formatBetrag(frei)} €) — die geplanten Töpfe übersteigen das liquide Geld. Kein Konto wird gekürzt; die Überplanung erscheint als globale Zahl.`
            : `Dir bleiben nach Abzug aller Topf-Sollstände ${formatBetrag(frei)} € frei.`}
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

      <Card title="Annahme">
        <div style={{ maxWidth: 260 }}>
          <FormField label="Startsaldo (liquide Mittel)" hint="in P3 aus echten Kontoständen">
            <input className="field" inputMode="decimal" value={String(startsaldoEuro)} onChange={(e) => setStartsaldoEuro(Number(e.target.value.replace(",", ".")) || 0)} />
          </FormField>
        </div>
      </Card>
    </div>
  );
}
