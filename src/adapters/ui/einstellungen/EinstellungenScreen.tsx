// Einstellungen — Sprache & Währung, Personen, Kategorien. Anlegen UND
// Bearbeiten je im Modal (gleiche Maske, vorbefüllt). Reload-fest über die SQLite-Repos.
//
// Zwei Bereiche sind hier ausgezogen: die Kategorie-Erkennung nach „Training" und die
// Konten nach „Konten". Beides ist keine Einstellung, sondern eigene Arbeit — ein Konto
// hat einen Stand, eine Bankverbindung und bald einen Abruf auf Knopfdruck.

import { Datumsfeld } from "../bausteine/Datumsfeld";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
                inhalt: () => <ExportCard />,
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
      </div>
    </Card>
  );
}

/**
 * Eine Zeile mit einem Schalter: Kaestchen, fetter Titel, der aktuelle Stand und eine
 * Erklaerung darunter.
 *
 * Hiess bis 2026-08-25 `ExperimentZeile` — nach ihrem ersten Anwendungsfall, nicht nach
 * dem, was sie ist. Beim zweiten (der Aktualisierungspruefung, die kein Experiment ist)
 * haette der Name gegen die Sache gestanden, und der naechste haette entweder einen
 * falschen Namen benutzt oder die Zeile ein zweites Mal gebaut.
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
  return (
    <label style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={an}
        // Die Beschriftung steht daneben, nicht im Feld — ohne den Namen meldet eine
        // Vorlesehilfe nur "Kontrollkaestchen", und mit dem zweiten Experiment waeren
        // beide nicht mehr auseinanderzuhalten.
        aria-label={titel}
        onChange={(e) => aufSchalten(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ fontWeight: "var(--fw-bold)" }}>{titel}</span>
        {" · "}
        <span className="muted">
          {an ? t("einstellungen.experiment.an") : t("einstellungen.experiment.aus")}
        </span>
        <br />
        <span className="muted">{text}</span>
      </span>
    </label>
  );
}

/**
 * Ob die App beim Start nach einer neueren Fassung sucht.
 *
 * Der Schalter war seit dem Update-Weg gebaut und geprueft (`pruefungSchalten`), hatte
 * aber keine Oberflaeche — abschalten ging nur ueber die Einstellungstabelle. Eine
 * Faehigkeit, die niemand erreicht, ist keine.
 *
 * Er steht in einem EIGENEN Register und nicht bei den Experimenten: die Pruefung ist
 * keins, sie ist an, und sie ist der einzige Netzzugriff, den die App von sich aus macht
 * (siehe `application/aktualisierung.ts`). Genau das ist der Grund, warum sie abschaltbar
 * sein muss — und der gehoert danebengeschrieben, nicht in eine Fussnote.
 */
function AktualisierungCard() {
  const { t } = useTranslation();
  const [an, setAn] = useState<boolean | null>(null);

  useEffect(() => {
    void aktualisierungspruefung().then(setAn);
  }, []);

  async function schalten(neu: boolean) {
    // Erst schreiben, dann anzeigen: bliebe das Kaestchen bei einem Fehler umgelegt
    // stehen, zeigte es einen Zustand, den die Datenbank nicht hat.
    await aktualisierungspruefungSetzen(neu);
    setAn(neu);
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
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
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
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
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
