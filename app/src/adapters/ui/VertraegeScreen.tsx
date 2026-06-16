// Verträge (P2.1) — Übersicht mit Kündigungsterminen; Anlegen im Modal. Eine Maske
// erzeugt Vertrag (Stammdaten) + abgeleitete Zahlungsregel (Planung).

import { useEffect, useMemo, useState } from "react";
import {
  formatBetrag,
  kuendigungsterminNaht,
  naechsterKuendigungstermin,
  type Charakter,
  type Kategorie,
  type Person,
  type Rhythmus,
  type Vertrag,
  type Verlaengerungsart,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { vertragAktualisieren, vertragAnlegen, vertragLoeschen } from "../../application/vertragAnlegen";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";

const RHYTHMEN: { wert: Rhythmus; label: string }[] = [
  { wert: "monatlich", label: "monatlich" },
  { wert: "quartalsweise", label: "quartalsweise" },
  { wert: "halbjaehrlich", label: "halbjährlich" },
  { wert: "jaehrlich", label: "jährlich" },
];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function VertraegeScreen() {
  const heute = useMemo(heuteIso, []);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [anbieter, setAnbieter] = useState("");
  const [inhaberId, setInhaberId] = useState("");
  const [beginn, setBeginn] = useState(heute);
  const [mindestlaufzeit, setMindestlaufzeit] = useState("");
  const [verlaengerung, setVerlaengerung] = useState<Verlaengerungsart>("automatisch");
  const [verlaengerungMonate, setVerlaengerungMonate] = useState("12");
  const [kuendigungsfrist, setKuendigungsfrist] = useState("");
  const [betragEuro, setBetragEuro] = useState("");
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [kategorieId, setKategorieId] = useState("");
  const [kontoId, setKontoId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setVertraege(await vertragRepo.alle());
    setRegeln(await regelRepo.alle());
    setPersonen(await personRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setKonten(await kontoRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  const regelZuVertrag = useMemo(() => {
    const m = new Map<string, Zahlungsregel>();
    for (const r of regeln) if (r.vertragId) m.set(r.vertragId, r);
    return m;
  }, [regeln]);
  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  function kategorieWaehlen(id: string) {
    setKategorieId(id);
    const k = kategorien.find((x) => x.id === id);
    if (k) setCharakter(k.defaultCharakter);
  }

  function neu() {
    setEditId(null);
    setAnbieter("");
    setInhaberId("");
    setBeginn(heute);
    setMindestlaufzeit("");
    setVerlaengerung("automatisch");
    setVerlaengerungMonate("12");
    setKuendigungsfrist("");
    setBetragEuro("");
    setRhythmus("monatlich");
    setCharakter("Aufwand");
    setKategorieId("");
    setKontoId("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(v: Vertrag) {
    const r = regelZuVertrag.get(v.id);
    setEditId(v.id);
    setAnbieter(v.anbieter);
    setInhaberId(v.inhaberId ?? "");
    setBeginn(v.beginn);
    setMindestlaufzeit(v.mindestlaufzeitMonate != null ? String(v.mindestlaufzeitMonate) : "");
    setVerlaengerung(v.verlaengerung);
    setVerlaengerungMonate(v.verlaengerungMonate != null ? String(v.verlaengerungMonate) : "12");
    setKuendigungsfrist(v.kuendigungsfristMonate != null ? String(v.kuendigungsfristMonate) : "");
    setBetragEuro(r ? String(Math.abs(r.betrag) / 100) : "");
    setRhythmus(r?.rhythmus ?? "monatlich");
    setCharakter(r?.charakter ?? "Aufwand");
    setKategorieId(r?.kategorieId ?? "");
    setKontoId(r?.kontoId ?? "");
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    const eingabe = {
      anbieter,
      inhaberId: inhaberId || undefined,
      beginn,
      mindestlaufzeitMonate: mindestlaufzeit ? Number(mindestlaufzeit) : undefined,
      verlaengerung,
      verlaengerungMonate: verlaengerungMonate ? Number(verlaengerungMonate) : undefined,
      kuendigungsfristMonate: kuendigungsfrist ? Number(kuendigungsfrist) : undefined,
      betragEuro: Number(betragEuro.replace(",", ".")),
      rhythmus,
      charakter,
      kategorieId: kategorieId || undefined,
      kontoId: kontoId || undefined,
    };
    try {
      if (editId) await vertragAktualisieren(vertragRepo, regelRepo, editId, eingabe);
      else await vertragAnlegen(vertragRepo, regelRepo, eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title="Verträge"
        subtitle="Wiederkehrende Zahlungen inkl. Einnahmen · Fristen & Kündigungstermine"
        action={
          <Button variant="primary" plus onClick={neu}>
            Vertrag anlegen
          </Button>
        }
      />

      <Card>
        {vertraege.length === 0 ? (
          <div className="muted">Noch keine Verträge.</div>
        ) : (
          <DataTable
            columns={[
              { key: "anbieter", label: "Anbieter" },
              { key: "inhaber", label: "Inhaber", render: (v) => (v.inhaberId ? personName.get(v.inhaberId) ?? "?" : "—") },
              {
                key: "charakter",
                label: "Charakter",
                render: (v) => {
                  const r = regelZuVertrag.get(v.id);
                  return r ? <Pill variant={CHARAKTER_PILL[r.charakter]}>{r.charakter}</Pill> : "—";
                },
              },
              { key: "rhythmus", label: "Rhythmus", render: (v) => regelZuVertrag.get(v.id)?.rhythmus ?? "—" },
              {
                key: "kuendigung",
                label: "Kündigen bis",
                render: (v) => {
                  const t = naechsterKuendigungstermin(v, heute);
                  if (!t) return <span className="muted">—</span>;
                  const naht = kuendigungsterminNaht(v, heute);
                  return (
                    <span>
                      {t.kuendigenBis} {naht && <Pill variant="warn">bald</Pill>}
                    </span>
                  );
                },
              },
              {
                key: "betrag",
                label: "Betrag €",
                align: "right",
                render: (v) => {
                  const r = regelZuVertrag.get(v.id);
                  return r ? formatBetrag(r.betrag, true) : "—";
                },
              },
              { key: "_e", label: "", align: "right", render: (v) => <button className="linkbtn" onClick={() => bearbeiten(v)}>bearbeiten</button> },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (v) => (
                  <button className="linkbtn" onClick={() => vertragLoeschen(vertragRepo, regelRepo, v.id).then(laden)}>
                    löschen
                  </button>
                ),
              },
            ]}
            rows={vertraege}
          />
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? "Vertrag bearbeiten" : "Vertrag anlegen"}
          subtitle="Erzeugt/aktualisiert zugleich die Plan-Zahlung (abgeleitete Zahlungsregel)"
          onClose={() => setOffen(false)}
          footer={
            <>
              <Button variant="primary" onClick={speichern}>
                Speichern
              </Button>
              <button className="linkbtn" onClick={() => setOffen(false)}>
                Abbrechen
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <div className="form-grid">
            <FormField label="Anbieter" required>
              <input className="field" value={anbieter} onChange={(e) => setAnbieter(e.target.value)} placeholder="z. B. Stadtwerke, Arbeitgeber" />
            </FormField>
            <FormField label="Inhaber">
              <select className="field" value={inhaberId} onChange={(e) => setInhaberId(e.target.value)}>
                <option value="">—</option>
                {personen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Beginn">
              <input className="field" type="date" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
            </FormField>
            <FormField label="Mindestlaufzeit (Monate)" hint="optional">
              <input className="field" inputMode="numeric" value={mindestlaufzeit} onChange={(e) => setMindestlaufzeit(e.target.value)} placeholder="z. B. 24" />
            </FormField>
            <FormField label="Verlängerung">
              <select className="field" value={verlaengerung} onChange={(e) => setVerlaengerung(e.target.value as Verlaengerungsart)}>
                <option value="automatisch">automatisch</option>
                <option value="keine">keine</option>
              </select>
            </FormField>
            <FormField label="Verlängerung um (Monate)" hint="bei automatisch">
              <input className="field" inputMode="numeric" value={verlaengerungMonate} onChange={(e) => setVerlaengerungMonate(e.target.value)} placeholder="z. B. 12" />
            </FormField>
            <FormField label="Kündigungsfrist (Monate)" hint="optional">
              <input className="field" inputMode="numeric" value={kuendigungsfrist} onChange={(e) => setKuendigungsfrist(e.target.value)} placeholder="z. B. 3" />
            </FormField>
            <FormField label="Betrag je Zahlung" required hint="positiv — Richtung aus Charakter">
              <input className="field" inputMode="decimal" value={betragEuro} onChange={(e) => setBetragEuro(e.target.value)} placeholder="0,00" />
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
              <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={kategorieWaehlen} />
            </FormField>
            <FormField label="Charakter">
              <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Konto" hint="optional">
              <select className="field" value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
                <option value="">—</option>
                {konten.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.bezeichnung}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
