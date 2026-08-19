// Inventar — deine Gegenstände und die Rücklage, die sie jeden Monat kosten.
//
// REIN KALKULATORISCH (2026-08-16): Der frühere Ersatz-Topf ist entfallen. Der Gegenstand
// rechnet selbst (Wiederbeschaffung ÷ Nutzungsdauer), und was davon TATSÄCHLICH da ist,
// kommt nicht aus Buchungen, sondern aus dem realen Stand des Kontos, das der Gegenstand
// benennt: liegen dort 60 % der rechnerischen Summe, ist jeder Gegenstand darauf zu 60 %
// gedeckt (anteilig, ohne Rangfolge). „Ersetzt" bucht nichts mehr — es startet nur den
// Zyklus neu; der Kauf selbst ist eine normale Ausgabe und senkt den Kontostand ohnehin.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  centZuEuro,
  minorZuMajor,
  monatsRuecklage,
  realerKontostand,
  ruecklagenDeckung,
  type Inventargegenstand,
  type IstBuchung,
  type Zahlungskonto,
} from "../../core";
import {
  inventarAktualisieren,
  inventarAnlegen,
  inventarErsetzt,
  inventarLoeschen,
} from "../../application/inventarAnlegen";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, FormField, KPIStat, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { IconButton, IconLeiste } from "./IconButton";
import { betont } from "./betonung";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function InventarScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [items, setItems] = useState<Inventargegenstand[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);

  // Anlegen/Bearbeiten
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [wiederbeschaffung, setWiederbeschaffung] = useState("");
  const [nutzungsdauerMonate, setNutzungsdauerMonate] = useState("");
  const [anschaffung, setAnschaffung] = useState(heute);
  const [kontoId, setKontoId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  // Ersetzt-Dialog
  const [ersItem, setErsItem] = useState<Inventargegenstand | null>(null);
  const [ersDatum, setErsDatum] = useState(heute);
  const [ersWert, setErsWert] = useState("");
  const [ersFehler, setErsFehler] = useState<string | null>(null);

  // Verwandte Repos in EINEM Zug laden und zusammen setzen: gestaffelte setState lassen
  // die Deckung kurz gegen eine leere Kontenliste rechnen (jeder Stand wäre dann 0).
  async function laden() {
    const [i, b, k] = await Promise.all([inventarRepo.alle(), ledgerRepo.alle(), kontoRepo.alle()]);
    setItems(i);
    setIst(b);
    setKonten(k);
  }
  useEffect(() => {
    laden();
  }, []);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const kontostaende = useMemo(
    () => new Map(konten.map((k) => [k.id, realerKontostand(k, ist)])),
    [konten, ist],
  );
  const deckung = useMemo(
    () => ruecklagenDeckung(items, heute, kontostaende),
    [items, heute, kontostaende],
  );
  const proMonat = useMemo(() => items.reduce((s, g) => s + monatsRuecklage(g), 0), [items]);
  const ersatzwert = useMemo(() => items.reduce((s, g) => s + g.wiederbeschaffung, 0), [items]);

  function neu() {
    setEditId(null);
    setBezeichnung("");
    setWiederbeschaffung("");
    setNutzungsdauerMonate("");
    setAnschaffung(heute);
    setKontoId("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(g: Inventargegenstand) {
    setEditId(g.id);
    setBezeichnung(g.bezeichnung);
    setWiederbeschaffung(String(minorZuMajor(g.wiederbeschaffung, geld.waehrung)));
    setNutzungsdauerMonate(String(g.nutzungsdauerMonate));
    setAnschaffung(g.anschaffung);
    setKontoId(g.kontoId ?? "");
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    const eingabe = {
      bezeichnung,
      wiederbeschaffung: geld.parse(wiederbeschaffung) ?? 0,
      nutzungsdauerMonate: Number(nutzungsdauerMonate) || 0,
      anschaffung,
      kontoId: kontoId || undefined,
    };
    try {
      if (editId) await inventarAktualisieren(inventarRepo, editId, eingabe);
      else await inventarAnlegen(inventarRepo, eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  function ersetztOeffnen(g: Inventargegenstand) {
    setErsItem(g);
    setErsDatum(heute);
    setErsWert(String(minorZuMajor(g.wiederbeschaffung, geld.waehrung)));
    setErsFehler(null);
  }
  async function ersetztSpeichern() {
    if (!ersItem) return;
    setErsFehler(null);
    try {
      await inventarErsetzt(inventarRepo, ersItem, ersDatum, geld.parse(ersWert) ?? undefined);
      setErsItem(null);
      await laden();
    } catch (e) {
      setErsFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("inventar.titel")}
        subtitle={t("inventar.untertitel")}
        action={<Button variant="primary" plus onClick={neu}>{t("inventar.gegenstand")}</Button>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        <Trans i18nKey="inventar.erklaerung" components={betont} />
      </p>

      {items.length > 0 && (
        <div className="kpis">
          <KPIStat size="chip" label={t("inventar.kpiAnzahl")} value={String(items.length)} />
          <KPIStat size="chip" label={t("inventar.kpiErsatzwert")} value={geld.format(ersatzwert)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("inventar.kpiProMonat")} value={geld.format(proMonat)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("inventar.kpiSoll")} value={geld.format(deckung.soll)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("inventar.kpiTatsaechlich")} value={geld.format(deckung.tatsaechlich)} unit={geld.symbol} tone="ok" />
          <KPIStat size="chip" label={t("inventar.kpiDeckung")} value={String(deckung.grad)} unit="%" tone={deckung.grad < 50 ? "warn" : "default"} />
        </div>
      )}

      {items.length > 0 && deckung.sollMitKonto === 0 && (
        // Ohne Kontozuordnung gibt es nur die Rechnung. Das einmal sagen, statt überall
        // ein „—" zu zeigen, hinter dem man einen Fehler vermutet.
        <div className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-3)" }}>
          {t("inventar.hinweisOhneKonto")}
        </div>
      )}

      <Card>
        {items.length === 0 ? (
          <div className="muted">{t("inventar.leer")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {deckung.posten.map((p, idx) => {
              const g = p.gegenstand;
              return (
                // Trennlinie ab dem zweiten Gegenstand: zwei Balken je Posten sehen sonst
                // aus wie vier Balken eines Postens — der Abstand allein trennt zu schwach.
                <div
                  key={g.id}
                  style={idx > 0 ? { borderTop: "1px solid var(--line)", paddingTop: "var(--sp-5)" } : undefined}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: "var(--sp-3)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {g.bezeichnung}
                      {!g.kontoId && <> <Pill variant="neutral">{t("inventar.pillNurRechnung")}</Pill></>}
                    </span>
                    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      {t("inventar.ruecklage")} {geld.format(monatsRuecklage(g))} {geld.symbol}{t("inventar.proMonatSuffix")}
                      <IconLeiste>
                        <IconButton icon="uebernehmen" label={t("inventar.ersetzt")} onClick={() => ersetztOeffnen(g)} />
                        <IconButton icon="bearbeiten" label={t("inventar.bearbeiten")} onClick={() => bearbeiten(g)} />
                        <IconButton icon="loeschen" ton="gefahr" label={t("inventar.loeschen")} onClick={() => void inventarLoeschen(inventarRepo, g.id).then(laden)} />
                      </IconLeiste>
                    </span>
                  </div>

                  {/* Die Rechnung: wie weit die Abschreibung fortgeschritten ist. */}
                  <CoverageTrack
                    value={centZuEuro(p.soll)}
                    max={centZuEuro(g.wiederbeschaffung)}
                    label={t("inventar.fortschrittLabel")}
                    right={`${geld.format(p.soll)} / ${geld.format(g.wiederbeschaffung)} ${geld.symbol}`}
                  />

                  {/* Die Wirklichkeit: nur, wenn ein Konto benannt ist.
                      Bezugsgröße ist die WIEDERBESCHAFFUNG, nicht das rechnerische Soll —
                      derselbe Maßstab wie beim Balken darüber. Gegen das Soll gemessen
                      sagte „davon da" nur, wie weit man dem eigenen Sparplan folgt; gegen
                      die Wiederbeschaffung sagt es, wie weit das Geld für den Ersatz da
                      ist. Die Warnfarbe bleibt am Soll: darunter liegt man zurück. */}
                  {p.tatsaechlich != null && (
                    <div style={{ marginTop: 6 }}>
                      <CoverageTrack
                        value={centZuEuro(p.tatsaechlich)}
                        max={centZuEuro(Math.max(1, g.wiederbeschaffung))}
                        over={p.tatsaechlich < p.soll}
                        label={t("inventar.gedecktDurch", { konto: kontoName.get(g.kontoId!) ?? "?" })}
                        right={`${geld.format(p.tatsaechlich)} / ${geld.format(g.wiederbeschaffung)} ${geld.symbol}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? t("inventar.modalBearbeiten") : t("inventar.modalAnlegen")}
          subtitle={t("inventar.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("inventar.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("inventar.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("inventar.feldGegenstand")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("inventar.feldGegenstandPlatzhalter")} />
            </FormField>
            <FormField label={t("inventar.feldWiederbeschaffung")} required>
              <input className="field" inputMode="decimal" value={wiederbeschaffung} onChange={(e) => setWiederbeschaffung(e.target.value)} placeholder={t("inventar.feldWiederbeschaffungPlatzhalter")} />
            </FormField>
            <FormField label={t("inventar.feldNutzungsdauer")} required hint={t("inventar.feldNutzungsdauerHinweis")}>
              <input className="field" inputMode="numeric" value={nutzungsdauerMonate} onChange={(e) => setNutzungsdauerMonate(e.target.value)} placeholder="96" />
            </FormField>
            <FormField label={t("inventar.feldAnschaffung")}>
              <input className="field" type="date" value={anschaffung} onChange={(e) => setAnschaffung(e.target.value)} />
            </FormField>
            <FormField label={t("inventar.feldKonto")} hint={t("inventar.feldKontoHinweis")}>
              <select className="field" value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
                <option value="">{t("inventar.kontoKeins")}</option>
                {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
              </select>
            </FormField>
          </div>
        </Modal>
      )}

      {ersItem && (
        <Modal
          title={t("inventar.modalErsetzt")}
          subtitle={`${ersItem.bezeichnung} · ${t("inventar.ersetztUntertitel")}`}
          onClose={() => setErsItem(null)}
          footer={<><Button variant="primary" onClick={ersetztSpeichern}>{t("inventar.speichern")}</Button><button className="linkbtn" onClick={() => setErsItem(null)}>{t("inventar.abbrechen")}</button>{ersFehler && <span className="err">{ersFehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("inventar.feldAnschaffung")} required>
              <input className="field" type="date" value={ersDatum} onChange={(e) => setErsDatum(e.target.value)} />
            </FormField>
            <FormField label={`${t("inventar.feldWiederbeschaffung")} ${geld.symbol}`} required hint={t("inventar.feldNeuwertHinweis")}>
              <input className="field" inputMode="decimal" value={ersWert} onChange={(e) => setErsWert(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
