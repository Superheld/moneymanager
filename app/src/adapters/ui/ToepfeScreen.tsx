// Töpfe (P2.3) — Zweckbindung in drei Spielarten: Ersatz (Rücklage), Puffer
// (Rückstellung), Spartopf (Freitopf, optionales Sparziel). Zeigt Ansparrate,
// Zielwert und den Plan-Sollstand heute (Fortschritt zum Ziel). Plan-only.

import { useEffect, useMemo, useState } from "react";
import {
  ansparrate,
  centZuEuro,
  formatBetrag,
  sollstand,
  zielwert,
  type Inventargegenstand,
  type Topf,
  type TopfTyp,
} from "../../core";
import { topfAnlegen } from "../../application/topfAnlegen";
import { ersatztopfAusInventar, inventarAnlegen } from "../../application/inventarAnlegen";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { Button, Card, CoverageTrack, DataTable, FormField, Pill } from "./ds";

const TYP_LABEL: Record<TopfTyp, string> = {
  ersatz: "Ersatz (Rücklage)",
  puffer: "Puffer (Rückstellung)",
  spartopf: "Spartopf (frei)",
};

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function ToepfeScreen() {
  const heute = useMemo(heuteIso, []);
  const [toepfe, setToepfe] = useState<Topf[]>([]);

  const [typ, setTyp] = useState<TopfTyp>("ersatz");
  const [bezeichnung, setBezeichnung] = useState("");
  const [start, setStart] = useState(heute);
  const [wiederbeschaffung, setWiederbeschaffung] = useState("");
  const [nutzungsdauerMonate, setNutzungsdauerMonate] = useState("");
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

  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  async function anlegen() {
    setFehler(null);
    try {
      await topfAnlegen(topfRepo, {
        typ,
        bezeichnung,
        start,
        wiederbeschaffungEuro: num(wiederbeschaffung),
        nutzungsdauerMonate: num(nutzungsdauerMonate),
        schaetzbetragEuro: num(schaetzbetrag),
        fristMonate: num(fristMonate),
        zufuehrungProMonatEuro: num(zufuehrung),
        sparzielEuro: num(sparziel),
      });
      setBezeichnung("");
      setWiederbeschaffung("");
      setNutzungsdauerMonate("");
      setSchaetzbetrag("");
      setFristMonate("");
      setZufuehrung("");
      setSparziel("");
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <div className="phead">
        <h1>Töpfe</h1>
        <div className="psub">Zweckbindung — nicht kontogebunden, durch Kontostände gedeckt</div>
      </div>

      <InventarCard onTopfErzeugt={laden} />

      <Card title="Topf anlegen" subtitle="Ersatz spart für Wiederbeschaffung · Puffer für Ungewisses · Spartopf frei">
        <div className="form-grid">
          <FormField label="Art">
            <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as TopfTyp)}>
              <option value="ersatz">Ersatz (Rücklage)</option>
              <option value="puffer">Puffer (Rückstellung)</option>
              <option value="spartopf">Spartopf (frei)</option>
            </select>
          </FormField>
          <FormField label="Bezeichnung" required>
            <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Waschmaschine" />
          </FormField>
          <FormField label="Start">
            <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>

          {typ === "ersatz" && (
            <>
              <FormField label="Wiederbeschaffungswert" required>
                <input className="field" inputMode="decimal" value={wiederbeschaffung} onChange={(e) => setWiederbeschaffung(e.target.value)} placeholder="z. B. 600" />
              </FormField>
              <FormField label="Nutzungsdauer (Monate)" required hint="z. B. 60 = 5 Jahre">
                <input className="field" inputMode="numeric" value={nutzungsdauerMonate} onChange={(e) => setNutzungsdauerMonate(e.target.value)} placeholder="60" />
              </FormField>
            </>
          )}
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
        <div className="form-actions">
          <Button variant="primary" plus onClick={anlegen}>
            Topf anlegen
          </Button>
          {fehler && <span className="err">{fehler}</span>}
        </div>
      </Card>

      <Card title="Töpfe" subtitle={`${toepfe.length} Stück`}>
        {toepfe.length === 0 ? (
          <div className="muted">Noch keine Töpfe.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {toepfe.map((t) => {
              const ziel = zielwert(t);
              const soll = sollstand(t, heute);
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {t.bezeichnung} <Pill variant="neutral">{TYP_LABEL[t.typ]}</Pill>
                    </span>
                    <span className="muted">
                      Ansparrate {formatBetrag(ansparrate(t))} €/Mt
                      {"  ·  "}
                      <button className="linkbtn" onClick={() => topfRepo.loeschen(t.id).then(laden)}>
                        löschen
                      </button>
                    </span>
                  </div>
                  {ziel != null && soll != null ? (
                    <CoverageTrack
                      value={centZuEuro(soll)}
                      max={centZuEuro(ziel)}
                      label="Sollstand heute / Ziel"
                      right={`${formatBetrag(soll)} / ${formatBetrag(ziel)} €`}
                    />
                  ) : (
                    <div className="muted">Kein Sparziel — nur laufender Stand (real ab P3).</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function InventarCard({ onTopfErzeugt }: { onTopfErzeugt: () => void }) {
  const [items, setItems] = useState<Inventargegenstand[]>([]);
  const [bezeichnung, setBezeichnung] = useState("");
  const [wiederbeschaffung, setWiederbeschaffung] = useState("");
  const [nutzungsdauerMonate, setNutzungsdauerMonate] = useState("");
  const [anschaffung, setAnschaffung] = useState(heuteIso());
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setItems(await inventarRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  async function anlegen() {
    setFehler(null);
    try {
      await inventarAnlegen(inventarRepo, {
        bezeichnung,
        wiederbeschaffungEuro: Number(wiederbeschaffung.replace(",", ".")) || 0,
        nutzungsdauerMonate: Number(nutzungsdauerMonate) || 0,
        anschaffung,
      });
      setBezeichnung("");
      setWiederbeschaffung("");
      setNutzungsdauerMonate("");
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function ersatzTopfErzeugen(g: Inventargegenstand) {
    await ersatztopfAusInventar(topfRepo, g);
    onTopfErzeugt();
  }

  return (
    <Card title="Inventar" subtitle="Dinge, die du besitzt und ersetzen musst — Quelle für Ersatz-Töpfe">
      <div className="form-grid">
        <FormField label="Gegenstand" required>
          <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Auto, Laptop" />
        </FormField>
        <FormField label="Wiederbeschaffungswert" required>
          <input className="field" inputMode="decimal" value={wiederbeschaffung} onChange={(e) => setWiederbeschaffung(e.target.value)} placeholder="z. B. 14400" />
        </FormField>
        <FormField label="Nutzungsdauer (Monate)" required hint="z. B. 96 = 8 Jahre">
          <input className="field" inputMode="numeric" value={nutzungsdauerMonate} onChange={(e) => setNutzungsdauerMonate(e.target.value)} placeholder="96" />
        </FormField>
        <FormField label="Anschaffung">
          <input className="field" type="date" value={anschaffung} onChange={(e) => setAnschaffung(e.target.value)} />
        </FormField>
      </div>
      <div className="form-actions">
        <Button variant="primary" plus onClick={anlegen}>
          Gegenstand aufnehmen
        </Button>
        {fehler && <span className="err">{fehler}</span>}
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <DataTable
            columns={[
              { key: "bezeichnung", label: "Gegenstand" },
              { key: "wiederbeschaffung", label: "Wiederbeschaffung €", align: "right", render: (g) => formatBetrag(g.wiederbeschaffung) },
              { key: "nutzungsdauer", label: "Nutzungsdauer (Mt)", align: "right", render: (g) => String(g.nutzungsdauerMonate) },
              {
                key: "_t",
                label: "",
                align: "right",
                render: (g) => (
                  <button className="linkbtn" onClick={() => ersatzTopfErzeugen(g)} style={{ color: "var(--accent-deep)" }}>
                    → Ersatz-Topf anlegen
                  </button>
                ),
              },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (g) => (
                  <button className="linkbtn" onClick={() => inventarRepo.loeschen(g.id).then(laden)}>
                    löschen
                  </button>
                ),
              },
            ]}
            rows={items}
          />
        </div>
      )}
    </Card>
  );
}
