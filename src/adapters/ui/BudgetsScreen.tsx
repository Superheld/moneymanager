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
// PILOT für ADR-0004: alle sichtbaren Strings über t()/<Trans>, alles Geld über useGeld().

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  minorZuMajor,
  type Budget,
  type Budgetart,
  type Budgetbereich,
  type Budgetstand,
  type Budgetvorschlag,
} from "../../application";
import { budgetAnlegen as budgetSpeichern, budgetbereich, budgetLoeschen, vorschlagIgnorieren } from "../dienste";
import { Button, Card, CoverageTrack, DataTable, FormField, KPIStat, Pill } from "./ds";
import { IconButton, IconLeiste } from "./IconButton";
import { betont } from "./betonung";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { geldFarbe } from "./geldFarbe";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

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

  // Anlege-/Bearbeiten-Dialog
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [art, setArt] = useState<Budgetart>("monatlich");
  const [kategorieId, setKategorieId] = useState("");
  const [kontoId, setKontoId] = useState("");
  const [betragText, setBetragText] = useState("");
  const [start, setStart] = useState(heute);
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

  /**
   * Die Kennzahlen zählen nur die EFFEKTIVEN Beträge — sonst stünde ein eingebettetes
   * Budget zweimal in der Summe, einmal für sich und einmal im Dach.
   */
  const summe = useMemo(() => {
    let proMonat = 0, rahmen = 0, verbraucht = 0;
    for (const z of zeilen) {
      proMonat += z.proMonat;
      rahmen += z.rahmen;
      verbraucht += z.verbraucht;
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
    setFehler(null);
    setOffen(true);
  }

  function bearbeiten(b: Budget) {
    neu();
    setEditId(b.id);
    setArt(b.art);
    setKategorieId(b.kategorieId);
    setKontoId(b.kontoId);
    setBetragText(String(minorZuMajor(b.betragProMonat, geld.waehrung)));
    setStart(b.start);
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
        { kategorieId, kontoId, betragProMonat: geld.parse(betragText) ?? 0, art, start },
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
                    <span style={{ paddingLeft: z.tiefe * 18, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {z.tiefe > 0 && <span style={{ color: "var(--ink-3)" }}>└</span>}
                      <span style={{ fontWeight: z.tiefe === 0 ? "var(--fw-bold)" : "var(--fw-semi)" }}>
                        {z.kategorieName}
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
                    <span title={z.proMonat !== z.budget.betragProMonat ? t("budgets.abzugHinweis", { voll: geld.format(z.budget.betragProMonat) }) : undefined}>
                      {geld.format(z.proMonat)}
                      {z.proMonat !== z.budget.betragProMonat && <span className="muted"> *</span>}
                    </span>
                  ),
                },
                {
                  // Bei „aufbauend" das bisher Angesammelte, bei „monatlich" der
                  // Monatsbetrag — dieselbe Spalte, weil es dieselbe Frage ist:
                  // wieviel steht zur Verfügung?
                  key: "rahmen",
                  label: `${t("budgets.spalteRahmen")} ${geld.symbol}`,
                  align: "right",
                  render: (z: Budgetstand) => geld.format(z.rahmen),
                },
                {
                  key: "verbraucht",
                  label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`,
                  align: "right",
                  render: (z: Budgetstand) => geld.format(z.verbraucht),
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
                      <CoverageTrack value={Math.max(0, z.verbraucht)} max={Math.max(1, z.rahmen)} over={z.rest < 0} label="" right="" />
                    </span>
                  ),
                },
                {
                  key: "_a",
                  label: "",
                  align: "right",
                  sortable: false,
                  render: (z: Budgetstand) => (
                    <IconLeiste>
                      <IconButton icon="bearbeiten" label={t("budgets.bearbeiten")} onClick={() => bearbeiten(z.budget)} />
                      <IconButton icon="loeschen" ton="gefahr" label={t("budgets.loeschen")} onClick={() => void budgetLoeschen(z.budget.id).then(laden)} />
                    </IconLeiste>
                  ),
                },
              ]}
              rows={[...zeilen]}
            />
            {zeilen.some((z) => z.proMonat !== z.budget.betragProMonat) && (
              <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-2)" }}>
                {t("budgets.abzugFussnote")}
              </div>
            )}
          </>
        )}
      </Card>

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

            <FormField label={`${t("budgets.feldBetrag")} ${geld.symbol}`} required hint={t("budgets.feldBetragHinweis")}>
              <input className="field" inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} placeholder={geld.format(0)} />
            </FormField>

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
