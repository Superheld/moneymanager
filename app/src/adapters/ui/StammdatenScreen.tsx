// Stammdaten (P1) — Haushalt der eine Datenbestand: Personen · Konten · Kategorien.
// Supporting Domain, bewusst einfach: anlegen, auflisten, löschen. Reload-fest über
// die SQLite-Repos. Auf diese Bezugsdaten zeigt ab jetzt die Zahlungsregel.

import { useEffect, useMemo, useState } from "react";
import {
  KONTOTYPEN,
  type Charakter,
  type Kategorie,
  type Kontotyp,
  type Person,
  type Zahlungskonto,
} from "../../core";
import {
  kategorieAnlegen,
  kontoAnlegen,
  personAnlegen,
} from "../../application/stammdatenAnlegen";
import { sqlitePersonRepository as personRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, Pill } from "./ds";

const CHARAKTERE: { wert: Charakter; label: string }[] = [
  { wert: "Aufwand", label: "Aufwand" },
  { wert: "Ertrag", label: "Ertrag" },
  { wert: "Umschichtung", label: "Umschichtung" },
];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

export function StammdatenScreen() {
  const [personen, setPersonen] = useState<Person[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  async function laden() {
    setPersonen(await personRepo.alle());
    setKonten(await kontoRepo.alle());
    setKategorien(await kategorieRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  return (
    <div className="screen">
      <div className="phead">
        <h1>Stammdaten</h1>
        <div className="psub">Haushalt — der eine Datenbestand · Personen · Konten · Kategorien</div>
      </div>

      <PersonenCard personen={personen} onChange={laden} />
      <KontenCard konten={konten} personen={personen} personName={personName} onChange={laden} />
      <KategorienCard kategorien={kategorien} kategorieName={kategorieName} onChange={laden} />
    </div>
  );
}

function PersonenCard({ personen, onChange }: { personen: Person[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [rolle, setRolle] = useState("");
  const [geburtsdatum, setGeburtsdatum] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function anlegen() {
    setFehler(null);
    try {
      await personAnlegen(personRepo, { name, rolle, geburtsdatum });
      setName("");
      setRolle("");
      setGeburtsdatum("");
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Personen" subtitle="Mitglieder des Haushalts — Dimension, kein eigener Mandant">
      <div className="form-grid">
        <FormField label="Name" required>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Anna" />
        </FormField>
        <FormField label="Rolle im Haushalt">
          <input className="field" value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder="z. B. Inhaberin · Vollzeit" />
        </FormField>
        <FormField label="Geburtsdatum" hint="optional, für Vorsorge (Stufe 2)">
          <input className="field" type="date" value={geburtsdatum} onChange={(e) => setGeburtsdatum(e.target.value)} />
        </FormField>
      </div>
      <div className="form-actions">
        <Button variant="primary" plus onClick={anlegen}>
          Person anlegen
        </Button>
        {fehler && <span className="err">{fehler}</span>}
      </div>

      {personen.length > 0 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "rolle", label: "Rolle", render: (p) => p.rolle ?? "—" },
              { key: "geburtsdatum", label: "Geburtsdatum", render: (p) => p.geburtsdatum ?? "—" },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (p) => <LoeschBtn onClick={() => personRepo.loeschen(p.id).then(onChange)} />,
              },
            ]}
            rows={personen}
          />
        </div>
      )}
    </Card>
  );
}

function KontenCard({
  konten,
  personen,
  personName,
  onChange,
}: {
  konten: Zahlungskonto[];
  personen: Person[];
  personName: Map<string, string>;
  onChange: () => void;
}) {
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  function toggleInhaber(id: string) {
    setInhaberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function anlegen() {
    setFehler(null);
    try {
      await kontoAnlegen(kontoRepo, { bezeichnung, typ, iban, inhaberIds });
      setBezeichnung("");
      setIban("");
      setInhaberIds([]);
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Konten" subtitle="Liquide Geldkonten — der Kontostand ist nur eine Zahl">
      <div className="form-grid">
        <FormField label="Bezeichnung" required>
          <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Girokonto" />
        </FormField>
        <FormField label="Typ">
          <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as Kontotyp)}>
            {KONTOTYPEN.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="IBAN" hint="optional, wird geprüft">
          <input className="field" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE…" />
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
      <div className="form-actions">
        <Button variant="primary" plus onClick={anlegen}>
          Konto anlegen
        </Button>
        {fehler && <span className="err">{fehler}</span>}
      </div>

      {konten.length > 0 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <DataTable
            columns={[
              { key: "bezeichnung", label: "Bezeichnung" },
              { key: "typ", label: "Typ" },
              { key: "iban", label: "IBAN", render: (k) => k.iban ?? "—" },
              {
                key: "inhaber",
                label: "Inhaber",
                render: (k) =>
                  k.inhaberIds.length ? k.inhaberIds.map((id: string) => personName.get(id) ?? "?").join(", ") : "—",
              },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (k) => <LoeschBtn onClick={() => kontoRepo.loeschen(k.id).then(onChange)} />,
              },
            ]}
            rows={konten}
          />
        </div>
      )}
    </Card>
  );
}

function KategorienCard({
  kategorien,
  kategorieName,
  onChange,
}: {
  kategorien: Kategorie[];
  kategorieName: Map<string, string>;
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [elternId, setElternId] = useState("");
  const [defaultCharakter, setDefaultCharakter] = useState<Charakter>("Aufwand");
  const [fehler, setFehler] = useState<string | null>(null);

  async function anlegen() {
    setFehler(null);
    try {
      await kategorieAnlegen(kategorieRepo, { name, elternId: elternId || undefined, defaultCharakter });
      setName("");
      setElternId("");
      onChange();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Kategorien" subtitle="Querschnitt über alle Ströme — Basis der Analysen (als Baum)">
      <div className="form-grid">
        <FormField label="Name" required>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Lebensmittel" />
        </FormField>
        <FormField label="Elternkategorie" hint="optional">
          <select className="field" value={elternId} onChange={(e) => setElternId(e.target.value)}>
            <option value="">— (Wurzel)</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Default-Charakter">
          <select className="field" value={defaultCharakter} onChange={(e) => setDefaultCharakter(e.target.value as Charakter)}>
            {CHARAKTERE.map((c) => (
              <option key={c.wert} value={c.wert}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="form-actions">
        <Button variant="primary" plus onClick={anlegen}>
          Kategorie anlegen
        </Button>
        {fehler && <span className="err">{fehler}</span>}
      </div>

      {kategorien.length > 0 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "eltern", label: "Eltern", render: (k) => (k.elternId ? kategorieName.get(k.elternId) ?? "?" : "—") },
              {
                key: "charakter",
                label: "Default-Charakter",
                render: (k) => <Pill variant={CHARAKTER_PILL[k.defaultCharakter as Charakter]}>{k.defaultCharakter}</Pill>,
              },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (k) => <LoeschBtn onClick={() => kategorieRepo.loeschen(k.id).then(onChange)} />,
              },
            ]}
            rows={kategorien}
          />
        </div>
      )}
    </Card>
  );
}

function LoeschBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="linkbtn" onClick={onClick}>
      löschen
    </button>
  );
}
