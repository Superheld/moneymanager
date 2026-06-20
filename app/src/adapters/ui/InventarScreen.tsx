// Inventar — deine Gegenstände, für deren Ersatz du automatisch ansparst (Ersatz-Fall).
// Eigener Bereich, getrennt von den Töpfen (die nur Puffer + Spartopf sind). Ein
// Gegenstand legt beim Anlegen direkt seinen Ersatz-Topf mit an; die Liste zeigt den
// Ansparfortschritt.
//
// Realer Stand seit ADR-0003: kalkulatorischer Aufbau − reale Entnahmen. „ersetzt" bucht
// die Entnahme (Umschichtung, gedeckte Auflösung der Rücklage) UND startet die
// Abschreibung neu (Topf.start + Inventar.anschaffung wandern auf den Anschaffungstag).

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ansparrate,
  centZuEuro,
  minorZuMajor,
  topfBuchungen,
  topfStand,
  zielwert,
  type Ersatztopf,
  type Inventargegenstand,
  type IstBuchung,
  type Topf,
  type Zahlungskonto,
} from "../../core";
import { inventarAktualisieren, inventarLoeschen, inventarMitTopfAnlegen } from "../../application/inventarAnlegen";
import { ersatzErsetzt } from "../../application/topfEntnahme";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, FormField, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function InventarScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [items, setItems] = useState<Inventargegenstand[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);

  // Ersetzt-Modal
  const [ersTopf, setErsTopf] = useState<Ersatztopf | null>(null);
  const [ersKonto, setErsKonto] = useState("");
  const [ersDatum, setErsDatum] = useState(heute);
  const [ersBetrag, setErsBetrag] = useState("");
  const [ersNotiz, setErsNotiz] = useState("");
  const [ersFehler, setErsFehler] = useState<string | null>(null);

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [wiederbeschaffung, setWiederbeschaffung] = useState("");
  const [nutzungsdauerMonate, setNutzungsdauerMonate] = useState("");
  const [anschaffung, setAnschaffung] = useState(heute);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setItems(await inventarRepo.alle());
    setToepfe(await topfRepo.alle());
    setIst(await ledgerRepo.alle());
    setKonten(await kontoRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  function ersetztOeffnen(topf: Ersatztopf) {
    setErsTopf(topf);
    setErsKonto(konten[0]?.id ?? "");
    setErsDatum(heute);
    setErsBetrag(String(minorZuMajor(topf.wiederbeschaffung, geld.waehrung)));
    setErsNotiz("");
    setErsFehler(null);
  }
  async function ersetztSpeichern() {
    if (!ersTopf) return;
    setErsFehler(null);
    try {
      await ersatzErsetzt(ledgerRepo, topfRepo, inventarRepo, {
        topf: ersTopf,
        kontoId: ersKonto,
        datum: ersDatum,
        betrag: geld.parse(ersBetrag) ?? 0,
        notiz: ersNotiz,
      });
      setErsTopf(null);
      await laden();
    } catch (e) {
      setErsFehler(fehlerNachricht(t, e));
    }
  }

  // Ersatz-Topf je Gegenstand (für den Ansparfortschritt).
  const topfZuItem = useMemo(() => {
    const m = new Map<string, Ersatztopf>();
    for (const t of toepfe) if (t.typ === "ersatz" && t.inventarId) m.set(t.inventarId, t);
    return m;
  }, [toepfe]);

  function neu() {
    setEditId(null);
    setBezeichnung("");
    setWiederbeschaffung("");
    setNutzungsdauerMonate("");
    setAnschaffung(heute);
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(g: Inventargegenstand) {
    setEditId(g.id);
    setBezeichnung(g.bezeichnung);
    setWiederbeschaffung(String(minorZuMajor(g.wiederbeschaffung, geld.waehrung)));
    setNutzungsdauerMonate(String(g.nutzungsdauerMonate));
    setAnschaffung(g.anschaffung);
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
    };
    try {
      if (editId) await inventarAktualisieren(inventarRepo, topfRepo, editId, eingabe);
      else await inventarMitTopfAnlegen(inventarRepo, topfRepo, eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
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
        <Trans i18nKey="inventar.erklaerung" components={{ b: <b style={{ color: "var(--ink)" }} /> }} />
      </p>

      <Card>
        {items.length === 0 ? (
          <div className="muted">{t("inventar.leer")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {items.map((g) => {
              const topf = topfZuItem.get(g.id);
              const ziel = topf ? zielwert(topf) : null;
              const stand = topf ? topfStand(topf, heute, topfBuchungen(ist, topf.id)) : null;
              const ueberzogen = stand != null && stand < 0;
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {g.bezeichnung}
                      {ueberzogen && <> <Pill variant="warn">{t("inventar.ueberzogen")}</Pill></>}
                    </span>
                    <span className="muted">
                      {topf ? `${t("inventar.ansparrate")} ${geld.format(ansparrate(topf))} ${geld.symbol}${t("inventar.proMonatSuffix")}` : t("inventar.keinErsatzTopf")}
                      {topf && <>{"  ·  "}<button className="linkbtn" onClick={() => ersetztOeffnen(topf)}>{t("inventar.ersetzt")}</button></>}
                      {"  ·  "}
                      <button className="linkbtn" onClick={() => bearbeiten(g)}>{t("inventar.bearbeiten")}</button>{"  ·  "}
                      <button className="linkbtn" onClick={() => inventarLoeschen(inventarRepo, topfRepo, g.id).then(laden)}>{t("inventar.loeschen")}</button>
                    </span>
                  </div>
                  {ziel != null && stand != null ? (
                    <CoverageTrack value={centZuEuro(Math.max(0, stand))} max={centZuEuro(ziel)} label={t("inventar.fortschrittLabel")} right={`${geld.format(stand)} / ${geld.format(ziel)} ${geld.symbol}`} />
                  ) : (
                    <div className="muted">{t("inventar.nutzungsdauer")} {g.nutzungsdauerMonate} {t("inventar.monate")} · {t("inventar.wiederbeschaffung")} {geld.format(g.wiederbeschaffung)} {geld.symbol}</div>
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
              <input className="field" inputMode="decimal" value={wiederbeschaffung} onChange={(e) => setWiederbeschaffung(e.target.value)} placeholder="z. B. 14400" />
            </FormField>
            <FormField label={t("inventar.feldNutzungsdauer")} required hint={t("inventar.feldNutzungsdauerHinweis")}>
              <input className="field" inputMode="numeric" value={nutzungsdauerMonate} onChange={(e) => setNutzungsdauerMonate(e.target.value)} placeholder="96" />
            </FormField>
            <FormField label={t("inventar.feldAnschaffung")}>
              <input className="field" type="date" value={anschaffung} onChange={(e) => setAnschaffung(e.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}

      {ersTopf && (
        <Modal
          title={t("inventar.modalErsetzt")}
          subtitle={`${ersTopf.bezeichnung} · ${t("inventar.ersetztUntertitel")}`}
          onClose={() => setErsTopf(null)}
          footer={<><Button variant="primary" onClick={ersetztSpeichern}>{t("inventar.speichern")}</Button><button className="linkbtn" onClick={() => setErsTopf(null)}>{t("inventar.abbrechen")}</button>{ersFehler && <span className="err">{ersFehler}</span>}</>}
        >
          {konten.length === 0 ? (
            <div className="muted">{t("inventar.keinKonto")}</div>
          ) : (
            <div className="form-grid">
              <FormField label={t("inventar.feldKonto")} required>
                <select className="field" value={ersKonto} onChange={(e) => setErsKonto(e.target.value)}>
                  {konten.map((k) => (
                    <option key={k.id} value={k.id}>{k.bezeichnung}</option>
                  ))}
                </select>
              </FormField>
              <FormField label={t("inventar.feldDatum")}>
                <input className="field" type="date" value={ersDatum} onChange={(e) => setErsDatum(e.target.value)} />
              </FormField>
              <FormField label={`${t("inventar.feldBetrag")} ${geld.symbol}`} required hint={t("inventar.feldBetragHinweis")}>
                <input className="field" inputMode="decimal" value={ersBetrag} onChange={(e) => setErsBetrag(e.target.value)} placeholder="0,00" />
              </FormField>
              <FormField label={t("inventar.feldNotiz")}>
                <input className="field" value={ersNotiz} onChange={(e) => setErsNotiz(e.target.value)} placeholder={t("inventar.notizPlatzhalter")} />
              </FormField>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
