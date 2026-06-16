// Inventar — deine Gegenstände, für deren Ersatz du automatisch ansparst (Ersatz-Fall).
// Eigener Bereich, getrennt von den Töpfen (die nur Puffer + Spartopf sind). Ein
// Gegenstand legt beim Anlegen direkt seinen Ersatz-Topf mit an; die Liste zeigt den
// Ansparfortschritt. Plan-only.

import { useEffect, useMemo, useState } from "react";
import {
  ansparrate,
  centZuEuro,
  formatBetrag,
  sollstand,
  zielwert,
  type Ersatztopf,
  type Inventargegenstand,
  type Topf,
} from "../../core";
import { inventarAktualisieren, inventarLoeschen, inventarMitTopfAnlegen } from "../../application/inventarAnlegen";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { Button, Card, CoverageTrack, FormField } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function InventarScreen() {
  const heute = useMemo(heuteIso, []);
  const [items, setItems] = useState<Inventargegenstand[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [wiederbeschaffung, setWiederbeschaffung] = useState("");
  const [nutzungsdauerMonate, setNutzungsdauerMonate] = useState("");
  const [anschaffung, setAnschaffung] = useState(heute);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setItems(await inventarRepo.alle());
    setToepfe(await topfRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  // Ersatz-Topf je Gegenstand (für den Ansparfortschritt).
  const topfZuItem = useMemo(() => {
    const m = new Map<string, Ersatztopf>();
    for (const t of toepfe) if (t.typ === "ersatz" && t.inventarId) m.set(t.inventarId, t);
    return m;
  }, [toepfe]);

  function neu() {
    setEditId(null);
    setBezeichnung("");
    setWiederbeschaffung("");
    setNutzungsdauerMonate("");
    setAnschaffung(heute);
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(g: Inventargegenstand) {
    setEditId(g.id);
    setBezeichnung(g.bezeichnung);
    setWiederbeschaffung(String(g.wiederbeschaffung / 100));
    setNutzungsdauerMonate(String(g.nutzungsdauerMonate));
    setAnschaffung(g.anschaffung);
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    const eingabe = {
      bezeichnung,
      wiederbeschaffungEuro: Number(wiederbeschaffung.replace(",", ".")) || 0,
      nutzungsdauerMonate: Number(nutzungsdauerMonate) || 0,
      anschaffung,
    };
    try {
      if (editId) await inventarAktualisieren(inventarRepo, topfRepo, editId, eingabe);
      else await inventarMitTopfAnlegen(inventarRepo, topfRepo, eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title="Inventar"
        subtitle="Dinge, die du besitzt und ersetzen musst — du sparst automatisch den Ersatz an"
        action={<Button variant="primary" plus onClick={neu}>Gegenstand</Button>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        Für jeden Gegenstand (Waschmaschine, Auto, Laptop …) legst du Wiederbeschaffungswert und Nutzungsdauer fest — daraus
        ergibt sich eine monatliche <b style={{ color: "var(--ink)" }}>Ansparrate</b>, damit das Geld da ist, wenn er ersetzt
        werden muss. Für Ungewisses oder Wünsche nimmst du stattdessen einen <b style={{ color: "var(--ink)" }}>Topf</b>.
      </p>

      <Card>
        {items.length === 0 ? (
          <div className="muted">Noch kein Inventar. Leg deinen ersten Gegenstand an.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {items.map((g) => {
              const t = topfZuItem.get(g.id);
              const ziel = t ? zielwert(t) : null;
              const soll = t ? sollstand(t, heute) : null;
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>{g.bezeichnung}</span>
                    <span className="muted">
                      {t ? `Ansparrate ${formatBetrag(ansparrate(t))} €/Mt` : "kein Ersatz-Topf"}
                      {"  ·  "}
                      <button className="linkbtn" onClick={() => bearbeiten(g)}>bearbeiten</button>{"  ·  "}
                      <button className="linkbtn" onClick={() => inventarLoeschen(inventarRepo, topfRepo, g.id).then(laden)}>löschen</button>
                    </span>
                  </div>
                  {ziel != null && soll != null ? (
                    <CoverageTrack value={centZuEuro(soll)} max={centZuEuro(ziel)} label="Angespart heute / Wiederbeschaffung" right={`${formatBetrag(soll)} / ${formatBetrag(ziel)} €`} />
                  ) : (
                    <div className="muted">Nutzungsdauer {g.nutzungsdauerMonate} Monate · Wiederbeschaffung {formatBetrag(g.wiederbeschaffung)} €</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? "Gegenstand bearbeiten" : "Gegenstand aufnehmen"}
          subtitle="Wiederbeschaffung ÷ Nutzungsdauer → Ansparrate (Ersatz-Topf wird mitgeführt)"
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={() => setOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
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
        </Modal>
      )}
    </div>
  );
}
