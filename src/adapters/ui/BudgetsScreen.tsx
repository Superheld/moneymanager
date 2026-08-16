// Budgets — EIN Bereich für zwei Spielarten desselben Gefühls („ich lege monatlich X für
// Y zurück"):
//   • Jeden Monat neu  → Aggregat `Budget` (Rahmen je Periode, Reset, kein Übertrag)
//   • Baut sich auf    → Aggregat `Topf`   (Puffer für Ungewisses, Spartopf für Wünsche)
//
// Zusammengelegt wurde die OBERFLÄCHE, nicht das Modell (Entscheidung 2026-08-16). Der
// Unterschied ist nämlich kein Laufzeit-, sondern ein Bilanzunterschied: eine Budget-
// Ausgabe ist Aufwand, eine Topf-Einzahlung ist es NICHT (das Geld liegt nur woanders,
// Charakter „Umschichtung"). Ein gemeinsames Aggregat müsste diese Unterscheidung intern
// weiterhin treffen — es würde sie nur verstecken. Also: ein Screen, ein Anlege-Dialog,
// dahinter unverändert `budgetAnlegen` bzw. `topfAnlegen`.
//
// Ersatz-Töpfe erscheinen hier NICHT; die hängen an einem Gegenstand und leben im
// Bereich „Inventar".
//
// PILOT für ADR-0004: alle sichtbaren Strings über t()/<Trans>, alles Geld über useGeld().

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ansparrate,
  budgetVerbrauch,
  centZuEuro,
  geglaetteterMonatsabfluss,
  minorZuMajor,
  periodeFenster,
  topfBuchungen,
  topfStand,
  zielwert,
  type Budget,
  type BudgetPeriode,
  type Budgetvorschlag,
  type IstBuchung,
  type Kategorie,
  type Topf,
  type Zahlungskonto,
} from "../../core";
import { budgetAnlegen } from "../../application/budgetAnlegen";
import {
  budgetvorschlaegeLaden,
  budgetvorschlagIgnorieren,
  ignorierteBudgetvorschlaege,
} from "../../application/budgetvorschlaege";
import { topfAnlegen } from "../../application/topfAnlegen";
import { topfEntnahme } from "../../application/topfEntnahme";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteEinstellungenRepository as einstellungenRepo } from "../persistence/sqliteEinstellungenRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, DataTable, FormField, KPIStat, Pill } from "./ds";
import { betont } from "./betonung";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

/** Was der Nutzer im Dialog wählt. „monatlich" → Budget, sonst → Topf dieses Typs. */
type Art = "monatlich" | "puffer" | "spartopf";

const PERIODEN: BudgetPeriode[] = ["monatlich", "jaehrlich"];

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function BudgetsScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [vorschlaege, setVorschlaege] = useState<Budgetvorschlag[]>([]);

  // Anlege-/Bearbeiten-Dialog (trägt beide Arten)
  const [offen, setOffen] = useState(false);
  const [art, setArt] = useState<Art>("monatlich");
  const [editId, setEditId] = useState<string | null>(null);
  const [kategorieId, setKategorieId] = useState("");
  const [rahmenText, setRahmenText] = useState("");
  const [periode, setPeriode] = useState<BudgetPeriode>("monatlich");
  const [bezeichnung, setBezeichnung] = useState("");
  const [start, setStart] = useState(heute);
  const [schaetzbetrag, setSchaetzbetrag] = useState("");
  const [fristMonate, setFristMonate] = useState("");
  const [zufuehrung, setZufuehrung] = useState("");
  const [sparziel, setSparziel] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  // Entnahme-Dialog (nur aufbauend)
  const [entTopf, setEntTopf] = useState<Topf | null>(null);
  const [entKonto, setEntKonto] = useState("");
  const [entDatum, setEntDatum] = useState(heute);
  const [entBetrag, setEntBetrag] = useState("");
  const [entNotiz, setEntNotiz] = useState("");
  const [entFehler, setEntFehler] = useState<string | null>(null);

  // Verwandte Repos in EINEM Effekt und zusammen setzen: gestaffelte setState lassen die
  // abgeleiteten Werte kurz gegen leere Listen rechnen (Kategorie-Lookup → „ohne Kategorie").
  async function laden() {
    const [b, tp, k, i, ko, ignoriert] = await Promise.all([
      budgetRepo.alle(),
      topfRepo.alle(),
      kategorieRepo.alle(),
      ledgerRepo.alle(),
      kontoRepo.alle(),
      ignorierteBudgetvorschlaege(einstellungenRepo),
    ]);
    setBudgets(b);
    setToepfe(tp);
    setKategorien(k);
    setIst(i);
    setKonten(ko);
    setVorschlaege(
      await budgetvorschlaegeLaden(
        ledgerRepo, umsatzRepo, kategorieRepo, budgetRepo, heute.slice(0, 7), heute, ignoriert,
      ),
    );
  }
  useEffect(() => {
    laden();
  }, []);

  /** Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort. */
  function vorschlagUebernehmen(v: Budgetvorschlag) {
    neu();
    setArt("monatlich");
    setKategorieId(v.kategorieId);
    setRahmenText(String(minorZuMajor(v.vorschlag, geld.waehrung)));
    setPeriode("monatlich");
  }

  async function vorschlagVerwerfen(v: Budgetvorschlag) {
    await budgetvorschlagIgnorieren(einstellungenRepo, v.kategorieId);
    setVorschlaege((bisher) => bisher.filter((x) => x.kategorieId !== v.kategorieId));
  }

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  /** Ersatz-Töpfe hängen am Inventar und werden dort geführt. */
  const aufbauend = useMemo(() => toepfe.filter((tp) => tp.typ !== "ersatz"), [toepfe]);

  function verbrauch(b: Budget): number {
    const { von, bis } = periodeFenster(b.periode, heute);
    return budgetVerbrauch(ist, kategorien, b.kategorieId, von, bis);
  }

  const summeMonatlich = useMemo(() => {
    let proMonat = 0, rahmenPeriode = 0, verbraucht = 0;
    for (const b of budgets) {
      proMonat += Math.abs(geglaetteterMonatsabfluss(b));
      rahmenPeriode += b.rahmen;
      verbraucht += verbrauch(b);
    }
    return {
      proMonat,
      verbraucht,
      auslastung: rahmenPeriode > 0 ? Math.round((verbraucht / rahmenPeriode) * 100) : 0,
    };
  }, [budgets, ist, heute]);

  const summeAufbauend = useMemo(() => {
    let angespart = 0, ziel = 0;
    for (const tp of aufbauend) {
      angespart += Math.max(0, topfStand(tp, heute, topfBuchungen(ist, tp.id)));
      const z = zielwert(tp);
      if (z != null) ziel += z;
    }
    return { angespart, ziel, deckung: ziel > 0 ? Math.round((angespart / ziel) * 100) : 0 };
  }, [aufbauend, ist, heute]);

  function neu() {
    setEditId(null);
    setArt("monatlich");
    setKategorieId("");
    setRahmenText("");
    setPeriode("monatlich");
    setBezeichnung("");
    setStart(heute);
    setSchaetzbetrag("");
    setFristMonate("");
    setZufuehrung("");
    setSparziel("");
    setFehler(null);
    setOffen(true);
  }

  function budgetBearbeiten(b: Budget) {
    neu();
    setEditId(b.id);
    setArt("monatlich");
    setKategorieId(b.kategorieId);
    setRahmenText(String(minorZuMajor(b.rahmen, geld.waehrung)));
    setPeriode(b.periode);
  }

  function topfBearbeiten(tp: Topf) {
    neu();
    setEditId(tp.id);
    setBezeichnung(tp.bezeichnung);
    setStart(tp.start);
    setKategorieId(tp.kategorieId ?? "");
    if (tp.typ === "puffer") {
      setArt("puffer");
      setSchaetzbetrag(String(minorZuMajor(tp.schaetzbetrag, geld.waehrung)));
      setFristMonate(String(tp.fristMonate));
    } else if (tp.typ === "spartopf") {
      setArt("spartopf");
      setZufuehrung(String(minorZuMajor(tp.zufuehrungProMonat, geld.waehrung)));
      setSparziel(tp.sparziel != null ? String(minorZuMajor(tp.sparziel, geld.waehrung)) : "");
    }
  }

  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  async function speichern() {
    setFehler(null);
    try {
      if (art === "monatlich") {
        await budgetAnlegen(
          budgetRepo,
          { kategorieId, rahmen: geld.parse(rahmenText) ?? 0, periode },
          editId ?? undefined,
        );
      } else {
        await topfAnlegen(
          topfRepo,
          {
            typ: art,
            bezeichnung,
            start,
            kategorieId: kategorieId || undefined,
            schaetzbetrag: geld.parse(schaetzbetrag) ?? 0,
            fristMonate: num(fristMonate),
            zufuehrungProMonat: geld.parse(zufuehrung) ?? 0,
            sparziel: geld.parse(sparziel) ?? 0,
          },
          editId ?? undefined,
        );
      }
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  function entnehmenOeffnen(tp: Topf) {
    setEntTopf(tp);
    setEntKonto(konten[0]?.id ?? "");
    setEntDatum(heute);
    setEntBetrag("");
    setEntNotiz("");
    setEntFehler(null);
  }
  async function entnehmenSpeichern() {
    if (!entTopf) return;
    setEntFehler(null);
    try {
      await topfEntnahme(ledgerRepo, {
        topf: entTopf,
        kontoId: entKonto,
        datum: entDatum,
        betrag: geld.parse(entBetrag) ?? 0,
        notiz: entNotiz,
      });
      setEntTopf(null);
      await laden();
    } catch (e) {
      setEntFehler(fehlerNachricht(t, e));
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
                key: "_u",
                label: "",
                align: "right",
                sortable: false,
                render: (v: Budgetvorschlag) => (
                  <button className="linkbtn" onClick={() => vorschlagUebernehmen(v)}>
                    {t("budgets.vorschlagUebernehmen")}
                  </button>
                ),
              },
              {
                key: "_v",
                label: "",
                align: "right",
                sortable: false,
                render: (v: Budgetvorschlag) => (
                  <button className="linkbtn" onClick={() => vorschlagVerwerfen(v)}>
                    {t("budgets.vorschlagVerwerfen")}
                  </button>
                ),
              },
            ]}
            rows={vorschlaege}
          />
        </Card>
      )}

      <Card title={t("budgets.abschnittMonatlich")} subtitle={t("budgets.abschnittMonatlichHinweis")}>
        {budgets.length === 0 ? (
          <div className="muted">{t("budgets.leer")}</div>
        ) : (
          <>
            <div className="kpis">
              <KPIStat size="chip" label={t("budgets.kpiAnzahl")} value={String(budgets.length)} />
              <KPIStat size="chip" label={t("budgets.kpiProMonat")} value={geld.format(summeMonatlich.proMonat)} unit={geld.symbol} />
              <KPIStat size="chip" label={t("budgets.kpiVerbraucht")} value={geld.format(summeMonatlich.verbraucht)} unit={geld.symbol} />
              <KPIStat size="chip" label={t("budgets.kpiAuslastung")} value={String(summeMonatlich.auslastung)} unit="%" tone={summeMonatlich.auslastung > 100 ? "warn" : "default"} />
            </div>
            <p className="muted" style={{ fontSize: "var(--fs-small)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
              {t("budgets.verbrauchHinweis")}
            </p>
            <DataTable
              sortable
              pageSize={25}
              columns={[
                { key: "kategorie", label: t("budgets.spalteKategorie"), sortValue: (b) => kategorieName.get(b.kategorieId) ?? "", render: (b) => kategorieName.get(b.kategorieId) ?? "?" },
                { key: "periode", label: t("budgets.spaltePeriode"), render: (b) => t(`budgets.periode.${b.periode}`) },
                { key: "rahmen", label: `${t("budgets.spalteRahmen")} ${geld.symbol}`, align: "right", render: (b) => geld.format(b.rahmen) },
                { key: "geglaettet", label: `${t("budgets.spalteProMonat")} ${geld.symbol}`, align: "right", sortValue: (b) => geglaetteterMonatsabfluss(b), render: (b) => geld.format(geglaetteterMonatsabfluss(b)) },
                { key: "verbraucht", label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`, align: "right", sortValue: (b) => verbrauch(b), render: (b) => geld.format(verbrauch(b)) },
                { key: "rest", label: `${t("budgets.spalteRest")} ${geld.symbol}`, align: "right", sortValue: (b) => b.rahmen - verbrauch(b), render: (b) => geld.format(b.rahmen - verbrauch(b)) },
                { key: "_e", label: "", align: "right", sortable: false, render: (b) => <button className="linkbtn" onClick={() => budgetBearbeiten(b)}>{t("budgets.bearbeiten")}</button> },
                { key: "_x", label: "", align: "right", sortable: false, render: (b) => <button className="linkbtn" onClick={() => budgetRepo.loeschen(b.id).then(laden)}>{t("budgets.loeschen")}</button> },
              ]}
              rows={budgets}
            />
          </>
        )}
      </Card>

      <Card title={t("budgets.abschnittAufbauend")} subtitle={t("budgets.abschnittAufbauendHinweis")}>
        {aufbauend.length === 0 ? (
          <div className="muted">{t("budgets.leerAufbauend")}</div>
        ) : (
          <>
            <div className="kpis">
              <KPIStat size="chip" label={t("toepfe.kpiAnzahl")} value={String(aufbauend.length)} />
              <KPIStat size="chip" label={t("toepfe.kpiAngespart")} value={geld.format(summeAufbauend.angespart)} unit={geld.symbol} tone="ok" />
              <KPIStat size="chip" label={t("toepfe.kpiZiel")} value={geld.format(summeAufbauend.ziel)} unit={geld.symbol} />
              <KPIStat size="chip" label={t("toepfe.kpiDeckung")} value={String(summeAufbauend.deckung)} unit="%" tone={summeAufbauend.deckung < 50 ? "warn" : "default"} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)", marginTop: "var(--sp-3)" }}>
              {aufbauend.map((tp) => {
                const ziel = zielwert(tp);
                const stand = topfStand(tp, heute, topfBuchungen(ist, tp.id));
                const ueberzogen = stand < 0;
                return (
                  <div key={tp.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: "var(--fw-bold)" }}>
                        {tp.bezeichnung} <Pill variant="neutral">{t(`toepfe.art.${tp.typ}`)}</Pill>
                        {ueberzogen && <> <Pill variant="warn">{t("toepfe.ueberzogen")}</Pill></>}
                      </span>
                      <span className="muted">
                        {t("toepfe.ansparrate")} {geld.format(ansparrate(tp))} {geld.symbol}{t("toepfe.proMonatKurz")}{"  ·  "}
                        <button className="linkbtn" onClick={() => entnehmenOeffnen(tp)}>{t("toepfe.entnehmen")}</button>{"  ·  "}
                        <button className="linkbtn" onClick={() => topfBearbeiten(tp)}>{t("toepfe.bearbeiten")}</button>{"  ·  "}
                        <button className="linkbtn" onClick={() => topfRepo.loeschen(tp.id).then(laden)}>{t("toepfe.loeschen")}</button>
                      </span>
                    </div>
                    {ziel != null ? (
                      <CoverageTrack value={centZuEuro(Math.max(0, stand))} max={centZuEuro(ziel)} label={t("toepfe.standHeuteZiel")} right={`${geld.format(stand)} / ${geld.format(ziel)} ${geld.symbol}`} />
                    ) : (
                      <div className="muted">{t("toepfe.keinSparziel")} · {geld.format(stand)} {geld.symbol}</div>
                    )}
                  </div>
                );
              })}
            </div>
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
            {/* Die Art entscheidet, welches Aggregat entsteht — nach dem Speichern nicht
                mehr wechselbar, weil Budget und Topf verschiedene Tabellen sind. */}
            <FormField label={t("budgets.feldArt")} hint={t("budgets.feldArtHinweis")}>
              <select className="field" value={art} disabled={editId !== null} onChange={(e) => setArt(e.target.value as Art)}>
                <optgroup label={t("budgets.artGruppeMonatlich")}>
                  <option value="monatlich">{t("budgets.artMonatlich")}</option>
                </optgroup>
                <optgroup label={t("budgets.artGruppeAufbauend")}>
                  <option value="puffer">{t("toepfe.optionPuffer")}</option>
                  <option value="spartopf">{t("toepfe.optionSpartopf")}</option>
                </optgroup>
              </select>
            </FormField>

            {art === "monatlich" ? (
              <>
                <FormField label={t("budgets.feldKategorie")} required>
                  <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
                </FormField>
                <FormField label={`${t("budgets.feldRahmen")} ${geld.symbol}`} required hint={t("budgets.feldRahmenHinweis")}>
                  <input className="field" inputMode="decimal" value={rahmenText} onChange={(e) => setRahmenText(e.target.value)} placeholder={geld.format(0)} />
                </FormField>
                <FormField label={t("budgets.feldPeriode")}>
                  <select className="field" value={periode} onChange={(e) => setPeriode(e.target.value as BudgetPeriode)}>
                    {PERIODEN.map((p) => (
                      <option key={p} value={p}>
                        {t(`budgets.periode.${p}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </>
            ) : (
              <>
                <FormField label={t("toepfe.feldBezeichnung")} required>
                  <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={art === "puffer" ? t("toepfe.platzhalterBezeichnungPuffer") : t("toepfe.platzhalterBezeichnungSpartopf")} />
                </FormField>
                <FormField label={t("toepfe.feldStart")}>
                  <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </FormField>
                <FormField label={t("toepfe.feldKategorie")} hint={t("toepfe.feldKategorieHinweis")}>
                  <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
                </FormField>
                {art === "puffer" ? (
                  <>
                    <FormField label={`${t("toepfe.feldSchaetzbetrag")} ${geld.symbol}`} required>
                      <input className="field" inputMode="decimal" value={schaetzbetrag} onChange={(e) => setSchaetzbetrag(e.target.value)} placeholder={t("toepfe.platzhalterSchaetzbetrag")} />
                    </FormField>
                    <FormField label={t("toepfe.feldZeitfenster")} required>
                      <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="12" />
                    </FormField>
                  </>
                ) : (
                  <>
                    <FormField label={`${t("toepfe.feldZufuehrung")} ${geld.symbol}`} required>
                      <input className="field" inputMode="decimal" value={zufuehrung} onChange={(e) => setZufuehrung(e.target.value)} placeholder={t("toepfe.platzhalterZufuehrung")} />
                    </FormField>
                    <FormField label={`${t("toepfe.feldSparziel")} ${geld.symbol}`} hint={t("toepfe.feldSparzielHinweis")}>
                      <input className="field" inputMode="decimal" value={sparziel} onChange={(e) => setSparziel(e.target.value)} placeholder={t("toepfe.platzhalterSparziel")} />
                    </FormField>
                  </>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {entTopf && (
        <Modal
          title={t("toepfe.modalEntnehmen")}
          subtitle={`${entTopf.bezeichnung} · ${t("toepfe.entnahmeUntertitel")}`}
          onClose={() => setEntTopf(null)}
          footer={
            <>
              <Button variant="primary" onClick={entnehmenSpeichern}>{t("toepfe.speichern")}</Button>
              <button className="linkbtn" onClick={() => setEntTopf(null)}>{t("toepfe.abbrechen")}</button>
              {entFehler && <span className="err">{entFehler}</span>}
            </>
          }
        >
          {konten.length === 0 ? (
            <div className="muted">{t("toepfe.keinKonto")}</div>
          ) : (
            <div className="form-grid">
              <FormField label={t("toepfe.feldKonto")} required>
                <select className="field" value={entKonto} onChange={(e) => setEntKonto(e.target.value)}>
                  {konten.map((k) => (
                    <option key={k.id} value={k.id}>{k.bezeichnung}</option>
                  ))}
                </select>
              </FormField>
              <FormField label={t("toepfe.feldDatum")}>
                <input className="field" type="date" value={entDatum} onChange={(e) => setEntDatum(e.target.value)} />
              </FormField>
              <FormField label={`${t("toepfe.feldBetrag")} ${geld.symbol}`} required>
                <input className="field" inputMode="decimal" value={entBetrag} onChange={(e) => setEntBetrag(e.target.value)} placeholder={geld.format(0)} />
              </FormField>
              <FormField label={t("toepfe.feldNotiz")}>
                <input className="field" value={entNotiz} onChange={(e) => setEntNotiz(e.target.value)} placeholder={t("toepfe.notizPlatzhalter")} />
              </FormField>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
