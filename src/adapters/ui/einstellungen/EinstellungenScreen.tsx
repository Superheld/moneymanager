// Einstellungen — Sprache & Währung, Personen, Kategorien. Anlegen UND
// Bearbeiten je im Modal (gleiche Maske, vorbefüllt). Reload-fest über die SQLite-Repos.
//
// Zwei Bereiche sind hier ausgezogen: die Kategorie-Erkennung nach „Training" und die
// Konten nach „Konten". Beides ist keine Einstellung, sondern eigene Arbeit — ein Konto
// hat einen Stand, eine Bankverbindung und bald einen Abruf auf Knopfdruck.

import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Switch } from "@base-ui/react/switch";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  REGIONEN,
  waehrungNachCode,
  waehrungssymbol,
  type Charakter,
  type Kategorie,
  type Person,
} from "../../../application";
import {
  aktualisierungBeta,
  aktualisierungBetaSetzen,
  aktualisierungspruefung,
  aktualisierungspruefungSetzen,
  kategorieAnlegen,
  kategorieLoeschen,
  personAnlegen,
  personLoeschen,
  stammdaten,
  standardkategorienAnlegen,
} from "../../dienste";
import { Button, Card, DataTable, FormField, Pill } from "../bausteine";
import { IconButton } from "../bausteine/IconButton";
import { Auswahl } from "../bausteine/Auswahl";
import { Bereich } from "../bausteine/Bereich";
import { VerschluesselungCard } from "../zugang/VerschluesselungCard";
import { ExportCard } from "./ExportCard";
import { BestandsexportCard } from "./BestandsexportCard";
import { KonfigurationImportCard } from "./KonfigurationImportCard";
import { Modal } from "../bausteine/Modal";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import {
  fehlerNachricht,
  useExperimentSchalter,
  useRegionUmschalter,
} from "../bausteine/einstellungenKontext";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };

export function EinstellungenScreen({ onSperren }: { onSperren?: () => void }) {
  const { t } = useTranslation();
  // Nur zum Lesen: das Export-Register gibt es erst, wenn das Experiment an ist. Der
  // Hook liest aus dem Kontext, kostet also nichts, obwohl ihn die Experimente-Karte
  // weiter unten ebenfalls zieht.
  const { experimente } = useExperimentSchalter();
  const [personen, setPersonen] = useState<Person[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  async function laden() {
    const d = await stammdaten();
    setPersonen([...d.personen]);
    setKategorien([...d.kategorien]);
  }
  useEffect(() => {
    laden();
  }, []);

  return (
    <Bereich
      titel={t("einstellungen.titel")}
      register={[
        {
          id: "region",
          label: t("einstellungen.region.titel"),
          untertitel: t("einstellungen.region.untertitel"),
          inhalt: () => <RegionCard />,
        },
        {
          id: "personen",
          label: t("einstellungen.person.titel"),
          untertitel: t("einstellungen.person.untertitel"),
          inhalt: () => <PersonenCard personen={personen} onChange={laden} />,
        },
        {
          id: "kategorien",
          label: t("einstellungen.kategorie.titel"),
          untertitel: t("einstellungen.kategorie.untertitel"),
          inhalt: () => <KategorienCard kategorien={kategorien} onChange={laden} />,
        },
        {
          id: "aktualisierung",
          label: t("einstellungen.aktualisierung.titel"),
          untertitel: t("einstellungen.aktualisierung.untertitel"),
          inhalt: () => <AktualisierungCard />,
        },
        {
          id: "verschluesselung",
          label: t("zugang.kartenTitel"),
          untertitel: t("zugang.kartenText"),
          inhalt: () => <VerschluesselungCard onSperren={onSperren} />,
        },
        {
          id: "experimente",
          label: t("einstellungen.experiment.titel"),
          untertitel: t("einstellungen.experiment.untertitel"),
          inhalt: () => <ExperimenteCard />,
        },
        // Das Register erscheint erst, wenn das Experiment an ist — ein Reiter, der
        // seinen Inhalt nur mit einem Hinweis „erst einschalten" fuellt, ist ein
        // leeres Versprechen. Der Schalter darueber ist der Weg dorthin.
        ...(experimente.export
          ? [
              {
                id: "export",
                label: t("einstellungen.export.titel"),
                untertitel: t("einstellungen.export.untertitel"),
                inhalt: () => (
                  <>
                    <ExportCard />
                    <BestandsexportCard />
                    {/* Der Import steht UNTER den Exporten und nicht in einem eigenen
                        Register: es ist dieselbe Datei, einmal hinaus und einmal herein.
                        Wer den Reiter „Export" offen hat, hat die Frage schon gestellt. */}
                    <KonfigurationImportCard />
                  </>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/** Sprache & Währung des Haushalts (ADR-0004) — eine Region bestimmt alles drei. */
function RegionCard() {
  const { t } = useTranslation();
  const { aktuelleLocale, regionSetzen } = useRegionUmschalter();
  return (
    <Card>
      <FormField label={t("einstellungen.region.feld")} hint={t("einstellungen.region.hinweis")}>
        <Auswahl
          ariaLabel={t("einstellungen.region.feld")}
          wert={aktuelleLocale}
          aufAenderung={regionSetzen}
          optionen={REGIONEN.map((r) => ({
            wert: r.locale,
            text: `${r.label} · ${waehrungssymbol(waehrungNachCode(r.waehrungCode), r.locale)}`,
          }))}
        />
      </FormField>
    </Card>
  );
}

/**
 * Experimentelle Funktionen — aus, bis jemand sie einschaltet.
 *
 * Der Hinweistext steht ueber den Schaltern und nicht an jedem einzelnen: er gilt fuer
 * alle, und wiederholt an jeder Zeile liest ihn niemand mehr. Was NUR fuer ein Experiment
 * gilt, steht an seiner Zeile.
 */
function ExperimenteCard() {
  const { t } = useTranslation();
  const { experimente, experimentSetzen } = useExperimentSchalter();
  return (
    <Card>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("einstellungen.experiment.hinweis")}
      </p>
      <div style={{ display: "grid", gap: "var(--sp-3)" }}>
        <SchalterZeile
          titel={t("einstellungen.experiment.hanseaticTitel")}
          text={t("einstellungen.experiment.hanseaticText")}
          an={experimente.hanseatic}
          aufSchalten={(an) => experimentSetzen("hanseatic", an)}
        />
        <SchalterZeile
          titel={t("einstellungen.experiment.exportTitel")}
          text={t("einstellungen.experiment.exportText")}
          an={experimente.export}
          aufSchalten={(an) => experimentSetzen("export", an)}
        />
        <SchalterZeile
          titel={t("einstellungen.experiment.trainingTitel")}
          text={t("einstellungen.experiment.trainingText")}
          an={experimente.training}
          aufSchalten={(an) => experimentSetzen("training", an)}
        />
      </div>
    </Card>
  );
}

/**
 * Eine Zeile mit einem Schalter: der Schalter, fetter Titel, der aktuelle Stand und eine
 * Erklaerung darunter.
 *
 * Hiess bis 2026-08-25 `ExperimentZeile` — nach ihrem ersten Anwendungsfall, nicht nach
 * dem, was sie ist. Beim zweiten (der Aktualisierungspruefung, die kein Experiment ist)
 * haette der Name gegen die Sache gestanden, und der naechste haette entweder einen
 * falschen Namen benutzt oder die Zeile ein zweites Mal gebaut.
 *
 * **Base UI `Switch`, kein Kaestchen** (seit 2026-11-10). Ein Kaestchen sagt „angekreuzt",
 * ein Schalter „an/aus" — und die Zeile sagt selbst „an" und „aus". Eine Vorlesehilfe
 * meldet jetzt „Schalter, ein" statt „Kontrollkaestchen, aktiviert".
 *
 * Name und Beschreibung sind getrennt verbunden: der NAME ist der Titel allein
 * (`aria-labelledby` auf ein unsichtbares Element — das umschliessende `<label>` wuerde
 * sonst den ganzen Absatz zum Namen machen, siehe `Kaestchen`), die Erklaerung ist die
 * Beschreibung. Das `<label>` bleibt, damit ein Klick auf den Text schaltet.
 */
function SchalterZeile({
  titel,
  text,
  an,
  aufSchalten,
}: {
  titel: string;
  text: string;
  an: boolean;
  aufSchalten: (an: boolean) => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const textId = useId();
  return (
    <label className="schalterzeile">
      <Switch.Root
        className="schalter"
        checked={an}
        onCheckedChange={(neu) => aufSchalten(neu)}
        aria-labelledby={nameId}
        aria-describedby={textId}
      >
        <Switch.Thumb className="schalter-knopf" />
      </Switch.Root>
      <span id={nameId} hidden>
        {titel}
      </span>
      <span>
        <span style={{ fontWeight: "var(--fw-bold)" }}>{titel}</span>
        {" · "}
        <span className="muted">
          {an ? t("einstellungen.experiment.an") : t("einstellungen.experiment.aus")}
        </span>
        <br />
        <span className="muted" id={textId}>
          {text}
        </span>
      </span>
    </label>
  );
}

function AktualisierungCard() {
  const { t } = useTranslation();
  const [an, setAn] = useState<boolean | null>(null);
  const [beta, setBeta] = useState<boolean | null>(null);

  useEffect(() => {
    void aktualisierungspruefung().then(setAn);
    void aktualisierungBeta().then(setBeta);
  }, []);

  async function schalten(neu: boolean) {
    // Erst schreiben, dann anzeigen: bliebe der Schalter bei einem Fehler umgelegt
    // stehen, zeigte es einen Zustand, den die Datenbank nicht hat.
    await aktualisierungspruefungSetzen(neu);
    setAn(neu);
  }

  async function betaWechseln(neu: boolean) {
    await aktualisierungBetaSetzen(neu);
    setBeta(neu);
  }

  return (
    <Card>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("einstellungen.aktualisierung.hinweis")}
      </p>
      {an != null && (
        <SchalterZeile
          titel={t("einstellungen.aktualisierung.schalterTitel")}
          text={t("einstellungen.aktualisierung.schalterText")}
          an={an}
          aufSchalten={(neu) => void schalten(neu)}
        />
      )}
      {beta != null && (
        <SchalterZeile
          titel={t("einstellungen.aktualisierung.betaTitel")}
          text={t("einstellungen.aktualisierung.betaText")}
          an={beta}
          aufSchalten={(neu) => void betaWechseln(neu)}
        />
      )}
    </Card>
  );
}

function PersonenCard({ personen, onChange }: { personen: Person[]; onChange: () => void }) {
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

function KategorienCard({ kategorien, onChange }: { kategorien: Kategorie[]; onChange: () => void }) {
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
