// Liquidität (P2.4/P2.6) — vollständiger Plan über alle Quellen: zwei Kurven.
// Kontosaldo (echte Flüsse) und freie Liquidität (= Kontosaldo − Σ Topf-Sollstände,
// darf ins Minus). Optional „mit Szenario": Zusatzposten kommen zur Basis hinzu,
// ohne die Plan-Schicht zu berühren. Plan-only; Ist-Anteil kommt in P3.

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  euroZuCent,
  formatBetrag,
  projiziereLiquiditaet,
  type Budget,
  type Charakter,
  type Rhythmus,
  type Szenario,
  type Topf,
  type Zahlungsregel,
} from "../../core";
import { szenarioAnlegen, szenarioPostenAnlegen } from "../../application/szenarioAnlegen";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteSzenarioRepository as szenarioRepo } from "../persistence/sqliteSzenarioRepository";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";
import { ZweiKurvenChart } from "./ZweiKurvenChart";

const MONATE = 12;

function aktuellerMonatAb(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];

export function LiquiditaetScreen() {
  const ab = useMemo(aktuellerMonatAb, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  const [szenarien, setSzenarien] = useState<Szenario[]>([]);
  const [szenarioId, setSzenarioId] = useState("");
  const [posten, setPosten] = useState<Zahlungsregel[]>([]);

  async function basisLaden() {
    setRegeln(await regelRepo.alle());
    setBudgets(await budgetRepo.alle());
    setToepfe(await topfRepo.alle());
    setSzenarien(await szenarioRepo.alle());
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

  const basis = useMemo(
    () => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, euroZuCent(startsaldoEuro)),
    [regeln, budgets, toepfe, ab, startsaldoEuro],
  );
  const verlauf = useMemo(
    () =>
      szenarioId
        ? projiziereLiquiditaet([...regeln, ...posten], budgets, toepfe, ab, MONATE, euroZuCent(startsaldoEuro))
        : basis,
    [szenarioId, regeln, posten, budgets, toepfe, ab, startsaldoEuro, basis],
  );

  const verfuegbar = verlauf.length ? verlauf[0].freieLiquiditaet : 0;
  const endKonto = verlauf.length ? verlauf[verlauf.length - 1].kontosaldo : 0;
  const tiefpunkt = verlauf.reduce(
    (min, m) => (m.freieLiquiditaet < min.freieLiquiditaet ? m : min),
    verlauf[0] ?? { freieLiquiditaet: 0, label: "—" },
  );
  const deltaFrei =
    szenarioId && verlauf.length && basis.length
      ? verlauf[verlauf.length - 1].freieLiquiditaet - basis[basis.length - 1].freieLiquiditaet
      : null;

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
        {deltaFrei != null && (
          <KPIStat size="chip" label="Δ frei vs. Basis (12 Mt)" value={formatBetrag(deltaFrei, true)} unit="€" tone={deltaFrei < 0 ? "warn" : "ok"} />
        )}
      </div>

      <Card
        title="Jahresverlauf"
        subtitle="Kontosaldo (Ink) und freie Liquidität (Teal)"
        action={
          <select className="field" style={{ width: "auto" }} value={szenarioId} onChange={(e) => setSzenarioId(e.target.value)}>
            <option value="">Basis (Plan)</option>
            {szenarien.map((s) => (
              <option key={s.id} value={s.id}>
                Szenario: {s.name}
              </option>
            ))}
          </select>
        }
      >
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

      <SzenarioCard
        szenarien={szenarien}
        aktivId={szenarioId}
        posten={posten}
        onSelect={setSzenarioId}
        onSzenarienChanged={basisLaden}
        onPostenChanged={postenLaden}
      />

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
      onSzenarienChanged();
      onSelect(s.id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function postenHinzufuegen() {
    setFehler(null);
    try {
      await szenarioPostenAnlegen(szenarioRepo, aktivId, {
        bezeichnung: pBez,
        betragEuro: Number(pBetrag.replace(",", ".")),
        rhythmus: pRhythmus,
        charakter: pCharakter,
        startdatum: pStart,
      });
      setPBez("");
      setPBetrag("");
      onPostenChanged();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function szenarioLoeschen() {
    await szenarioRepo.loeschen(aktivId);
    onSelect("");
    onSzenarienChanged();
  }

  return (
    <Card title="Szenario (What-if)" subtitle="Verwerfbare Delta-Schicht — berührt den Plan nie">
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <FormField label="Neues Szenario" style={{ minWidth: 220 }}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Miete +200, Gehalt höher" />
        </FormField>
        <Button variant="primary" plus onClick={neuesSzenario}>
          anlegen
        </Button>
        {aktivId && (
          <button className="linkbtn" onClick={szenarioLoeschen}>
            aktives Szenario verwerfen
          </button>
        )}
      </div>

      {aktivId ? (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="nlbl" style={{ marginBottom: "var(--sp-2)" }}>Zusatzposten</div>
          <div className="form-grid">
            <FormField label="Bezeichnung">
              <input className="field" value={pBez} onChange={(e) => setPBez(e.target.value)} placeholder="z. B. Mieterhöhung" />
            </FormField>
            <FormField label="Betrag" hint="positiv — Richtung aus Charakter">
              <input className="field" inputMode="decimal" value={pBetrag} onChange={(e) => setPBetrag(e.target.value)} placeholder="0,00" />
            </FormField>
            <FormField label="Rhythmus">
              <select className="field" value={pRhythmus} onChange={(e) => setPRhythmus(e.target.value as Rhythmus)}>
                {RHYTHMEN.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Charakter">
              <select className="field" value={pCharakter} onChange={(e) => setPCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Erste Fälligkeit">
              <input className="field" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </FormField>
          </div>
          <div className="form-actions">
            <Button plus onClick={postenHinzufuegen}>
              Posten hinzufügen
            </Button>
            {fehler && <span className="err">{fehler}</span>}
          </div>

          {posten.length > 0 && (
            <div style={{ marginTop: "var(--sp-4)" }}>
              <DataTable
                columns={[
                  { key: "bezeichnung", label: "Posten" },
                  { key: "charakter", label: "Charakter", render: (p) => <Pill variant="neutral">{p.charakter}</Pill> },
                  { key: "rhythmus", label: "Rhythmus" },
                  { key: "betrag", label: "Betrag €", align: "right", render: (p) => formatBetrag(p.betrag, true) },
                  {
                    key: "_x",
                    label: "",
                    align: "right",
                    render: (p) => (
                      <button className="linkbtn" onClick={() => szenarioRepo.postenLoeschen(p.id).then(onPostenChanged)}>
                        löschen
                      </button>
                    ),
                  },
                ]}
                rows={posten}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: "var(--sp-3)" }}>
          {szenarien.length ? "Wähle oben rechts ein Szenario, um Zusatzposten zu pflegen." : "Noch kein Szenario."}
        </div>
      )}
    </Card>
  );
}
