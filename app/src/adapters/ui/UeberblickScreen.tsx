// Übersicht (P0) — der eine Durchstich: Zahlungsregel anlegen → SQLite → Projektion
// (pure, im Core) → Verlauf als Tabelle. Liest/schreibt über Use-Cases + Port.

import { useEffect, useMemo, useState } from "react";
import {
  euroZuCent,
  formatBetrag,
  projiziereVerlauf,
  type Charakter,
  type Rhythmus,
  type Zahlungsregel,
} from "../../core";
import { zahlungsregelAnlegen } from "../../application/zahlungsregelAnlegen";
import { sqliteZahlungsregelRepository as repo } from "../persistence/sqliteZahlungsregelRepository";
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
  const [startsaldoEuro, setStartsaldoEuro] = useState(2000);

  const [bezeichnung, setBezeichnung] = useState("");
  const [betragEuro, setBetragEuro] = useState("");
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [startdatum, setStartdatum] = useState(ab);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setRegeln(await repo.alle());
  }

  useEffect(() => {
    laden().catch((e) => setFehler(String(e)));
  }, []);

  const verlauf = useMemo(
    () => projiziereVerlauf(regeln, ab, MONATE, euroZuCent(startsaldoEuro)),
    [regeln, ab, startsaldoEuro],
  );

  const endsaldo = verlauf.length ? verlauf[verlauf.length - 1].saldo : euroZuCent(startsaldoEuro);
  const summeZu = verlauf.reduce((s, m) => s + m.zufluss, 0);
  const summeAb = verlauf.reduce((s, m) => s + m.abfluss, 0);

  async function anlegen() {
    setFehler(null);
    try {
      await zahlungsregelAnlegen(repo, {
        bezeichnung,
        betragEuro: Number(betragEuro.replace(",", ".")),
        rhythmus,
        startdatum,
        charakter,
      });
      setBezeichnung("");
      setBetragEuro("");
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
          label="Projizierter Saldo · in 12 Monaten"
          value={formatBetrag(endsaldo)}
          unit="€"
          tone={endsaldo < 0 ? "warn" : "plan"}
        />
        <KPIStat size="chip" label="Startsaldo heute" value={formatBetrag(euroZuCent(startsaldoEuro))} unit="€" />
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
          <FormField label="Charakter">
            <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
              {CHARAKTERE.map((c) => (
                <option key={c.wert} value={c.wert}>
                  {c.label}
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

      <Card title="Projizierter Verlauf" subtitle="Plan-Zahlungen je Monat + laufender Saldo">
        <DataTable
          columns={[
            { key: "label", label: "Monat" },
            { key: "zufluss", label: "Zufluss €", align: "right", render: (m) => (m.zufluss ? formatBetrag(m.zufluss) : "—") },
            { key: "abfluss", label: "Abfluss €", align: "right", render: (m) => (m.abfluss ? formatBetrag(m.abfluss) : "—") },
            { key: "netto", label: "Netto €", align: "right", render: (m) => formatBetrag(m.netto, true) },
            {
              key: "saldo",
              label: "Saldo €",
              align: "right",
              render: (m) => (
                <span style={{ color: m.saldo < 0 ? "var(--warn-deep)" : "var(--ink)", fontWeight: "var(--fw-bold)" }}>
                  {formatBetrag(m.saldo)}
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
