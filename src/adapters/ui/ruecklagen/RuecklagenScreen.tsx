// Rücklagen — was du für etwas zurücklegst, das noch kommt.
//
// Hiess bis 2026-08-31 „Inventar" und meinte einen Gegenstand. Die Rechnung ist
// geblieben, die Behauptung ist weg, dass am anderen Ende ein Ding steht: eine Rücklage
// hat entweder ZIEL UND FRIST (dann rechnet sie sich, hat einen Fortschritt und fängt
// nach dem Ausbuchen von vorn an) oder eine freie RATE (dann läuft sie ohne Deckel und
// ist nach dem Ausbuchen erledigt).
//
// REIN KALKULATORISCH (2026-08-16): Was TATSÄCHLICH da ist, kommt nicht aus Buchungen,
// sondern aus dem realen Stand des Kontos, das die Rücklage benennt: liegen dort 60 %
// der rechnerischen Summe, ist jede Rücklage darauf zu 60 % gedeckt (anteilig, ohne
// Rangfolge). Auch „Ausgebucht" bucht nichts — der Kauf ist eine normale Ausgabe und
// senkt den Kontostand ohnehin.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  hatZiel,
  minorZuMajor,
  monatsRuecklage,
  type Ruecklage,
  type RuecklagenDeckung,
  type Ruecklagenfluss,
  type Ruecklagensicht,
} from "../../../application";
import {
  ruecklageAktualisieren,
  ruecklageAnlegen,
  ruecklageAusbuchen,
  ruecklageLoeschen,
  ruecklagen as ruecklagenLaden,
} from "../../dienste";
import { Button, Card, CoverageTrack, FormField, KPIStat, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { PageHead } from "../bausteine/PageHead";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { betont } from "../bausteine/betonung";
import { Modal } from "../bausteine/Modal";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_DECKUNG: RuecklagenDeckung = { posten: [], soll: 0, sollMitKonto: 0, tatsaechlich: 0, grad: 100 };
const LEERE_LISTE: readonly never[] = [];
const LEERER_FLUSS: Ruecklagenfluss = { bedarf: 0, plan: 0, ist: 0, posten: [] };

/** Die beiden Formen einer Rücklage — die Wahl im Dialog, nicht im Datenmodell. */
type Form = "ziel" | "rate";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function RuecklagenScreen() {
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Ruecklagensicht | null>(null);

  // Anlegen/Bearbeiten
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>("ziel");
  const [bezeichnung, setBezeichnung] = useState("");
  const [ziel, setZiel] = useState("");
  const [fristMonate, setFristMonate] = useState("");
  const [rate, setRate] = useState("");
  const [beginn, setBeginn] = useState(heute);
  const [kontoId, setKontoId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  // Ausbuchen
  const [ausItem, setAusItem] = useState<Ruecklage | null>(null);
  const [ausDatum, setAusDatum] = useState(heute);
  const [ausBetrag, setAusBetrag] = useState("");
  const [ausBuchungId, setAusBuchungId] = useState("");
  const [ausZiel, setAusZiel] = useState("");
  const [ausFehler, setAusFehler] = useState<string | null>(null);

  // Verwandte Repos in EINEM Zug laden und zusammen setzen: gestaffelte setState lassen
  // die Deckung kurz gegen eine leere Kontenliste rechnen (jeder Stand wäre dann 0).
  async function laden() {
    setSicht(await ruecklagenLaden(heute));
  }
  useEffect(() => {
    laden();
  }, []);

  const items = sicht?.ruecklagen ?? LEERE_LISTE;
  const konten = sicht?.konten ?? LEERE_LISTE;
  const kontoName = sicht?.kontoNamen ?? LEERE_NAMEN;
  const deckung = sicht?.deckung ?? LEERE_DECKUNG;
  const proMonat = sicht?.proMonat ?? 0;
  const zielwert = sicht?.zielwert ?? 0;
  const mindest = sicht?.mindest ?? 0;
  const buchungswahl = sicht?.buchungswahl ?? LEERE_LISTE;
  const fluss = sicht?.fluss ?? LEERER_FLUSS;

  function neu() {
    setEditId(null);
    setForm("ziel");
    setBezeichnung("");
    setZiel("");
    setFristMonate("");
    setRate("");
    setBeginn(heute);
    setKontoId("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(r: Ruecklage) {
    neu();
    setEditId(r.id);
    setForm(hatZiel(r) ? "ziel" : "rate");
    setBezeichnung(r.bezeichnung);
    setZiel(r.ziel == null ? "" : String(minorZuMajor(r.ziel, geld.waehrung)));
    setFristMonate(r.fristMonate == null ? "" : String(r.fristMonate));
    setRate(r.rate == null ? "" : String(minorZuMajor(r.rate, geld.waehrung)));
    setBeginn(r.beginn);
    setKontoId(r.kontoId ?? "");
  }
  async function speichern() {
    setFehler(null);
    // Nur die Felder DER GEWÄHLTEN FORM gehen mit. Sonst schickte ein Formularwechsel
    // beides los, und der Use-Case wiese es als Widerspruch ab — mit einer Meldung über
    // ein Feld, das gerade gar nicht zu sehen ist.
    const eingabe = {
      bezeichnung,
      ziel: form === "ziel" ? (geld.parse(ziel) ?? 0) : undefined,
      fristMonate: form === "ziel" ? Number(fristMonate) || 0 : undefined,
      rate: form === "rate" ? (geld.parse(rate) ?? 0) : undefined,
      beginn,
      kontoId: kontoId || undefined,
    };
    try {
      if (editId) await ruecklageAktualisieren(editId, eingabe);
      else await ruecklageAnlegen(eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  function ausbuchenOeffnen(r: Ruecklage) {
    setAusItem(r);
    setAusDatum(heute);
    setAusBetrag("");
    setAusBuchungId("");
    setAusZiel(r.ziel == null ? "" : String(minorZuMajor(r.ziel, geld.waehrung)));
    setAusFehler(null);
  }
  async function ausbuchenSpeichern() {
    if (!ausItem) return;
    setAusFehler(null);
    try {
      await ruecklageAusbuchen(ausItem, {
        datum: ausDatum,
        betrag: geld.parse(ausBetrag) ?? undefined,
        istbuchungId: ausBuchungId || undefined,
        ziel: hatZiel(ausItem) ? (geld.parse(ausZiel) ?? undefined) : undefined,
      });
      setAusItem(null);
      await laden();
    } catch (e) {
      setAusFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("ruecklagen.titel")}
        subtitle={t("ruecklagen.untertitel")}
        action={<Button variant="primary" plus onClick={neu}>{t("ruecklagen.ruecklage")}</Button>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        <Trans i18nKey="ruecklagen.erklaerung" components={betont} />
      </p>

      {items.length > 0 && (
        <div className="kpis">
          <KPIStat size="chip" label={t("ruecklagen.kpiAnzahl")} value={String(items.length)} />
          <KPIStat size="chip" label={t("ruecklagen.kpiZielwert")} value={geld.format(zielwert)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("ruecklagen.kpiProMonat")} value={geld.format(proMonat)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("ruecklagen.kpiSoll")} value={geld.format(deckung.soll)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("ruecklagen.kpiTatsaechlich")} value={geld.format(deckung.tatsaechlich)} unit={geld.symbol} tone="ok" />
          <KPIStat size="chip" label={t("ruecklagen.kpiDeckung")} value={String(deckung.grad)} unit="%" tone={deckung.grad < 50 ? "warn" : "default"} />
        </div>
      )}

      {/* Drei Zahlen, nicht eine — und das ist der ganze Nutzen dieser Karte:
          BEDARF verlangt die Rechnung, PLAN hast du eingerichtet, IST ist geflossen.
          Bedarf über Plan heisst „du legst zu wenig zurück"; Plan über Ist heisst „die
          Überweisung ist ausgefallen". Eine Zahl allein könnte keine der beiden Aussagen
          treffen. */}
      {(fluss.bedarf > 0 || fluss.plan > 0 || fluss.ist !== 0) && (
        <Card title={t("ruecklagen.flussTitel")} subtitle={t("ruecklagen.flussUntertitel")}>
          <div className="kpis">
            <KPIStat size="chip" label={t("ruecklagen.flussBedarf")} value={geld.format(fluss.bedarf)} unit={geld.symbol} />
            <KPIStat
              size="chip"
              label={t("ruecklagen.flussPlan")}
              value={geld.format(fluss.plan)}
              unit={geld.symbol}
              tone={fluss.plan < fluss.bedarf ? "warn" : "default"}
            />
            <KPIStat
              size="chip"
              label={t("ruecklagen.flussIst")}
              value={geld.format(fluss.ist)}
              unit={geld.symbol}
              tone={fluss.ist >= fluss.plan && fluss.plan > 0 ? "ok" : "default"}
            />
          </div>
          {fluss.plan === 0 && fluss.bedarf > 0 && (
            <div className="muted" style={{ fontSize: "var(--fs-small)", marginTop: "var(--sp-2)" }}>
              {t("ruecklagen.flussOhnePlan")}
            </div>
          )}
        </Card>
      )}

      {/* Die Faustformel steht für sich und nicht bei den Kennzahlen darüber: die messen
          die Rücklagen, die es GIBT, sie nennt einen Betrag, den es geben sollte. In
          einer Reihe mit den anderen sähe sie aus wie eine Vorgabe, an der etwas
          gemessen wird — nichts im Programm misst daran. */}
      {mindest > 0 && (
        <Card title={t("ruecklagen.mindestTitel")}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-h2)", fontWeight: "var(--fw-bold)" }}>
              {geld.format(mindest)} {geld.symbol}
            </span>
            <span className="muted" style={{ fontSize: "var(--fs-small)" }}>
              {t("ruecklagen.mindestHerleitung", { einnahmen: geld.format(sicht?.vertragseinnahmen ?? 0) })}
            </span>
          </div>
        </Card>
      )}

      {items.length > 0 && deckung.sollMitKonto === 0 && (
        // Ohne Kontozuordnung gibt es nur die Rechnung. Das einmal sagen, statt überall
        // ein „—" zu zeigen, hinter dem man einen Fehler vermutet.
        <div className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-3)" }}>
          {t("ruecklagen.hinweisOhneKonto")}
        </div>
      )}

      <Card>
        {items.length === 0 ? (
          <div className="muted">{t("ruecklagen.leer")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {deckung.posten.map((p, idx) => {
              const r = p.ruecklage;
              const mitZiel = hatZiel(r);
              return (
                // Trennlinie ab der zweiten Rücklage: zwei Balken je Posten sehen sonst
                // aus wie vier Balken eines Postens — der Abstand allein trennt zu schwach.
                <div
                  key={r.id}
                  style={idx > 0 ? { borderTop: "1px solid var(--line)", paddingTop: "var(--sp-5)" } : undefined}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: "var(--sp-3)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {r.bezeichnung}
                      {!mitZiel && <> <Pill variant="um">{t("ruecklagen.pillFrei")}</Pill></>}
                      {!r.kontoId && <> <Pill variant="neutral">{t("ruecklagen.pillNurRechnung")}</Pill></>}
                    </span>
                    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      {t("ruecklagen.rate")} {geld.format(monatsRuecklage(r))} {geld.symbol}{t("ruecklagen.proMonatSuffix")}
                      <IconLeiste>
                        <IconButton icon="uebernehmen" label={t("ruecklagen.ausbuchen")} onClick={() => ausbuchenOeffnen(r)} />
                        <IconButton icon="bearbeiten" label={t("ruecklagen.bearbeiten")} onClick={() => bearbeiten(r)} />
                        <IconButton icon="loeschen" ton="gefahr" label={t("ruecklagen.loeschen")} onClick={() => loeschfrage.stellen({
                            name: r.bezeichnung,
                            folgen: t("ruecklagen.loeschenFolgen"),
                            ausfuehren: async () => { await ruecklageLoeschen(r.id); await laden(); },
                          })} />
                      </IconLeiste>
                    </span>
                  </div>

                  {/* Die Rechnung: wie weit die Ansparung fortgeschritten ist.
                      Der Balken bekommt die CENT-Werte direkt: er rechnet nur ein
                      Verhältnis, und die Umrechnung in Euro kürzte sich darin ohnehin weg.

                      NUR MIT ZIEL. Eine freie Rücklage hat keinen Nenner — ein Balken
                      bräuchte einen erfundenen, und jeder erfundene erzählte etwas
                      Falsches: gegen ihr eigenes Soll gemessen stünde sie ewig bei
                      100 %, gegen irgendetwas anderes bei einer Zahl ohne Bedeutung. */}
                  {mitZiel ? (
                    <CoverageTrack
                      value={p.soll}
                      max={r.ziel as number}
                      label={t("ruecklagen.fortschrittLabel")}
                      right={`${geld.format(p.soll)} / ${geld.format(r.ziel as number)} ${geld.symbol}`}
                    />
                  ) : (
                    <div className="muted" style={{ fontSize: "var(--fs-small)" }}>
                      {t("ruecklagen.freiAufgelaufen", { betrag: `${geld.format(p.soll)} ${geld.symbol}` })}
                    </div>
                  )}

                  {/* Die Wirklichkeit: nur, wenn ein Konto benannt ist.
                      Bezugsgröße ist mit Ziel das ZIEL und ohne Ziel das aufgelaufene
                      Soll — derselbe Maßstab wie beim Balken darüber. Die Warnfarbe
                      bleibt am Soll: darunter liegt man zurück. */}
                  {p.tatsaechlich != null && (
                    <div style={{ marginTop: 6 }}>
                      <CoverageTrack
                        value={p.tatsaechlich}
                        max={Math.max(1, mitZiel ? (r.ziel as number) : p.soll)}
                        over={p.tatsaechlich < p.soll}
                        label={t("ruecklagen.gedecktDurch", { konto: kontoName.get(r.kontoId!) ?? "?" })}
                        right={`${geld.format(p.tatsaechlich)} / ${geld.format(mitZiel ? (r.ziel as number) : p.soll)} ${geld.symbol}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Was schon gebraucht wurde. Steht unter der Liste und nicht daneben: es ist ein
          Nachschlagen und kein Überblick — wer den Bereich öffnet, will wissen, wie er
          gerade dasteht. */}
      {(sicht?.ausbuchungen.length ?? 0) > 0 && (
        <Card title={t("ruecklagen.ausbuchungenTitel")} subtitle={t("ruecklagen.ausbuchungenUntertitel")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {sicht?.ausbuchungen.map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                <span>
                  {a.datum} · {items.find((r) => r.id === a.ruecklageId)?.bezeichnung ?? t("ruecklagen.ausgebuchtWeg")}
                </span>
                <span className="muted">
                  {geld.format(a.betrag)} {geld.symbol}
                  {a.istbuchungId && <> · {t("ruecklagen.mitBuchung")}</>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {offen && (
        <Modal
          title={editId ? t("ruecklagen.modalBearbeiten") : t("ruecklagen.modalAnlegen")}
          subtitle={t("ruecklagen.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("ruecklagen.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("ruecklagen.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("ruecklagen.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("ruecklagen.feldBezeichnungPlatzhalter")} />
            </FormField>

            {/* Die Form ist eine Wahl mit zwei sichtbaren Möglichkeiten und kein
                Kästchen: „hat ein Ziel" beantwortet die Frage nur in einer Richtung,
                und die andere Form müsste man erraten. */}
            <FormField label={t("ruecklagen.feldForm")} hint={t(`ruecklagen.formHinweis.${form}`)}>
              <Auswahl
                ariaLabel={t("ruecklagen.feldForm")}
                wert={form}
                aufAenderung={(v) => setForm(v as Form)}
                optionen={[
                  { wert: "ziel", text: t("ruecklagen.form.ziel") },
                  { wert: "rate", text: t("ruecklagen.form.rate") },
                ]}
              />
            </FormField>

            {form === "ziel" ? (
              <>
                <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} required hint={t("ruecklagen.feldZielHinweis")}>
                  <input className="field" inputMode="decimal" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder={geld.format(0)} />
                </FormField>
                <FormField label={t("ruecklagen.feldFrist")} required hint={t("ruecklagen.feldFristHinweis")}>
                  <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="96" />
                </FormField>
              </>
            ) : (
              <FormField label={`${t("ruecklagen.feldRate")} ${geld.symbol}`} required hint={t("ruecklagen.feldRateHinweis")}>
                <input className="field" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={geld.format(0)} />
              </FormField>
            )}

            <FormField label={t("ruecklagen.feldBeginn")}>
              <Datumsfeld ariaLabel={t("ruecklagen.feldBeginn")} wert={beginn} aufAenderung={setBeginn} />
            </FormField>
            <FormField label={t("ruecklagen.feldKonto")} hint={t("ruecklagen.feldKontoHinweis")}>
              <Auswahl
                ariaLabel={t("ruecklagen.feldKonto")}
                wert={kontoId}
                aufAenderung={setKontoId}
                optionen={[{ wert: "", text: t("ruecklagen.kontoKeins") }, ...konten.map((k) => ({ wert: k.id, text: k.bezeichnung }))]}
              />
            </FormField>
          </div>
        </Modal>
      )}

      {ausItem && (
        <Modal
          title={t("ruecklagen.modalAusbuchen")}
          subtitle={`${ausItem.bezeichnung} · ${t(hatZiel(ausItem) ? "ruecklagen.ausbuchenNeustart" : "ruecklagen.ausbuchenEnde")}`}
          onClose={() => setAusItem(null)}
          footer={<><Button variant="primary" onClick={ausbuchenSpeichern}>{t("ruecklagen.speichern")}</Button><button className="linkbtn" onClick={() => setAusItem(null)}>{t("ruecklagen.abbrechen")}</button>{ausFehler && <span className="err">{ausFehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("ruecklagen.feldAusDatum")} required>
              <Datumsfeld ariaLabel={t("ruecklagen.feldAusDatum")} wert={ausDatum} aufAenderung={setAusDatum} />
            </FormField>
            <FormField label={`${t("ruecklagen.feldAusBetrag")} ${geld.symbol}`}>
              <input className="field" inputMode="decimal" value={ausBetrag} onChange={(e) => setAusBetrag(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
            {/* Die Verknüpfung leistet zweierlei: sie hält fest, wofür die Rücklage
                draufging, UND sie nimmt die Ausgabe aus der Budgetbewertung. Deshalb
                steht der zweite Teil im Hinweis — sonst überrascht er später. */}
            <FormField label={t("ruecklagen.feldAusBuchung")} hint={t("ruecklagen.feldAusBuchungHinweis")}>
              <Auswahl
                ariaLabel={t("ruecklagen.feldAusBuchung")}
                wert={ausBuchungId}
                aufAenderung={setAusBuchungId}
                optionen={[
                  { wert: "", text: t("ruecklagen.buchungKeine") },
                  ...buchungswahl.map((b) => ({
                    wert: b.id,
                    text: `${b.datum} · ${geld.format(b.betrag)} ${geld.symbol}${b.bezeichnung ? ` · ${b.bezeichnung}` : ""}`,
                  })),
                ]}
              />
            </FormField>
            {hatZiel(ausItem) && (
              <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} hint={t("ruecklagen.feldNeuesZielHinweis")}>
                <input className="field" inputMode="decimal" value={ausZiel} onChange={(e) => setAusZiel(e.target.value)} placeholder={geld.format(0)} />
              </FormField>
            )}
          </div>
        </Modal>
      )}
      {loeschfrage.dialog}

    </div>
  );
}
