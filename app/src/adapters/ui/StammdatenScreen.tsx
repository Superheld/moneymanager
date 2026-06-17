// Stammdaten (P1) — Personen · Konten · Kategorien als Übersichtslisten; Anlegen UND
// Bearbeiten je im Modal (gleiche Maske, vorbefüllt). Reload-fest über die SQLite-Repos.

import { useEffect, useMemo, useState } from "react";
import {
  KONTOTYPEN,
  formatBetrag,
  istSummeKonto,
  realerKontostand,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type Kontotyp,
  type Person,
  type Zahlungskonto,
} from "../../core";
import { kategorieAnlegen, kontoAnlegen, personAnlegen } from "../../application/stammdatenAnlegen";
import { standardkategorienAnlegen } from "../../application/standardkategorien";
import { sqlitePersonRepository as personRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };

export function StammdatenScreen() {
  const [personen, setPersonen] = useState<Person[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);

  async function laden() {
    setPersonen(await personRepo.alle());
    setKonten(await kontoRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setIst(await ledgerRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  return (
    <div className="screen">
      <PageHead title="Stammdaten" subtitle="Haushalt — der eine Datenbestand · Personen · Konten · Kategorien" />
      <PersonenCard personen={personen} onChange={laden} />
      <KontenCard konten={konten} personen={personen} personName={personName} ist={ist} onChange={laden} />
      <KategorienCard kategorien={kategorien} onChange={laden} />
    </div>
  );
}

function PersonenCard({ personen, onChange }: { personen: Person[]; onChange: () => void }) {
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rolle, setRolle] = useState("");
  const [geburtsdatum, setGeburtsdatum] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  function neu() {
    setEditId(null);
    setName("");
    setRolle("");
    setGeburtsdatum("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(p: Person) {
    setEditId(p.id);
    setName(p.name);
    setRolle(p.rolle ?? "");
    setGeburtsdatum(p.geburtsdatum ?? "");
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await personAnlegen(personRepo, { name, rolle, geburtsdatum }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Personen" subtitle="Mitglieder des Haushalts — Dimension, kein eigener Mandant" action={<Button plus onClick={neu}>Person</Button>}>
      {personen.length === 0 ? (
        <div className="muted">Noch keine Personen.</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "rolle", label: "Rolle", render: (p) => p.rolle ?? "—" },
            { key: "geburtsdatum", label: "Geburtsdatum", render: (p) => p.geburtsdatum ?? "—" },
            { key: "_e", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => bearbeiten(p)}>bearbeiten</button> },
            { key: "_x", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => personRepo.loeschen(p.id).then(onChange)}>löschen</button> },
          ]}
          rows={personen}
        />
      )}
      {offen && (
        <Modal
          title={editId ? "Person bearbeiten" : "Person anlegen"}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={() => setOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <FormField label="Name" required>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Anna" />
          </FormField>
          <FormField label="Rolle im Haushalt">
            <input className="field" value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder="z. B. Inhaberin · Vollzeit" />
          </FormField>
          <FormField label="Geburtsdatum" hint="optional, für Vorsorge (Stufe 2)">
            <input className="field" type="date" value={geburtsdatum} onChange={(e) => setGeburtsdatum(e.target.value)} />
          </FormField>
        </Modal>
      )}
    </Card>
  );
}

function KontenCard({ konten, personen, personName, ist, onChange }: { konten: Zahlungskonto[]; personen: Person[]; personName: Map<string, string>; ist: IstBuchung[]; onChange: () => void }) {
  const hatIst = ist.some((b) => b.planRef || b.quelle === "import");
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [saldoEuro, setSaldoEuro] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  function toggleInhaber(id: string) {
    setInhaberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function neu() {
    setEditId(null);
    setBezeichnung("");
    setTyp("Giro");
    setIban("");
    setInhaberIds([]);
    setSaldoEuro("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(k: Zahlungskonto) {
    setEditId(k.id);
    setBezeichnung(k.bezeichnung);
    setTyp(k.typ);
    setIban(k.iban ?? "");
    setInhaberIds([...k.inhaberIds]);
    setSaldoEuro(String(k.saldo / 100));
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await kontoAnlegen(kontoRepo, { bezeichnung, typ, iban, inhaberIds, saldoEuro: Number(saldoEuro.replace(",", ".")) || 0 }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Konten" subtitle={hatIst ? "Anfangsbestand + bestätigte Ist-Buchungen = realer Stand" : "Liquide Geldkonten — der Kontostand ist nur eine Zahl"} action={<Button plus onClick={neu}>Konto</Button>}>
      {konten.length === 0 ? (
        <div className="muted">Noch keine Konten.</div>
      ) : (
        <DataTable
          columns={[
            { key: "bezeichnung", label: "Bezeichnung" },
            { key: "typ", label: "Typ" },
            { key: "iban", label: "IBAN", render: (k) => k.iban ?? "—" },
            { key: "inhaber", label: "Inhaber", render: (k) => (k.inhaberIds.length ? k.inhaberIds.map((id: string) => personName.get(id) ?? "?").join(", ") : "—") },
            { key: "saldo", label: hatIst ? "Anfangsbestand €" : "Kontostand €", align: "right", render: (k) => formatBetrag(k.saldo) },
            ...(hatIst
              ? [
                  { key: "ist", label: "Σ Ist €", align: "right" as const, render: (k: Zahlungskonto) => (istSummeKonto(ist, k.id) ? formatBetrag(istSummeKonto(ist, k.id), true) : "—") },
                  { key: "real", label: "realer Stand €", align: "right" as const, render: (k: Zahlungskonto) => <span style={{ fontWeight: "var(--fw-bold)" }}>{formatBetrag(realerKontostand(k, ist))}</span> },
                ]
              : []),
            { key: "_e", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => bearbeiten(k)}>bearbeiten</button> },
            { key: "_x", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => kontoRepo.loeschen(k.id).then(onChange)}>löschen</button> },
          ]}
          rows={konten}
        />
      )}
      {offen && (
        <Modal
          title={editId ? "Konto bearbeiten" : "Konto anlegen"}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={() => setOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label="Bezeichnung" required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Girokonto" />
            </FormField>
            <FormField label="Typ">
              <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as Kontotyp)}>
                {KONTOTYPEN.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </FormField>
            <FormField label="IBAN" hint="optional, wird geprüft">
              <input className="field" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE…" />
            </FormField>
            <FormField label="Kontostand" hint="Anfangsbestand — bezahlte Posten bewegen ihn">
              <input className="field" inputMode="decimal" value={saldoEuro} onChange={(e) => setSaldoEuro(e.target.value)} placeholder="0,00" />
            </FormField>
            <FormField label="Inhaber">
              {personen.length === 0 ? (
                <span className="muted">erst Personen anlegen</span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", paddingTop: 4 }}>
                  {personen.map((p) => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-sm)" }}>
                      <input type="checkbox" checked={inhaberIds.includes(p.id)} onChange={() => toggleInhaber(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </FormField>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function KategorienCard({ kategorien, onChange }: { kategorien: Kategorie[]; onChange: () => void }) {
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [elternId, setElternId] = useState("");
  const [defaultCharakter, setDefaultCharakter] = useState<Charakter>("Aufwand");
  const [fehler, setFehler] = useState<string | null>(null);

  const ids = new Set(kategorien.map((k) => k.id));
  const wurzeln = kategorien.filter((k) => !k.elternId || !ids.has(k.elternId));
  const kinderVon = (id: string) => kategorien.filter((k) => k.elternId === id);

  function neu() {
    setEditId(null);
    setName("");
    setElternId("");
    setDefaultCharakter("Aufwand");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(k: Kategorie) {
    setEditId(k.id);
    setName(k.name);
    setElternId(k.elternId ?? "");
    setDefaultCharakter(k.defaultCharakter);
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await kategorieAnlegen(kategorieRepo, { name, elternId: elternId || undefined, defaultCharakter }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  function zeile(k: Kategorie, haupt: boolean) {
    return (
      <div key={k.id} className={`katrow ${haupt ? "katmain" : "katchild"}`}>
        <span className="nm">
          {k.name} <Pill variant={CHARAKTER_PILL[k.defaultCharakter]}>{k.defaultCharakter}</Pill>
        </span>
        <span style={{ display: "flex", gap: "var(--sp-3)" }}>
          <button className="linkbtn" onClick={() => bearbeiten(k)}>bearbeiten</button>
          <button className="linkbtn" onClick={() => kategorieRepo.loeschen(k.id).then(onChange)}>löschen</button>
        </span>
      </div>
    );
  }

  return (
    <Card
      title="Kategorien"
      subtitle="Querschnitt über alle Ströme — Basis der Analysen (als Baum)"
      action={
        <span style={{ display: "flex", gap: "var(--sp-2)" }}>
          <Button onClick={() => standardkategorienAnlegen(kategorieRepo).then(onChange)}>Standard laden</Button>
          <Button variant="primary" plus onClick={neu}>Kategorie</Button>
        </span>
      }
    >
      {kategorien.length === 0 ? (
        <div className="muted">Noch keine Kategorien. „Standard laden" legt einen sinnvollen Default-Baum an.</div>
      ) : (
        <div>
          {wurzeln.map((w) => (
            <div key={w.id} className="katgroup">
              {zeile(w, true)}
              {kinderVon(w.id).map((c) => zeile(c, false))}
            </div>
          ))}
        </div>
      )}
      {offen && (
        <Modal
          title={editId ? "Kategorie bearbeiten" : "Kategorie anlegen"}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={() => setOffen(false)}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label="Name" required>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Lebensmittel" />
            </FormField>
            <FormField label="Elternkategorie" hint="optional">
              <select className="field" value={elternId} onChange={(e) => setElternId(e.target.value)}>
                <option value="">— (Wurzel)</option>
                {kategorien.filter((k) => k.id !== editId).map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
              </select>
            </FormField>
            <FormField label="Default-Charakter">
              <select className="field" value={defaultCharakter} onChange={(e) => setDefaultCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </FormField>
          </div>
        </Modal>
      )}
    </Card>
  );
}
