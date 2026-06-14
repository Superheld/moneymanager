// Übersicht — Fokus-Screen: eine große Zahl (verfügbares Geld) + Plan-Projektion über
// alle Quellen (Verträge/Regeln, Budgets, Töpfe) und das Anlegen einer Zahlungsregel.

import { useEffect, useMemo, useState } from "react";
import {
  euroZuCent,
  formatBetrag,
  projiziereLiquiditaet,
  type Budget,
  type Charakter,
  type Kategorie,
  type Rhythmus,
  type Topf,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { zahlungsregelAnlegen } from "../../application/zahlungsregelAnlegen";
import { sqliteZahlungsregelRepository as repo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";

const MONATE = 12;

/** Erster Tag des aktuellen Monats als ISO — der unreine „Jetzt"-Punkt lebt in der UI. */
function aktuellerMonatAb(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-01`;
}

const RHYTHMEN: { wert: Rhythmus; label: string }[] = [
  { wert: "monatlich", label: "monatlich" },
  { wert: "quartalsweise", label: "quartalsweise" },
  { wert: "halbjaehrlich", label: "halbjährlich" },
  { wert: "jaehrlich", label: "jährlich" },
];

const CHARAKTERE: { wert: Charakter; label: string }[] = [
  { wert: "Aufwand", label: "Aufwand (Ausgabe)" },
  { wert: "Ertrag", label: "Ertrag (Einnahme)" },
  { wert: "Umschichtung", label: "Umschichtung (Sparen/Anlegen)" },
];

const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

export function UeberblickScreen() {
  const ab = useMemo(aktuellerMonatAb, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  const [bezeichnung, setBezeichnung] = useState("");
  const [betragEuro, setBetragEuro] = useState("");
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [startdatum, setStartdatum] = useState(ab);
  const [kontoId, setKontoId] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setRegeln(await repo.alle());
    setKonten(await kontoRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setBudgets(await budgetRepo.alle());
    setToepfe(await topfRepo.alle());
  }

  // Kategorie wählen → Default-Charakter übernehmen (Glossar-Logik sichtbar machen).
  function kategorieWaehlen(id: string) {
    setKategorieId(id);
    const k = kategorien.find((x) => x.id === id);
    if (k) setCharakter(k.defaultCharakter);
  }

  useEffect(() => {
    laden().catch((e) => setFehler(String(e)));
  }, []);

  const verlauf = useMemo(
    () => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, euroZuCent(startsaldoEuro)),
    [regeln, budgets, toepfe, ab, startsaldoEuro],
  );

  const verfuegbar = verlauf.length ? verlauf[0].freieLiquiditaet : euroZuCent(startsaldoEuro);
  const endFrei = verlauf.length ? verlauf[verlauf.length - 1].freieLiquiditaet : euroZuCent(startsaldoEuro);
  const summeZu = verlauf.reduce((s, m) => s + m.zufluss, 0);
  const summeAb = verlauf.reduce((s, m) => s + m.abfluss + m.budgetAbfluss, 0);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  async function anlegen() {
    setFehler(null);
    try {
      await zahlungsregelAnlegen(repo, {
        bezeichnung,
        betragEuro: Number(betragEuro.replace(",", ".")),
        rhythmus,
        startdatum,
        charakter,
        kontoId: kontoId || undefined,
        kategorieId: kategorieId || undefined,
      });
      setBezeichnung("");
      setBetragEuro("");
      setKontoId("");
      setKategorieId("");
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function loeschen(id: string) {
    await repo.loeschen(id);
    await laden();
  }

  return (
    <div className="screen">
      <div className="phead">
        <h1>Übersicht</h1>
        <div className="psub">
          Plan-Projektion über {MONATE} Monate ab {ab.slice(0, 7)} · Plan-only, alles berechnet
        </div>
      </div>

      <div className="kpis">
        <KPIStat
          size="hero"
          label="Verfügbares Geld · frei"
          value={formatBetrag(verfuegbar)}
          unit="€"
          tone={verfuegbar < 0 ? "warn" : "plan"}
        />
        <KPIStat size="chip" label="Frei in 12 Monaten" value={formatBetrag(endFrei)} unit="€" tone={endFrei < 0 ? "warn" : "default"} />
        <KPIStat size="chip" label="Σ Zuflüsse (Plan)" value={formatBetrag(summeZu)} unit="€" tone="ok" />
        <KPIStat size="chip" label="Σ Abflüsse (Plan)" value={formatBetrag(summeAb)} unit="€" />
      </div>

      <Card title="Zahlungsregel anlegen" subtitle="Wiederkehrende Plan-Zahlung — die Quelle der Projektion">
        <div className="form-grid">
          <FormField label="Bezeichnung" required>
            <input
              className="field"
              value={bezeichnung}
              placeholder="z. B. Miete, Gehalt, ETF-Sparplan"
              onChange={(e) => setBezeichnung(e.target.value)}
            />
          </FormField>
          <FormField label="Betrag" required hint="positiver Betrag — Richtung ergibt sich aus dem Charakter">
            <input
              className="field"
              inputMode="decimal"
              value={betragEuro}
              placeholder="0,00"
              onChange={(e) => setBetragEuro(e.target.value)}
            />
          </FormField>
          <FormField label="Rhythmus">
            <select className="field" value={rhythmus} onChange={(e) => setRhythmus(e.target.value as Rhythmus)}>
              {RHYTHMEN.map((r) => (
                <option key={r.wert} value={r.wert}>
                  {r.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Kategorie" hint="setzt den Charakter vor">
            <select className="field" value={kategorieId} onChange={(e) => kategorieWaehlen(e.target.value)}>
              <option value="">— keine —</option>
              {kategorien.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Charakter">
            <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
              {CHARAKTERE.map((c) => (
                <option key={c.wert} value={c.wert}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Konto" hint="optional">
            <select className="field" value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
              <option value="">— keins —</option>
              {konten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.bezeichnung}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Erste Fälligkeit">
            <input className="field" type="date" value={startdatum} onChange={(e) => setStartdatum(e.target.value)} />
          </FormField>
          <FormField label="Startsaldo (für die Projektion)" hint="nur Anzeige, in P0 nicht gespeichert">
            <input
              className="field"
              inputMode="decimal"
              value={String(startsaldoEuro)}
              onChange={(e) => setStartsaldoEuro(Number(e.target.value.replace(",", ".")) || 0)}
            />
          </FormField>
        </div>
        <div className="form-actions">
          <Button variant="primary" plus onClick={anlegen}>
            Regel anlegen
          </Button>
          {fehler && <span className="err">{fehler}</span>}
        </div>
      </Card>

      <Card title="Angelegte Regeln" subtitle={`${regeln.length} Stück`}>
        {regeln.length === 0 ? (
          <div className="muted">Noch keine Regeln. Leg oben deine erste an.</div>
        ) : (
          <DataTable
            columns={[
              { key: "bezeichnung", label: "Bezeichnung" },
              {
                key: "charakter",
                label: "Charakter",
                render: (r) => <Pill variant={CHARAKTER_PILL[r.charakter as Charakter]}>{r.charakter}</Pill>,
              },
              { key: "rhythmus", label: "Rhythmus" },
              { key: "kategorie", label: "Kategorie", render: (r) => (r.kategorieId ? kategorieName.get(r.kategorieId) ?? "?" : "—") },
              { key: "konto", label: "Konto", render: (r) => (r.kontoId ? kontoName.get(r.kontoId) ?? "?" : "—") },
              { key: "startdatum", label: "ab" },
              {
                key: "betrag",
                label: "Betrag €",
                align: "right",
                render: (r) => formatBetrag(r.betrag, true),
              },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (r) => (
                  <button className="linkbtn" onClick={() => loeschen(r.id)}>
                    löschen
                  </button>
                ),
              },
            ]}
            rows={regeln}
          />
        )}
      </Card>

      <Card title="Projizierter Verlauf" subtitle="Kontosaldo (echte Flüsse) und freie Liquidität (− Töpfe)">
        <DataTable
          columns={[
            { key: "label", label: "Monat" },
            { key: "netto", label: "Netto €", align: "right", render: (m) => formatBetrag(m.netto, true) },
            {
              key: "kontosaldo",
              label: "Kontosaldo €",
              align: "right",
              render: (m) => formatBetrag(m.kontosaldo),
            },
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
