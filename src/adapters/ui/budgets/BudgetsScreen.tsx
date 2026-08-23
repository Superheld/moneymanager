// Budgets — EIN Bereich, EINE Liste, zwei Arten.
//
// Vorher standen hier zwei Abschnitte („Jeden Monat neu" / „Baut sich auf") über zwei
// Aggregaten (Budget und Topf) mit drei Arten und vier Zielwert-Begriffen. Jetzt trägt
// ein Budget nur noch seine Art, und die beiden Arten dürfen ineinander liegen: eine
// Hauptkategorie monatlich, eine Unterkategorie darin aufbauend. Was das Kind
// beansprucht, rechnet der Kern automatisch aus dem Dach heraus (core/budget) — die
// Liste zeigt die Verschachtelung deshalb als Einrückung, damit die Zahlen erklärbar
// bleiben.
//
// Die Kennzahlen stehen als eigene Reihe ÜBER den Karten, nicht darin — wie auf der
// Übersicht. In der Karte konkurrierten sie mit der Tabelle um dieselbe Fläche.
//
// **Die Zahlen der Liste gelten für den laufenden MONAT, auch beim Aufbauenden.** Vorher
// standen dort Rahmen und Verbrauch kumuliert („seit Start"), und dieselbe Zeile trug
// damit zwei Zeitbegriffe nebeneinander: eine Spalte über Jahre, die daneben über den
// Monat. Der Rest ändert sich dadurch nicht — `verfügbar − verbraucht` ist in beiden
// Lesarten derselbe Betrag (Herleitung in `core/budgets/budgetverlauf`). Was sich ändert,
// ist, dass die Zahlen daneben etwas über DIESEN Monat sagen.
//
// PILOT für ADR-0004: alle sichtbaren Strings über t()/<Trans>, alles Geld über useGeld().

import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  minorZuMajor,
  type Budgetart,
  type Budgetbereich,
  type Budgetstand,
  type Budgetvorschlag,
} from "../../../application";
import {
  budgetAnlegen as budgetSpeichern,
  budgetbereich,
  budgetBetragLoeschen,
  budgetLoeschen,
  vorschlagIgnorieren,
} from "../../dienste";
import { Button, Card, CoverageTrack, DataTable, FormField, KPIStat, Pill } from "../bausteine";
import { BudgetVerlauf } from "./BudgetVerlauf";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { betont } from "../bausteine/betonung";
import { PageHead } from "../bausteine/PageHead";
import { Modal } from "../bausteine/Modal";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";

const ARTEN: Budgetart[] = ["monatlich", "aufbauend"];

/** Stabile leere Karte — eine frisch erzeugte Map liesse jedes Memo neu rechnen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function BudgetsScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);

  const [bereich, setBereich] = useState<Budgetbereich | null>(null);
  /**
   * Welches Budget seinen Verlauf zeigt — höchstens eines. Zwei aufgeklappte Charts
   * untereinander schöben die Liste aus dem Bild, von der man ausgegangen ist.
   */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);
  /**
   * Der Verlauf steht unter der ganzen Liste, nicht unter der geklickten Zeile — eine
   * Tabelle kann nichts zwischen zwei Zeilen einhängen. Bei sechs Budgets plus
   * Vorschlagskarte liegt er damit unter dem Sichtbaren, und wer klickt, sieht nichts
   * passieren und hält es für kaputt. Deshalb wird er beim Aufklappen herangeholt.
   */
  const verlaufRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // `?.` auch am Aufruf: jsdom kennt `scrollIntoView` nicht, und ein Screen-Test soll
    // nicht an einer Bequemlichkeit scheitern.
    if (offenesBudget) verlaufRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [offenesBudget]);

  /** Auf- und zuklappen — von der Zeile wie vom Namen aus dieselbe Geste. */
  function verlaufUmschalten(id: string) {
    setOffenesBudget((cur) => (cur === id ? null : id));
  }

  // Anlege-/Bearbeiten-Dialog
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [art, setArt] = useState<Budgetart>("monatlich");
  const [kategorieId, setKategorieId] = useState("");
  const [kontoId, setKontoId] = useState("");
  const [betragText, setBetragText] = useState("");
  const [start, setStart] = useState(heute);
  /**
   * Der Monat, für den der eingetippte Betrag gilt.
   *
   * Beim Anlegen der Startmonat, beim Bearbeiten der LAUFENDE: ein geänderter Rahmen gilt
   * ab jetzt, die Monate davor behalten ihre Planung. Über die Liste im Dialog lässt er
   * sich auf einen früheren Monat umstellen — dann wird dort korrigiert statt eine neue
   * Version anzulegen.
   */
  const [zielMonat, setZielMonat] = useState(heute.slice(0, 7));
  const [fehler, setFehler] = useState<string | null>(null);

  // EIN Ladevorgang, EIN setState: gestaffelte await/setState-Paare lassen abgeleitete
  // Werte kurz gegen leere Listen rechnen (ein Kategorie-Lookup meldet dann für einen
  // Render „ohne Kategorie").
  async function laden() {
    setBereich(await budgetbereich(heute));
  }
  useEffect(() => {
    laden();
  }, []);

  /**
   * Die Liste in Baumordnung: ein Budget steht unter dem, in dem es liegt. Nur so ist
   * die Verrechnung ablesbar — sonst stünde beim Dach ein gekürzter Monatsbetrag und
   * nirgends, wohin der Rest gegangen ist. Geordnet und gerechnet wird das in
   * `budgetstaende` (Anwendungsschicht), nicht hier.
   */
  const zeilen: readonly Budgetstand[] = bereich?.staende ?? [];
  const kategorien = bereich?.kategorien ?? [];
  const konten = bereich?.konten ?? [];
  const vorschlaege = bereich?.vorschlaege ?? [];
  const kontoName = bereich?.kontoNamen ?? LEERE_NAMEN;
  /** Die Zeile, deren Verlauf offen ist — sie kann nach einem Löschen weg sein. */
  const offenesZeile = zeilen.find((z) => z.budget.id === offenesBudget);
  /** Das Budget, das der Dialog gerade bearbeitet — für die Liste seiner Beträge. */
  const bearbeitetesBudget = zeilen.find((z) => z.budget.id === editId)?.budget;

  /**
   * Die Kennzahlen zählen nur die EFFEKTIVEN Beträge — sonst stünde ein eingebettetes
   * Budget zweimal in der Summe, einmal für sich und einmal im Dach.
   */
  const summe = useMemo(() => {
    let proMonat = 0, rahmen = 0, verbraucht = 0;
    for (const z of zeilen) {
      proMonat += z.proMonat;
      rahmen += z.monat.verfuegbar;
      verbraucht += z.monat.verbraucht;
    }
    return {
      proMonat,
      verbraucht,
      auslastung: rahmen > 0 ? Math.round((verbraucht / rahmen) * 100) : 0,
      ueberzogen: zeilen.filter((z) => z.rest < 0).length,
    };
  }, [zeilen]);

  function neu() {
    setEditId(null);
    setArt("monatlich");
    setKategorieId("");
    // Ein Konto ist Pflicht — der erste Eintrag ist eine Vorbelegung, keine Aussage.
    setKontoId(konten[0]?.id ?? "");
    setBetragText("");
    setStart(heute);
    setZielMonat(heute.slice(0, 7));
    setFehler(null);
    setOffen(true);
  }

  function bearbeiten(z: Budgetstand) {
    const b = z.budget;
    neu();
    setEditId(b.id);
    setArt(b.art);
    setKategorieId(b.kategorieId);
    setKontoId(b.kontoId);
    // Der Betrag DIESES Monats, nicht „der Betrag" — es gibt eine Reihe davon, und was
    // im Feld steht, ist der Ausgangspunkt für die nächste Version.
    setBetragText(String(minorZuMajor(z.vollerMonatsbetrag, geld.waehrung)));
    setStart(b.start);
    setZielMonat(heute.slice(0, 7));
  }

  /** Eine bestehende Version zum Korrigieren ins Feld holen. */
  function versionBearbeiten(abMonat: string, betrag: number) {
    setZielMonat(abMonat);
    setBetragText(String(minorZuMajor(betrag, geld.waehrung)));
    setFehler(null);
  }

  async function versionLoeschen(abMonat: string) {
    if (!editId) return;
    setFehler(null);
    try {
      await budgetBetragLoeschen(editId, abMonat);
      await laden();
      // Stand der gelöschte Monat gerade im Feld, zeigt es sonst auf etwas, das es nicht
      // mehr gibt — zurück auf den laufenden Monat.
      if (zielMonat === abMonat) setZielMonat(heute.slice(0, 7));
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /** Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort. */
  function vorschlagUebernehmen(v: Budgetvorschlag) {
    neu();
    setKategorieId(v.kategorieId);
    setBetragText(String(minorZuMajor(v.vorschlag, geld.waehrung)));
  }

  async function vorschlagVerwerfen(v: Budgetvorschlag) {
    await vorschlagIgnorieren(v.kategorieId);
    await laden();
  }

  async function speichern() {
    setFehler(null);
    try {
      await budgetSpeichern(
        // `abMonat`: beim Anlegen der Startmonat, beim Bearbeiten der laufende. Ein
        // geänderter Rahmen gilt ab jetzt — die Monate davor behalten ihre Planung.
        {
          kategorieId, kontoId, betragProMonat: geld.parse(betragText) ?? 0, art, start,
          abMonat: editId ? zielMonat : start.slice(0, 7),
        },
        editId ?? undefined,
      );
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("budgets.titel")}
        subtitle={t("budgets.untertitel")}
        action={
          <Button variant="primary" plus onClick={neu}>
            {t("budgets.anlegen")}
          </Button>
        }
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
        <Trans i18nKey="budgets.erklaerung" components={betont} />
      </p>

      {/* Kennzahlen als eigene Reihe, nicht in der Karte — dieselbe Ordnung wie auf der
          Übersicht: erst die Zahlen, dann das, worüber sie sprechen. */}
      {zeilen.length > 0 && (
        <div className="kpis">
          <KPIStat size="chip" label={t("budgets.kpiAnzahl")} value={String(zeilen.length)} />
          <KPIStat size="chip" label={t("budgets.kpiProMonat")} value={geld.format(summe.proMonat)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("budgets.kpiVerbraucht")} value={geld.format(summe.verbraucht)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("budgets.kpiAuslastung")} value={String(summe.auslastung)} unit="%" tone={summe.auslastung > 100 ? "warn" : "default"} />
          {summe.ueberzogen > 0 && (
            <KPIStat size="chip" label={t("budgets.kpiUeberzogen")} value={String(summe.ueberzogen)} tone="warn" />
          )}
        </div>
      )}

      {vorschlaege.length > 0 && (
        <Card
          title={t("budgets.vorschlaegeTitel")}
          subtitle={t("budgets.vorschlaegeUntertitel", { count: vorschlaege.length })}
        >
          <p className="muted" style={{ fontSize: "var(--fs-small)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
            {t("budgets.vorschlaegeHinweis")}
          </p>
          <DataTable
            sortable
            pageSize={10}
            columns={[
              { key: "kategorie", label: t("budgets.spalteKategorie"), render: (v: Budgetvorschlag) => v.name },
              {
                key: "median",
                label: `${t("budgets.spalteBisher")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.medianProMonat,
                render: (v: Budgetvorschlag) => geld.format(v.medianProMonat),
              },
              {
                // Was der Vertrag abbucht, steuert kein Budget — deshalb steht der Abzug
                // in der Tabelle und nicht nur im Ergebnis.
                key: "vertrag",
                label: `${t("budgets.spalteVertraglich")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.vertragsanteil,
                render: (v: Budgetvorschlag) => (v.vertragsanteil > 0 ? geld.format(-v.vertragsanteil) : "—"),
              },
              {
                key: "vorschlag",
                label: `${t("budgets.spalteVorschlag")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.vorschlag,
                render: (v: Budgetvorschlag) => <b>{geld.format(v.vorschlag)}</b>,
              },
              {
                // Sagt, wie oft der Rahmen reißen wird: ×1 = jeden Monat gleich,
                // ×23 = ein einzelner Monat war das Dreiundzwanzigfache.
                key: "schwankung",
                label: t("budgets.spalteSchwankung"),
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.schwankung,
                render: (v: Budgetvorschlag) =>
                  v.schwankung <= 2 ? (
                    <Pill variant="ok">{t("budgets.stabil")}</Pill>
                  ) : (
                    <Pill variant="warn">{t("budgets.schwankend", { faktor: v.schwankung })}</Pill>
                  ),
              },
              { key: "monate", label: t("budgets.spalteMonate"), align: "right", render: (v: Budgetvorschlag) => String(v.monate) },
              {
                key: "_a",
                label: "",
                align: "right",
                sortable: false,
                render: (v: Budgetvorschlag) => (
                  <IconLeiste>
                    <IconButton icon="uebernehmen" label={t("budgets.vorschlagUebernehmen")} onClick={() => vorschlagUebernehmen(v)} />
                    <IconButton icon="verwerfen" label={t("budgets.vorschlagVerwerfen")} onClick={() => void vorschlagVerwerfen(v)} />
                  </IconLeiste>
                ),
              },
            ]}
            rows={[...vorschlaege]}
          />
        </Card>
      )}

      <Card title={t("budgets.abschnittListe")} subtitle={t("budgets.abschnittListeHinweis")}>
        {zeilen.length === 0 ? (
          <div className="muted">{t("budgets.leer")}</div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: "var(--fs-small)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
              {t("budgets.verbrauchHinweis")}
            </p>
            <DataTable
              pageSize={30}
              columns={[
                {
                  key: "kategorie",
                  label: t("budgets.spalteKategorie"),
                  render: (z: Budgetstand) => (
                    // Einrückung statt eigener Spalte: die Verschachtelung ist eine
                    // Eigenschaft der Kategorie, keine zweite Information daneben.
                    // Der Verlauf hängt am Bezeichner, nicht an der ganzen Zeile: eine
                    // klickbare Zeile sieht man einer Tabelle nicht an (siehe
                    // `bausteine/Zeilenlink`), und die Zeile trägt daneben schon zwei
                    // Aktionen, die etwas anderes tun.
                    // `stopPropagation` auf dem Block um den Link: sonst schaltet der
                    // Klick zweimal um — einmal über den Link, einmal über die Zeile —
                    // und das Aufklappen hebt sich selbst auf. Der Block ist so breit wie
                    // sein Inhalt, der Rest der Zelle bleibt also Trefferfläche der Zeile.
                    <span
                      onClick={(e) => e.stopPropagation()}
                      style={{ paddingLeft: z.tiefe * 18, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {z.tiefe > 0 && <span style={{ color: "var(--ink-3)" }}>└</span>}
                      <span style={{ fontWeight: z.tiefe === 0 ? "var(--fw-bold)" : "var(--fw-semi)" }}>
                        <Zeilenlink
                          titel={t("budgets.verlaufOeffnen", { name: z.kategorieName })}
                          onKlick={() => verlaufUmschalten(z.budget.id)}
                        >
                          {z.kategorieName}
                        </Zeilenlink>
                      </span>
                    </span>
                  ),
                },
                {
                  key: "art",
                  label: t("budgets.spalteArt"),
                  render: (z: Budgetstand) => (
                    <Pill variant={z.budget.art === "aufbauend" ? "um" : "neutral"}>{t(`budgets.art.${z.budget.art}`)}</Pill>
                  ),
                },
                {
                  key: "konto",
                  label: t("budgets.spalteKonto"),
                  render: (z: Budgetstand) => kontoName.get(z.budget.kontoId) ?? <span className="muted">{t("budgets.kontoFehlt")}</span>,
                },
                {
                  key: "proMonat",
                  label: `${t("budgets.spalteProMonat")} ${geld.symbol}`,
                  align: "right",
                  render: (z: Budgetstand) => (
                    <span title={z.proMonat !== z.vollerMonatsbetrag ? t("budgets.abzugHinweis", { voll: geld.format(z.vollerMonatsbetrag) }) : undefined}>
                      {geld.format(z.proMonat)}
                      {z.proMonat !== z.vollerMonatsbetrag && <span className="muted"> *</span>}
                    </span>
                  ),
                },
                {
                  // Was in DIESEM Monat zur Verfügung steht: beim Monatlichen der
                  // Monatsbetrag, beim Aufbauenden der Übertrag plus die Rate. Der Titel
                  // legt die Aufrechnung offen, statt sie erraten zu lassen.
                  key: "rahmen",
                  label: `${t("budgets.spalteRahmen")} ${geld.symbol}`,
                  align: "right",
                  sortValue: (z: Budgetstand) => z.monat.verfuegbar,
                  render: (z: Budgetstand) => (
                    <span
                      title={
                        z.budget.art === "aufbauend"
                          ? t("budgets.verfuegbarHinweis", {
                              uebertrag: geld.formatMitSymbol(z.monat.uebertrag),
                              zufuehrung: geld.formatMitSymbol(z.monat.zufuehrung),
                              gesamt: geld.formatMitSymbol(z.rahmen),
                            })
                          : undefined
                      }
                    >
                      {geld.format(z.monat.verfuegbar)}
                    </span>
                  ),
                },
                {
                  key: "verbraucht",
                  label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`,
                  align: "right",
                  sortValue: (z: Budgetstand) => z.monat.verbraucht,
                  render: (z: Budgetstand) => geld.format(z.monat.verbraucht),
                },
                {
                  key: "rest",
                  label: `${t("budgets.spalteRest")} ${geld.symbol}`,
                  align: "right",
                  render: (z: Budgetstand) => (
                    <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}>{geld.format(z.rest)}</span>
                  ),
                },
                {
                  key: "balken",
                  label: "",
                  sortable: false,
                  render: (z: Budgetstand) => (
                    <span style={{ display: "block", minWidth: 90 }}>
                      <CoverageTrack value={Math.max(0, z.monat.verbraucht)} max={Math.max(1, z.monat.verfuegbar)} over={z.rest < 0} label="" right="" />
                    </span>
                  ),
                },
                {
                  key: "_a",
                  label: "",
                  align: "right",
                  sortable: false,
                  render: (z: Budgetstand) => (
                    // Der Klick auf ein Zeilen-Icon darf nicht zusätzlich den Verlauf
                    // umschalten: er blubberte sonst zur Zeile hoch, und „löschen" öffnete
                    // nebenbei ein Diagramm zu einem Budget, das es nicht mehr gibt.
                    <span onClick={(e) => e.stopPropagation()}>
                      <IconLeiste>
                        <IconButton icon="bearbeiten" label={t("budgets.bearbeiten")} onClick={() => bearbeiten(z)} />
                        <IconButton icon="loeschen" ton="gefahr" label={t("budgets.loeschen")} onClick={() => void budgetLoeschen(z.budget.id).then(laden)} />
                      </IconLeiste>
                    </span>
                  ),
                },
              ]}
              rows={[...zeilen]}
              // Der Name TRÄGT die Möglichkeit sichtbar (siehe `bausteine/Zeilenlink`);
              // die ganze Zeile als Ziel kommt dazu, weil man nach dem ersten Mal die
              // Trefferfläche will und nicht die Zielübung.
              onRowClick={(z: Budgetstand) => verlaufUmschalten(z.budget.id)}
              istAktiv={(z: Budgetstand) => z.budget.id === offenesBudget}
            />
            {zeilen.some((z) => z.proMonat !== z.vollerMonatsbetrag) && (
              <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-2)" }}>
                {t("budgets.abzugFussnote")}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Der Verlauf NEBEN der Liste, nicht darin: die Liste steckt schon in einer Karte,
          und eine zweite darin wären zwei Rahmen um dieselbe Sache. Der `key` sorgt dafür,
          dass beim Wechsel auf ein anderes Budget die Monatsauswahl neu anfängt statt auf
          einem Index zu stehen, den die kürzere Reihe womöglich gar nicht hat. */}
      {bereich && offenesZeile && (
        <div ref={verlaufRef}>
        <BudgetVerlauf
          key={offenesZeile.budget.id}
          sicht={bereich.sicht}
          stand={offenesZeile}
          heute={heute}
          kategorieNamen={bereich.kategorieNamen}
          empfaenger={bereich.empfaenger}
          onSchliessen={() => setOffenesBudget(null)}
        />
        </div>
      )}

      {offen && (
        <Modal
          title={editId ? t("budgets.modalBearbeiten") : t("budgets.anlegen")}
          subtitle={t("budgets.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={
            <>
              <Button variant="primary" onClick={speichern}>
                {t("budgets.speichern")}
              </Button>
              <button className="linkbtn" onClick={() => setOffen(false)}>
                {t("budgets.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <div className="form-grid">
            {/* Die Art ist jetzt jederzeit umstellbar — beide liegen in derselben
                Tabelle, ein Wechsel ist kein Aggregatwechsel mehr. */}
            <FormField label={t("budgets.feldArt")} hint={t(`budgets.artHinweis.${art}`)}>
              <select className="field" value={art} onChange={(e) => setArt(e.target.value as Budgetart)}>
                {ARTEN.map((a) => (
                  <option key={a} value={a}>{t(`budgets.art.${a}`)}</option>
                ))}
              </select>
            </FormField>

            <FormField label={t("budgets.feldKategorie")} required hint={t("budgets.feldKategorieHinweis")}>
              <CategoryPicker kategorien={[...kategorien]} value={kategorieId} onChange={setKategorieId} />
            </FormField>

            <FormField label={t("budgets.feldKonto")} required hint={t("budgets.feldKontoHinweis")}>
              <select className="field" value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
                <option value="">{t("budgets.kontoWaehlen")}</option>
                {konten.map((k) => (
                  <option key={k.id} value={k.id}>{k.bezeichnung}</option>
                ))}
              </select>
            </FormField>

            <FormField
              label={`${t("budgets.feldBetrag")} ${geld.symbol}`}
              required
              hint={editId ? t("budgets.giltAbHinweis", { monat: zielMonat }) : t("budgets.feldBetragHinweis")}
            >
              <input className="field" inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} placeholder={geld.format(0)} />
            </FormField>

            {/* Die Reihe der bisherigen Beträge — nur beim Bearbeiten, beim Anlegen gibt
                es sie noch nicht. Sie steht hier und nicht auf dem Screen, weil sie die
                Frage beantwortet, die man genau hier hat: „was habe ich zuletzt geplant,
                und wo greift meine Eingabe hinein?" */}
            {editId && bearbeitetesBudget && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
                  {t("budgets.versionenTitel")}
                </div>
                {bearbeitetesBudget.betraege.map((v) => {
                  const aktiv = v.abMonat === zielMonat;
                  return (
                    <div
                      key={v.abMonat}
                      style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "5px 8px", borderRadius: "var(--r-md)", background: aktiv ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent", fontSize: "12.5px" }}
                    >
                      <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
                        {t("budgets.versionAb", { monat: v.abMonat })}
                      </span>
                      <span className="num" style={{ marginLeft: "auto", fontWeight: "var(--fw-semi)" }}>
                        {geld.formatMitSymbol(v.betrag)}
                      </span>
                      <IconLeiste>
                        <IconButton icon="bearbeiten" label={t("budgets.versionAendern", { monat: v.abMonat })} onClick={() => versionBearbeiten(v.abMonat, v.betrag)} />
                        {/* Die letzte Version bleibt: ein Budget ohne Betrag wäre eine
                            Kategorie mit einem Etikett. Der Use-Case weist es ohnehin ab —
                            der Knopf verschwindet, damit man nicht erst dagegen läuft. */}
                        {bearbeitetesBudget.betraege.length > 1 && (
                          <IconButton icon="loeschen" ton="gefahr" label={t("budgets.versionLoeschen", { monat: v.abMonat })} onClick={() => void versionLoeschen(v.abMonat)} />
                        )}
                      </IconLeiste>
                    </div>
                  );
                })}
                {/* Zurück auf „ab jetzt", wenn gerade eine alte Version im Feld steht. */}
                {!bearbeitetesBudget.betraege.some((v) => v.abMonat === zielMonat) ? null : zielMonat !== heute.slice(0, 7) && (
                  <button className="linkbtn" type="button" onClick={() => setZielMonat(heute.slice(0, 7))}>
                    {t("budgets.wiederAbLaufend", { monat: heute.slice(0, 7) })}
                  </button>
                )}
              </div>
            )}

            {/* Nur beim Aufbauenden: ohne Anker weiss es nicht, wie viele Monate es
                schon gesammelt hat. Beim Monatlichen wäre das Feld ohne Wirkung. */}
            {art === "aufbauend" && (
              <FormField label={t("budgets.feldStart")} hint={t("budgets.feldStartHinweis")}>
                <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </FormField>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
