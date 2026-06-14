// Töpfe (P2.3) — Ansparen für Ungewisses (Puffer) und Wünsche (Spartopf). Kein Reset,
// du entnimmst, wenn du's brauchst. Der Ersatz-Fall (Gegenstände) lebt eigenständig im
// Bereich „Inventar". Plan-only.

import { useEffect, useMemo, useState } from "react";
import {
  ansparrate,
  centZuEuro,
  formatBetrag,
  sollstand,
  zielwert,
  type Topf,
} from "../../core";
import { topfAnlegen } from "../../application/topfAnlegen";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { Button, Card, CoverageTrack, FormField, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";

type TopfArt = "puffer" | "spartopf";
const ART_LABEL: Record<TopfArt, string> = { puffer: "Puffer", spartopf: "Spartopf" };

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function ToepfeScreen() {
  const heute = useMemo(heuteIso, []);
  const [toepfe, setToepfe] = useState<Topf[]>([]);

  const [offen, setOffen] = useState(false);
  const [typ, setTyp] = useState<TopfArt>("puffer");
  const [bezeichnung, setBezeichnung] = useState("");
  const [start, setStart] = useState(heute);
  const [schaetzbetrag, setSchaetzbetrag] = useState("");
  const [fristMonate, setFristMonate] = useState("");
  const [zufuehrung, setZufuehrung] = useState("");
  const [sparziel, setSparziel] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setToepfe(await topfRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  // Nur Puffer + Spartopf hier; Ersatz-Töpfe gehören zum Inventar.
  const sichtbar = toepfe.filter((t) => t.typ !== "ersatz");
  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  async function anlegen() {
    setFehler(null);
    try {
      await topfAnlegen(topfRepo, {
        typ,
        bezeichnung,
        start,
        schaetzbetragEuro: num(schaetzbetrag),
        fristMonate: num(fristMonate),
        zufuehrungProMonatEuro: num(zufuehrung),
        sparzielEuro: num(sparziel),
      });
      setBezeichnung("");
      setSchaetzbetrag("");
      setFristMonate("");
      setZufuehrung("");
      setSparziel("");
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title="Töpfe"
        subtitle="Wie Budgets — aber zum Ansparen statt Verbrauchen"
        action={<Button variant="primary" plus onClick={() => setOffen(true)}>Topf anlegen</Button>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        Ein Topf <b style={{ color: "var(--ink)" }}>spart an (kein Reset)</b> und du <b style={{ color: "var(--ink)" }}>entnimmst, wenn du's brauchst</b>. Zwei Sorten:{" "}
        <b style={{ color: "var(--ink)" }}>Puffer</b> für Ungewisses (Steuernachzahlung, Reparatur) ·{" "}
        <b style={{ color: "var(--ink)" }}>Spartopf</b> für Wünsche (Klamotten, Urlaub). Für Dinge, die du
        besitzt und ersetzen musst, gibt es den eigenen Bereich <b style={{ color: "var(--ink)" }}>Inventar</b>.
      </p>

      <Card title="Töpfe" subtitle={`${sichtbar.length} Stück`}>
        {sichtbar.length === 0 ? (
          <div className="muted">Noch keine Töpfe.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {sichtbar.map((t) => {
              const ziel = zielwert(t);
              const soll = sollstand(t, heute);
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {t.bezeichnung} <Pill variant="neutral">{ART_LABEL[t.typ as TopfArt] ?? t.typ}</Pill>
                    </span>
                    <span className="muted">
                      Ansparrate {formatBetrag(ansparrate(t))} €/Mt{"  ·  "}
                      <button className="linkbtn" onClick={() => topfRepo.loeschen(t.id).then(laden)}>löschen</button>
                    </span>
                  </div>
                  {ziel != null && soll != null ? (
                    <CoverageTrack value={centZuEuro(soll)} max={centZuEuro(ziel)} label="Sollstand heute / Ziel" right={`${formatBetrag(soll)} / ${formatBetrag(ziel)} €`} />
                  ) : (
                    <div className="muted">Kein Sparziel — nur laufender Stand (real ab P3).</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {offen && (
        <Modal
          title="Topf anlegen"
          subtitle="Puffer für Ungewisses · Spartopf für Wünsche"
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={anlegen}>Speichern</Button><button className="linkbtn" onClick={() => setOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label="Art">
              <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as TopfArt)}>
                <option value="puffer">Puffer — für Ungewisses</option>
                <option value="spartopf">Spartopf — für Wünsche</option>
              </select>
            </FormField>
            <FormField label="Bezeichnung" required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={typ === "puffer" ? "z. B. Steuernachzahlung" : "z. B. Urlaub"} />
            </FormField>
            <FormField label="Start">
              <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </FormField>
            {typ === "puffer" && (
              <>
                <FormField label="Schätzbetrag" required>
                  <input className="field" inputMode="decimal" value={schaetzbetrag} onChange={(e) => setSchaetzbetrag(e.target.value)} placeholder="z. B. 1200" />
                </FormField>
                <FormField label="Zeitfenster (Monate)" required>
                  <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="12" />
                </FormField>
              </>
            )}
            {typ === "spartopf" && (
              <>
                <FormField label="Zuführung pro Monat" required>
                  <input className="field" inputMode="decimal" value={zufuehrung} onChange={(e) => setZufuehrung(e.target.value)} placeholder="z. B. 50" />
                </FormField>
                <FormField label="Sparziel" hint="optional — ohne Ziel kein Sollstand">
                  <input className="field" inputMode="decimal" value={sparziel} onChange={(e) => setSparziel(e.target.value)} placeholder="z. B. 500" />
                </FormField>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
