// Die Stammdaten der Einstellungen: Personen und Kategorien, je eine Karte mit Liste und
// Dialog.
//
// Bis 2026-11-10 standen sie in `EinstellungenScreen.tsx` (K3 der Oberflächenliste).

import { Datumsfeld } from "../bausteine/Datumsfeld";
import {  useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type Charakter,
  type Kategorie,
  type Person,
} from "../../../application";
import {
  kategorieAnlegen,
  kategorieLoeschen,
  personAnlegen,
  personLoeschen,
  standardkategorienAnlegen,
} from "../../dienste";
import { Button, Card, DataTable, FormField, Pill } from "../bausteine";
import { IconButton } from "../bausteine/IconButton";
import { Auswahl } from "../bausteine/Auswahl";
import { Modal } from "../bausteine/Modal";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import {
  fehlerNachricht,
} from "../bausteine/einstellungenKontext";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };


export function PersonenCard({ personen, onChange }: { personen: Person[]; onChange: () => void }) {
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
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
      await personAnlegen({ name, rolle, geburtsdatum }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Card action={<Button plus onClick={neu}>{t("einstellungen.person.anlegen")}</Button>}>
      {personen.length === 0 ? (
        <div className="muted">{t("einstellungen.person.leer")}</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: t("einstellungen.person.spalteName") },
            { key: "rolle", label: t("einstellungen.person.spalteRolle"), render: (p) => p.rolle ?? "—" },
            { key: "geburtsdatum", label: t("einstellungen.person.spalteGeburtsdatum"), render: (p) => p.geburtsdatum ?? "—" },
            { key: "_e", label: "", align: "right", render: (p) => <IconButton icon="bearbeiten" label={t("einstellungen.bearbeiten")} onClick={() => bearbeiten(p)} /> },
            { key: "_x", label: "", align: "right", render: (p) => <IconButton icon="loeschen" ton="gefahr" label={t("einstellungen.loeschen")} onClick={() => loeschfrage.stellen({
              name: p.name,
              folgen: t("einstellungen.personLoeschenFolgen"),
              ausfuehren: async () => { await personLoeschen(p.id); onChange(); },
            })} /> },
          ]}
          rows={personen}
        />
      )}
      {offen && (
        <Modal
          title={editId ? t("einstellungen.person.modalBearbeiten") : t("einstellungen.person.modalAnlegen")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><Button variant="link" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <FormField label={t("einstellungen.person.feldName")} required>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("einstellungen.person.feldNamePlaceholder")} />
          </FormField>
          <FormField label={t("einstellungen.person.feldRolle")}>
            <input className="field" value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder={t("einstellungen.person.feldRollePlaceholder")} />
          </FormField>
          <FormField label={t("einstellungen.person.feldGeburtsdatum")} hint={t("einstellungen.person.feldGeburtsdatumHinweis")}>
            <Datumsfeld ariaLabel={t("einstellungen.person.feldGeburtsdatum")} wert={geburtsdatum} aufAenderung={setGeburtsdatum} />
          </FormField>
        </Modal>
      )}
      {loeschfrage.dialog}
    </Card>
  );
}

export function KategorienCard({ kategorien, onChange }: { kategorien: Kategorie[]; onChange: () => void }) {
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
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
      await kategorieAnlegen({ name, elternId: elternId || undefined, defaultCharakter }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /**
   * Eine Zeile samt allem, was darunter hängt.
   *
   * **Rekursiv, und das war es bis 2026-08-30 nicht.** Gezeichnet wurden Wurzeln und
   * deren direkte Kinder, sonst nichts. Ein Enkel fiel durch beide Raster — er ist keine
   * Wurzel (sein Elternteil existiert) und kein Kind einer Wurzel. Er lag damit in der
   * Datenbank, ohne dass man ihn sehen, bearbeiten oder löschen konnte, und die Maske
   * bot ihn weiterhin als Elternteil an: wer eine Kategorie dorthin verschob, sah sie
   * nie wieder.
   *
   * Der Kern kennt diese Grenze nicht — eine Kategorie trägt eine `elternId`, damit
   * beliebige Tiefe. Die Beschränkung sass allein in dieser Schleife.
   */
  function zeile(k: Kategorie, ebene: number) {
    const haupt = ebene === 0;
    return (
      <div
        key={k.id}
        className={`katrow ${haupt ? "katmain" : "katchild"}`}
        style={haupt ? undefined : ({ "--kat-ebene": ebene } as CSSProperties)}
      >
        <span className="nm">
          {k.name} <Pill variant={CHARAKTER_PILL[k.defaultCharakter]}>{t(`charakter.${k.defaultCharakter}`)}</Pill>
        </span>
        <span style={{ display: "flex", gap: "var(--sp-3)" }}>
          <IconButton icon="bearbeiten" label={t("einstellungen.bearbeiten")} onClick={() => bearbeiten(k)} />
          <IconButton icon="loeschen" ton="gefahr" label={t("einstellungen.loeschen")} onClick={() => loeschfrage.stellen({
            name: k.name,
            // Der Fremdschluessel steht auf ON DELETE SET NULL: die Buchungen bleiben,
            // sie stehen danach ohne Kategorie da. Das gehoert gesagt — es sieht sonst
            // aus, als waere Geld verschwunden.
            folgen: t("einstellungen.kategorieLoeschenFolgen"),
            ausfuehren: async () => { await kategorieLoeschen(k.id); onChange(); },
          })} />
        </span>
      </div>
    );
  }

  /** Die Zeile und ihre Nachfahren — als flache Folge, die Tiefe steckt in der Einrückung. */
  function zweig(k: Kategorie, ebene: number): ReactNode[] {
    return [zeile(k, ebene), ...kinderVon(k.id).flatMap((c) => zweig(c, ebene + 1))];
  }

  return (
    <Card
      action={
        <span style={{ display: "flex", gap: "var(--sp-2)" }}>
          <Button onClick={() => standardkategorienAnlegen().then(onChange)}>{t("einstellungen.kategorie.standardLaden")}</Button>
          <Button variant="primary" plus onClick={neu}>{t("einstellungen.kategorie.anlegen")}</Button>
        </span>
      }
    >
      {kategorien.length === 0 ? (
        <div className="muted">{t("einstellungen.kategorie.leer")}</div>
      ) : (
        <div>
          {wurzeln.map((w) => (
            <div key={w.id} className="katgroup">
              {zweig(w, 0)}
            </div>
          ))}
        </div>
      )}
      {offen && (
        <Modal
          title={editId ? t("einstellungen.kategorie.modalBearbeiten") : t("einstellungen.kategorie.modalAnlegen")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><Button variant="link" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("einstellungen.kategorie.feldName")} required>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("einstellungen.kategorie.feldNamePlaceholder")} />
            </FormField>
            <FormField label={t("einstellungen.kategorie.feldEltern")} hint={t("einstellungen.kategorie.feldElternHinweis")}>
              <Auswahl
                ariaLabel={t("einstellungen.kategorie.feldEltern")}
                wert={elternId}
                aufAenderung={setElternId}
                optionen={[
                  { wert: "", text: t("einstellungen.kategorie.wurzel") },
                  ...kategorien.filter((k) => k.id !== editId).map((k) => ({ wert: k.id, text: k.name })),
                ]}
              />
            </FormField>
            <FormField label={t("einstellungen.kategorie.feldCharakter")}>
              <Auswahl
                ariaLabel={t("einstellungen.kategorie.feldCharakter")}
                wert={defaultCharakter}
                aufAenderung={(v) => setDefaultCharakter(v as Charakter)}
                optionen={CHARAKTERE.map((c) => ({ wert: c, text: t(`charakter.${c}`) }))}
              />
            </FormField>
          </div>
        </Modal>
      )}
      {loeschfrage.dialog}
    </Card>
  );
}
