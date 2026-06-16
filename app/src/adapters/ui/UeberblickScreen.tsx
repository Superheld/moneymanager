// Übersicht — die EINE Planungsseite (Übersicht + Liquidität zusammengeführt). Reine
// PLANUNG (kein Ist, kein angenommener Startsaldo): Projektion ab 0. Fokuszahl +
// Jahresverlauf (zwei Kurven) + optionales Szenario + Monatstabelle + Info-Karten.

import { useEffect, useMemo, useState } from "react";
import {
  centZuEuro,
  formatBetrag,
  geglaetteterMonatsabfluss,
  kuendigungsterminNaht,
  naechsterKuendigungstermin,
  projiziereLiquiditaet,
  projiziereRegel,
  type Budget,
  type Charakter,
  type Kategorie,
  type Rhythmus,
  type Szenario,
  type Topf,
  type Vertrag,
  type Zahlungsregel,
} from "../../core";
import { szenarioAnlegen, szenarioPostenAnlegen } from "../../application/szenarioAnlegen";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteSzenarioRepository as szenarioRepo } from "../persistence/sqliteSzenarioRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, DataTable, FormField, KPIStat, Pill } from "./ds";
import { ZweiKurvenChart } from "./ZweiKurvenChart";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { Modal } from "./Modal";

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
  const ab = useMemo(aktuellerMonatAb, []);
  const heute = useMemo(heuteIso, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [szenarien, setSzenarien] = useState<Szenario[]>([]);
  const [szenarioId, setSzenarioId] = useState("");
  const [posten, setPosten] = useState<Zahlungsregel[]>([]);

  async function basisLaden() {
    setRegeln(await regelRepo.alle());
    setBudgets(await budgetRepo.alle());
    setToepfe(await topfRepo.alle());
    setVertraege(await vertragRepo.alle());
    setKategorien(await kategorieRepo.alle());
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

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  const basis = useMemo(() => projiziereLiquiditaet(regeln, budgets, toepfe, ab, MONATE, 0), [regeln, budgets, toepfe, ab]);
  const verlauf = useMemo(
    () => (szenarioId ? projiziereLiquiditaet([...regeln, ...posten], budgets, toepfe, ab, MONATE, 0) : basis),
    [szenarioId, regeln, posten, budgets, toepfe, ab, basis],
  );

  const planSaldo = verlauf.length ? verlauf[verlauf.length - 1].kontosaldo : 0;
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

  const naechste = useMemo(() => {
    const alle = regeln.flatMap((r) => projiziereRegel(r, heute, 2));
    return alle.sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 6);
  }, [regeln, heute]);

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
      <div className="ctxbar">{datumLang} · {szenarioId ? `Szenario: ${szenarien.find((s) => s.id === szenarioId)?.name ?? "?"}` : "Szenario: Basis"}</div>

      <div style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-semi)", color: "var(--ink-2)" }}>Plan-Saldo · in 12 Monaten</div>
      <div className="num" style={{ fontSize: "var(--fs-display)", fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", lineHeight: 1, marginTop: 6 }}>
        {formatBetrag(planSaldo, true)} <small style={{ fontSize: 28, fontWeight: "var(--fw-bold)", color: "var(--ink-2)" }}>€</small>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: 620 }}>
        Über die nächsten 12 Monate trägt dein Plan auf{" "}
        <b style={{ color: planSaldo < 0 ? "var(--warn-deep)" : "var(--accent-deep)", fontWeight: 700 }}>{formatBetrag(planSaldo, true)} €</b>
        {tiefpunkt.freieLiquiditaet < 0 ? (
          <>
            {" "}— am Tiefpunkt (<b style={{ color: "var(--ink)" }}>{tiefpunkt.label}</b>) wird die freie Liquidität mit{" "}
            <b style={{ color: "var(--warn-deep)", fontWeight: 700 }}>{formatBetrag(tiefpunkt.freieLiquiditaet)} €</b> knapp.
          </>
        ) : (
          <> und die freie Liquidität (nach Töpfen) bleibt durchgehend im Plus.</>
        )}{" "}
        Reine Planung — echte Stände kommen mit dem Ist-Schritt.
      </p>

      <div className="kpis" style={{ marginTop: 22 }}>
        <KPIStat size="chip" label={`Tiefpunkt frei (${tiefpunkt.label})`} value={formatBetrag(tiefpunkt.freieLiquiditaet)} unit="€" tone={tiefpunkt.freieLiquiditaet < 0 ? "warn" : "default"} />
        <KPIStat size="chip" label="Σ Zuflüsse (Plan)" value={formatBetrag(summeZu)} unit="€" tone="ok" />
        <KPIStat size="chip" label="Σ Abflüsse (Plan)" value={formatBetrag(summeAb)} unit="€" />
        {deltaFrei != null && <KPIStat size="chip" label="Δ frei vs. Basis" value={formatBetrag(deltaFrei, true)} unit="€" tone={deltaFrei < 0 ? "warn" : "ok"} />}
      </div>

      <Card
        title="Plan-Saldo · Jahresverlauf"
        subtitle="ab heute, reine Planung (kein Ist)"
        style={{ marginTop: 24 }}
        action={
          <select className="field" style={{ width: "auto" }} value={szenarioId} onChange={(e) => setSzenarioId(e.target.value)}>
            <option value="">Basis (Plan)</option>
            {szenarien.map((s) => (
              <option key={s.id} value={s.id}>Szenario: {s.name}</option>
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
      </Card>

      <Card
        title="Ein- und Ausgaben pro Monat"
        subtitle="macht die Abflüsse sichtbar (Quartals-/Jahreszahlungen + Budgets)"
        style={{ marginTop: "var(--gap-card)" }}
        action={<span className="muted">Ø Ausgaben {formatBetrag(Math.round(summeAb / (verlauf.length || 1)))} €/Mt</span>}
      >
        {verlauf.length > 0 && (
          <MonatsFlussChart
            labels={verlauf.map((m) => m.label)}
            einnahmen={verlauf.map((m) => centZuEuro(m.zufluss))}
            ausgaben={verlauf.map((m) => centZuEuro(-(m.abfluss + m.budgetAbfluss)))}
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
                <CoverageTrack value={0} max={Math.abs(centZuEuro(geglaetteterMonatsabfluss(b)))} label={kategorieName.get(b.kategorieId) ?? "?"} right={`${formatBetrag(Math.abs(geglaetteterMonatsabfluss(b)))} €/Mt`} />
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

      <Card title="Monatsverlauf" subtitle="Netto, Budget-Anteil, Topf-Sollstände, beide Salden" style={{ marginTop: "var(--gap-card)" }}>
        <DataTable
          columns={[
            { key: "label", label: "Monat" },
            { key: "netto", label: "Netto €", align: "right", render: (m) => formatBetrag(m.netto, true) },
            { key: "budget", label: "davon Budget €", align: "right", render: (m) => (m.budgetAbfluss ? formatBetrag(m.budgetAbfluss) : "—") },
            { key: "soll", label: "Σ Töpfe €", align: "right", render: (m) => (m.sollSumme ? formatBetrag(m.sollSumme) : "—") },
            { key: "konto", label: "Plan-Saldo €", align: "right", render: (m) => formatBetrag(m.kontosaldo, true) },
            {
              key: "frei",
              label: "Freie Liquidität €",
              align: "right",
              render: (m) => (
                <span style={{ color: m.freieLiquiditaet < 0 ? "var(--warn-deep)" : "var(--ink)", fontWeight: "var(--fw-bold)" }}>{formatBetrag(m.freieLiquiditaet, true)}</span>
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
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function postenHinzufuegen() {
    setFehler(null);
    try {
      await szenarioPostenAnlegen(szenarioRepo, aktivId, { bezeichnung: pBez, betragEuro: Number(pBetrag.replace(",", ".")), rhythmus: pRhythmus, charakter: pCharakter, startdatum: pStart });
      setPBez("");
      setPBetrag("");
      setPostenOffen(false);
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
    <Card
      title="Szenario (What-if)"
      subtitle="Verwerfbare Delta-Schicht — berührt den Plan nie"
      style={{ marginTop: "var(--gap-card)" }}
      action={
        <span style={{ display: "flex", gap: "var(--sp-2)" }}>
          {aktivId && <Button plus onClick={() => setPostenOffen(true)}>Posten</Button>}
          <Button variant="primary" plus onClick={() => setNeuOffen(true)}>Szenario</Button>
        </span>
      }
    >
      {aktivId ? (
        posten.length > 0 ? (
          <DataTable
            columns={[
              { key: "bezeichnung", label: "Posten" },
              { key: "charakter", label: "Charakter", render: (p) => <Pill variant="neutral">{p.charakter}</Pill> },
              { key: "rhythmus", label: "Rhythmus" },
              { key: "betrag", label: "Betrag €", align: "right", render: (p) => formatBetrag(p.betrag, true) },
              { key: "_x", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => szenarioRepo.postenLoeschen(p.id).then(onPostenChanged)}>löschen</button> },
            ]}
            rows={posten}
          />
        ) : (
          <div className="muted">Noch keine Zusatzposten — füge welche hinzu, um das Szenario wirken zu lassen.</div>
        )
      ) : (
        <div className="muted">{szenarien.length ? "Wähle oben am Chart ein Szenario, um Zusatzposten zu pflegen." : "Noch kein Szenario."}</div>
      )}
      {aktivId && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <button className="linkbtn" onClick={szenarioLoeschen}>aktives Szenario verwerfen</button>
        </div>
      )}

      {neuOffen && (
        <Modal title="Szenario anlegen" subtitle="What-if — z. B. Mieterhöhung, höheres Gehalt" onClose={() => setNeuOffen(false)} footer={<><Button variant="primary" onClick={neuesSzenario}>Speichern</Button><button className="linkbtn" onClick={() => setNeuOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}>
          <FormField label="Name" required>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Miete +200, Gehalt höher" />
          </FormField>
        </Modal>
      )}

      {postenOffen && (
        <Modal title="Zusatzposten hinzufügen" subtitle="kommt nur in der Szenario-Projektion zur Basis hinzu" onClose={() => setPostenOffen(false)} footer={<><Button variant="primary" onClick={postenHinzufuegen}>Speichern</Button><button className="linkbtn" onClick={() => setPostenOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}>
          <div className="form-grid">
            <FormField label="Bezeichnung">
              <input className="field" value={pBez} onChange={(e) => setPBez(e.target.value)} placeholder="z. B. Mieterhöhung" />
            </FormField>
            <FormField label="Betrag" hint="positiv — Richtung aus Charakter">
              <input className="field" inputMode="decimal" value={pBetrag} onChange={(e) => setPBetrag(e.target.value)} placeholder="0,00" />
            </FormField>
            <FormField label="Rhythmus">
              <select className="field" value={pRhythmus} onChange={(e) => setPRhythmus(e.target.value as Rhythmus)}>
                {RHYTHMEN.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </FormField>
            <FormField label="Charakter">
              <select className="field" value={pCharakter} onChange={(e) => setPCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </FormField>
            <FormField label="Erste Fälligkeit">
              <input className="field" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}
    </Card>
  );
}
