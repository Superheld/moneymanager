// Stammdaten (P1) — Personen · Konten · Kategorien als Übersichtslisten; Anlegen UND
// Bearbeiten je im Modal (gleiche Maske, vorbefüllt). Reload-fest über die SQLite-Repos.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  KONTOTYPEN,
  istSummeKonto,
  minorZuMajor,
  realerKontostand,
  REGIONEN,
  STOPPWOERTER,
  waehrungNachCode,
  waehrungssymbol,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type Kontotyp,
  type Bewertung,
  type Person,
  type Verwurfsgrund,
  type Zahlungskonto,
} from "../../core";
import { trainingsmaterial, type Ausschlussgrund, type Materialbefund } from "../../application/trainingsmaterial";
import { klassifikatorTrainieren, modellzustand, type Modellzustand } from "../../application/klassifikatorTraining";
import { kategorieAnlegen, kontoAnlegen, personAnlegen } from "../../application/stammdatenAnlegen";
import { standardkategorienAnlegen } from "../../application/standardkategorien";
import { sqlitePersonRepository as personRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteKlassifikatorRepository as klassifikatorRepo } from "../persistence/sqliteKlassifikatorRepository";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht, useRegionUmschalter } from "./einstellungenKontext";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };

export function EinstellungenScreen() {
  const { t } = useTranslation();
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
      <PageHead title={t("einstellungen.titel")} subtitle={t("einstellungen.untertitel")} />
      <RegionCard />
      <PersonenCard personen={personen} onChange={laden} />
      <KontenCard konten={konten} personen={personen} personName={personName} ist={ist} onChange={laden} />
      <KategorienCard kategorien={kategorien} onChange={laden} />
      <LernmaterialCard kategorien={kategorien} />
    </div>
  );
}

/**
 * Woraus die automatische Kategorisierung lernt — und was dabei aussortiert wird.
 *
 * Die Karte steht bewusst VOR dem ersten Modell: ein Klassifikator, der auf Zeilen
 * trainiert, von denen ein Teil gar keine Kategorie trägt oder deren Text nur aus
 * Referenznummern besteht, lernt stillschweigend etwas anderes, als man annimmt. Wer das
 * hier sieht, kann die Extraktion beurteilen, bevor Zahlen aus einem Modell fallen, die
 * niemand mehr auf ihre Grundlage zurückführt.
 */
function LernmaterialCard({ kategorien }: { kategorien: Kategorie[] }) {
  const { t } = useTranslation();
  const { locale } = useGeld();
  const [befund, setBefund] = useState<Materialbefund | null>(null);
  const [zustand, setZustand] = useState<Modellzustand | null>(null);
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const trainingsDeps = { ledger: ledgerRepo, umsatzRepo, klassifikatorRepo };

  // Material und Modellzustand zusammen laden und zusammen setzen: gestaffelte
  // setState-Aufrufe ließen die Karte kurz gegen einen leeren Befund rechnen.
  async function laden() {
    const [m, z] = await Promise.all([
      trainingsmaterial(ledgerRepo, umsatzRepo),
      modellzustand(trainingsDeps),
    ]);
    setBefund(m);
    setZustand(z);
  }
  useEffect(() => {
    laden().catch(() => setBefund(null));
  }, []);

  async function trainingStarten() {
    // Der Knopf kennt kein `disabled` — den Doppelklick fängt der Ablauf selbst ab.
    if (laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await klassifikatorTrainieren({ ...trainingsDeps, jetzt: () => new Date().toISOString() });
      setBewertung(r.bewertung ?? null);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(false);
    }
  }

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const zahl = (n: number) => n.toLocaleString(locale);
  const prozent = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 1 })} %`;

  if (!befund) return null;

  const { vokabular: v } = befund;
  const ausgeschlossen = (Object.entries(befund.ausgeschlossen) as [Ausschlussgrund, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const verwurf = (Object.entries(v.verworfen) as [Verwurfsgrund, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const stand = zustand?.stand ?? null;
  const schwach = (bewertung?.jeKategorie ?? [])
    .filter((k) => k.richtig < k.gesamt)
    .slice(0, 10)
    .map((k) => ({ ...k }));

  return (
    <Card
      title={t("einstellungen.lernmaterial.titel")}
      subtitle={t("einstellungen.lernmaterial.untertitel")}
      action={
        befund.beispiele.length > 0 ? (
          <Button variant="primary" onClick={trainingStarten}>
            {laeuft ? t("einstellungen.lernmaterial.trainiertGerade") : t("einstellungen.lernmaterial.trainieren")}
          </Button>
        ) : undefined
      }
    >
      {befund.gesamt === 0 ? (
        <div className="muted">{t("einstellungen.lernmaterial.leer")}</div>
      ) : (
        <>
          {fehler && <div className="err" style={{ marginBottom: "var(--sp-4)" }}>{fehler}</div>}

          <Abschnitt titel={t("einstellungen.lernmaterial.modellTitel")}>
            {!stand ? (
              <div className="muted">{t("einstellungen.lernmaterial.nieTrainiert")}</div>
            ) : (
              <>
                <KPIStat
                  size="tile"
                  label={t("einstellungen.lernmaterial.genauigkeit")}
                  value={
                    stand.genauigkeit === undefined
                      ? t("einstellungen.lernmaterial.genauigkeitUnbekannt")
                      : prozent(stand.genauigkeit)
                  }
                  meta={
                    stand.genauigkeit === undefined
                      ? t("einstellungen.lernmaterial.genauigkeitUnbekanntMeta")
                      : bewertung
                        ? t("einstellungen.lernmaterial.genauigkeitMeta", { gesamt: zahl(bewertung.gesamt) })
                        : undefined
                  }
                  tone={stand.genauigkeit !== undefined && stand.genauigkeit >= 0.85 ? "ok" : "default"}
                />
                <div className="muted" style={{ marginTop: "var(--sp-3)" }}>
                  {t("einstellungen.lernmaterial.trainiertAm", {
                    datum: new Date(stand.trainiertAm).toLocaleString(locale),
                    beispiele: zahl(stand.modell.beispiele),
                  })}
                  {zustand!.zuwachs !== 0 && (
                    <>
                      {" "}
                      {zustandsText(t, zustand!.zuwachs, zahl)}
                      {zustand!.veraltet && ` ${t("einstellungen.lernmaterial.veraltet")}`}
                    </>
                  )}
                </div>
              </>
            )}
          </Abschnitt>

          {/* Nur Kategorien, die tatsächlich Fehler hatten. Ohne den Filter stünden
              unter „wo die Erkennung sich schwertut" zehn fehlerfreie Kategorien —
              die Überschrift behauptete dann etwas, was die Zahlen widerlegen. */}
          {schwach.length > 0 && (
            <Abschnitt titel={t("einstellungen.lernmaterial.schwachTitel")}>
              <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                {t("einstellungen.lernmaterial.schwachHinweis")}
              </div>
              <DataTable
                columns={[
                  {
                    key: "kategorieId",
                    label: t("einstellungen.lernmaterial.spalteKategorie"),
                    render: (r) => kategorieName.get(r.kategorieId) ?? r.kategorieId,
                  },
                  {
                    key: "quote",
                    label: t("einstellungen.lernmaterial.spalteTrefferquote"),
                    align: "right",
                    render: (r) => prozent(r.richtig / r.gesamt),
                  },
                  {
                    key: "gesamt",
                    label: t("einstellungen.lernmaterial.spaltePruefungen"),
                    align: "right",
                    render: (r) => zahl(r.gesamt),
                  },
                ]}
                rows={schwach}
              />
            </Abschnitt>
          )}

          <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap", margin: "var(--sp-5) 0" }}>
            <KPIStat
              size="tile"
              label={t("einstellungen.lernmaterial.brauchbar")}
              value={zahl(befund.beispiele.length)}
              meta={t("einstellungen.lernmaterial.brauchbarMeta", { gesamt: zahl(befund.gesamt) })}
            />
            <KPIStat
              size="tile"
              label={t("einstellungen.lernmaterial.kategorien")}
              value={zahl(befund.kategorien)}
              meta={t("einstellungen.lernmaterial.kategorienMeta", { duenn: befund.duenneKategorien.length })}
              tone={befund.duenneKategorien.length > 0 ? "warn" : "default"}
            />
            <KPIStat
              size="tile"
              label={t("einstellungen.lernmaterial.vokabular")}
              value={zahl(v.groesse)}
              meta={t("einstellungen.lernmaterial.vokabularMeta", { einmalige: zahl(v.einmalige) })}
            />
          </div>

          {befund.beispiele.length === 0 && (
            <div className="muted" style={{ marginBottom: "var(--sp-5)" }}>
              {t("einstellungen.lernmaterial.keineBeispiele")}
            </div>
          )}

          {ausgeschlossen.length > 0 && (
            <Abschnitt titel={t("einstellungen.lernmaterial.ausgeschlossenTitel")}>
              {ausgeschlossen.map(([grund, n]) => (
                <div key={grund} style={ZEILE}>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "4ch", textAlign: "right" }}>{zahl(n)}</span>
                  <span className="muted">{t(`einstellungen.lernmaterial.grund.${grund}`)}</span>
                </div>
              ))}
            </Abschnitt>
          )}

          {/* Eigener Abschnitt, NICHT beim Ausschluss: dünne Kategorien haben mit
              aussortierten Zeilen nichts zu tun. Zusammengelegt verschwand die Warnung
              ausgerechnet dann, wenn alle Buchungen brauchbar sind — also bei sauberen
              Daten, wo sie genauso gilt. */}
          {befund.duenneKategorien.length > 0 && (
            <Abschnitt titel={t("einstellungen.lernmaterial.duenneTitel")}>
              <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                {t("einstellungen.lernmaterial.duenneHinweis")}
              </div>
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                {befund.duenneKategorien.map((d) => (
                  <Pill key={d.kategorieId} variant="warn">
                    {kategorieName.get(d.kategorieId) ?? d.kategorieId} · {d.anzahl}
                  </Pill>
                ))}
              </div>
            </Abschnitt>
          )}

          <Abschnitt titel={t("einstellungen.lernmaterial.namensraumTitel")}>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              {Object.entries(v.jeNamensraum)
                .sort((a, b) => b[1] - a[1])
                .map(([raum, n]) => (
                  <Pill key={raum}>
                    {t(`einstellungen.lernmaterial.namensraum.${raum}`, { defaultValue: raum })} · {zahl(n)}
                  </Pill>
                ))}
            </div>
          </Abschnitt>

          {v.haeufigste.length > 0 && (
            <Abschnitt titel={t("einstellungen.lernmaterial.merkmaleTitel")}>
              <DataTable
                columns={[
                  { key: "merkmal", label: t("einstellungen.lernmaterial.spalteMerkmal") },
                  { key: "anzahl", label: t("einstellungen.lernmaterial.spalteAnzahl"), align: "right", render: (r) => zahl(r.anzahl) },
                ]}
                rows={[...v.haeufigste]}
              />
            </Abschnitt>
          )}

          <Abschnitt titel={t("einstellungen.lernmaterial.verworfenTitel")}>
            <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
              {t("einstellungen.lernmaterial.verworfenHinweis")}
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
              {verwurf.map(([grund, n]) => (
                <Pill key={grund}>
                  {t(`einstellungen.lernmaterial.verwurf.${grund}`)} · {zahl(n)}
                </Pill>
              ))}
            </div>
            {v.haeufigsteVerworfen.length > 0 && (
              <DataTable
                columns={[
                  { key: "wort", label: t("einstellungen.lernmaterial.spalteWort") },
                  { key: "grund", label: t("einstellungen.lernmaterial.spalteGrund"), render: (r) => t(`einstellungen.lernmaterial.verwurf.${r.grund}`) },
                  { key: "anzahl", label: t("einstellungen.lernmaterial.spalteAnzahl"), align: "right", render: (r) => zahl(r.anzahl) },
                ]}
                rows={[...v.haeufigsteVerworfen]}
              />
            )}
            <details style={{ marginTop: "var(--sp-4)" }}>
              <summary className="muted" style={{ cursor: "pointer" }}>
                {t("einstellungen.lernmaterial.stoppwoerterTitel", { anzahl: STOPPWOERTER.size })}
              </summary>
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
                {[...STOPPWOERTER].sort().map((w) => (
                  <Pill key={w}>{w}</Pill>
                ))}
              </div>
            </details>
          </Abschnitt>
        </>
      )}
    </Card>
  );
}

const ZEILE: CSSProperties = { display: "flex", gap: "var(--sp-3)", alignItems: "baseline" };

/**
 * „Seitdem sind n Beispiele dazugekommen/weggefallen." Singular und Plural als eigene
 * Schlüssel statt über die Plural-Mechanik von i18next: die legt den Basis-Schlüssel
 * nicht an, und der Vollständigkeits-Test über alle verwendeten Schlüssel würde ihn
 * dauerhaft als fehlend melden.
 */
function zustandsText(
  t: (key: string, options?: Record<string, unknown>) => string,
  zuwachs: number,
  zahl: (n: number) => string,
): string {
  const n = Math.abs(zuwachs);
  const stamm = `einstellungen.lernmaterial.${zuwachs > 0 ? "zuwachs" : "schwund"}`;
  return n === 1 ? t(`${stamm}Eins`) : t(`${stamm}Viele`, { anzahl: zahl(n) });
}

/** Überschrift plus Inhalt — hält die Lernmaterial-Karte ohne eigene CSS-Klassen lesbar. */
function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: "var(--sp-5)" }}>
      <div style={{ fontWeight: "var(--fw-bold)", marginBottom: "var(--sp-2)" }}>{titel}</div>
      {children}
    </div>
  );
}

/** Sprache & Währung des Haushalts (ADR-0004) — eine Region bestimmt alles drei. */
function RegionCard() {
  const { t } = useTranslation();
  const { aktuelleLocale, regionSetzen } = useRegionUmschalter();
  return (
    <Card title={t("einstellungen.region.titel")} subtitle={t("einstellungen.region.untertitel")}>
      <FormField label={t("einstellungen.region.feld")} hint={t("einstellungen.region.hinweis")}>
        <select className="field" value={aktuelleLocale} onChange={(e) => regionSetzen(e.target.value)}>
          {REGIONEN.map((r) => (
            <option key={r.locale} value={r.locale}>
              {r.label} · {waehrungssymbol(waehrungNachCode(r.waehrungCode), r.locale)}
            </option>
          ))}
        </select>
      </FormField>
    </Card>
  );
}

function PersonenCard({ personen, onChange }: { personen: Person[]; onChange: () => void }) {
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
      await personAnlegen(personRepo, { name, rolle, geburtsdatum }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Card title={t("einstellungen.person.titel")} subtitle={t("einstellungen.person.untertitel")} action={<Button plus onClick={neu}>{t("einstellungen.person.anlegen")}</Button>}>
      {personen.length === 0 ? (
        <div className="muted">{t("einstellungen.person.leer")}</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: t("einstellungen.person.spalteName") },
            { key: "rolle", label: t("einstellungen.person.spalteRolle"), render: (p) => p.rolle ?? "—" },
            { key: "geburtsdatum", label: t("einstellungen.person.spalteGeburtsdatum"), render: (p) => p.geburtsdatum ?? "—" },
            { key: "_e", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => bearbeiten(p)}>{t("einstellungen.bearbeiten")}</button> },
            { key: "_x", label: "", align: "right", render: (p) => <button className="linkbtn" onClick={() => personRepo.loeschen(p.id).then(onChange)}>{t("einstellungen.loeschen")}</button> },
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
            <input className="field" type="date" value={geburtsdatum} onChange={(e) => setGeburtsdatum(e.target.value)} />
          </FormField>
        </Modal>
      )}
    </Card>
  );
}

function KontenCard({ konten, personen, personName, ist, onChange }: { konten: Zahlungskonto[]; personen: Person[]; personName: Map<string, string>; ist: IstBuchung[]; onChange: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const hatIst = ist.some((b) => b.planRef || b.quelle === "import");
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [saldoText, setSaldoText] = useState("");
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
    setSaldoText("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(k: Zahlungskonto) {
    setEditId(k.id);
    setBezeichnung(k.bezeichnung);
    setTyp(k.typ);
    setIban(k.iban ?? "");
    setInhaberIds([...k.inhaberIds]);
    setSaldoText(String(minorZuMajor(k.saldo, geld.waehrung)));
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await kontoAnlegen(kontoRepo, { bezeichnung, typ, iban, inhaberIds, saldo: geld.parse(saldoText) ?? 0 }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Card title={t("einstellungen.konto.titel")} subtitle={hatIst ? t("einstellungen.konto.untertitelIst") : t("einstellungen.konto.untertitel")} action={<Button plus onClick={neu}>{t("einstellungen.konto.anlegen")}</Button>}>
      {konten.length === 0 ? (
        <div className="muted">{t("einstellungen.konto.leer")}</div>
      ) : (
        <DataTable
          columns={[
            { key: "bezeichnung", label: t("einstellungen.konto.spalteBezeichnung") },
            { key: "typ", label: t("einstellungen.konto.spalteTyp"), render: (k) => t(`einstellungen.konto.typ.${k.typ}`) },
            { key: "iban", label: t("einstellungen.konto.spalteIban"), render: (k) => k.iban ?? "—" },
            { key: "inhaber", label: t("einstellungen.konto.spalteInhaber"), render: (k) => (k.inhaberIds.length ? k.inhaberIds.map((id: string) => personName.get(id) ?? "?").join(", ") : "—") },
            { key: "saldo", label: `${hatIst ? t("einstellungen.konto.spalteAnfangsbestand") : t("einstellungen.konto.spalteKontostand")} ${geld.symbol}`, align: "right", render: (k) => geld.format(k.saldo) },
            ...(hatIst
              ? [
                  { key: "ist", label: `${t("einstellungen.konto.spalteIst")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => (istSummeKonto(ist, k.id) ? geld.format(istSummeKonto(ist, k.id), { mitVorzeichen: true }) : "—") },
                  { key: "real", label: `${t("einstellungen.konto.spalteRealerStand")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(realerKontostand(k, ist))}</span> },
                ]
              : []),
            { key: "_e", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => bearbeiten(k)}>{t("einstellungen.bearbeiten")}</button> },
            { key: "_x", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => kontoRepo.loeschen(k.id).then(onChange)}>{t("einstellungen.loeschen")}</button> },
          ]}
          rows={konten}
        />
      )}
      {offen && (
        <Modal
          title={editId ? t("einstellungen.konto.modalBearbeiten") : t("einstellungen.konto.modalAnlegen")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("einstellungen.konto.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("einstellungen.konto.feldBezeichnungPlaceholder")} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldTyp")}>
              <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as Kontotyp)}>
                {KONTOTYPEN.map((kt) => (<option key={kt} value={kt}>{t(`einstellungen.konto.typ.${kt}`)}</option>))}
              </select>
            </FormField>
            <FormField label={t("einstellungen.konto.feldIban")} hint={t("einstellungen.konto.feldIbanHinweis")}>
              <input className="field" value={iban} onChange={(e) => setIban(e.target.value)} placeholder={t("einstellungen.konto.ibanPlatzhalter")} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldKontostand")} hint={t("einstellungen.konto.feldKontostandHinweis")}>
              <input className="field" inputMode="decimal" value={saldoText} onChange={(e) => setSaldoText(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldInhaber")}>
              {personen.length === 0 ? (
                <span className="muted">{t("einstellungen.konto.feldInhaberLeer")}</span>
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
      await kategorieAnlegen(kategorieRepo, { name, elternId: elternId || undefined, defaultCharakter }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  function zeile(k: Kategorie, haupt: boolean) {
    return (
      <div key={k.id} className={`katrow ${haupt ? "katmain" : "katchild"}`}>
        <span className="nm">
          {k.name} <Pill variant={CHARAKTER_PILL[k.defaultCharakter]}>{t(`charakter.${k.defaultCharakter}`)}</Pill>
        </span>
        <span style={{ display: "flex", gap: "var(--sp-3)" }}>
          <button className="linkbtn" onClick={() => bearbeiten(k)}>{t("einstellungen.bearbeiten")}</button>
          <button className="linkbtn" onClick={() => kategorieRepo.loeschen(k.id).then(onChange)}>{t("einstellungen.loeschen")}</button>
        </span>
      </div>
    );
  }

  return (
    <Card
      title={t("einstellungen.kategorie.titel")}
      subtitle={t("einstellungen.kategorie.untertitel")}
      action={
        <span style={{ display: "flex", gap: "var(--sp-2)" }}>
          <Button onClick={() => standardkategorienAnlegen(kategorieRepo).then(onChange)}>{t("einstellungen.kategorie.standardLaden")}</Button>
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
              {zeile(w, true)}
              {kinderVon(w.id).map((c) => zeile(c, false))}
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
              <select className="field" value={elternId} onChange={(e) => setElternId(e.target.value)}>
                <option value="">{t("einstellungen.kategorie.wurzel")}</option>
                {kategorien.filter((k) => k.id !== editId).map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
              </select>
            </FormField>
            <FormField label={t("einstellungen.kategorie.feldCharakter")}>
              <select className="field" value={defaultCharakter} onChange={(e) => setDefaultCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (<option key={c} value={c}>{t(`charakter.${c}`)}</option>))}
              </select>
            </FormField>
          </div>
        </Modal>
      )}
    </Card>
  );
}
