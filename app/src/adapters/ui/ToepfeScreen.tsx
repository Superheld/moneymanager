// Töpfe (P2.3) — Ansparen für Ungewisses (Puffer) und Wünsche (Spartopf). Kein Reset,
// du entnimmst, wenn du's brauchst. Der Ersatz-Fall (Gegenstände) lebt eigenständig im
// Bereich „Inventar". Plan-only.
//
// i18n + Mehrwährung nach ADR-0004 (Muster: BudgetsScreen): sichtbare Strings über t(),
// Geld über useGeld() (parse bei Eingabe, format + Symbol bei Anzeige).

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ansparrate,
  centZuEuro,
  minorZuMajor,
  sollstand,
  zielwert,
  type Kategorie,
  type Topf,
} from "../../core";
import { topfAnlegen } from "../../application/topfAnlegen";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, CoverageTrack, FormField, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

type TopfArt = "puffer" | "spartopf";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function ToepfeScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [typ, setTyp] = useState<TopfArt>("puffer");
  const [bezeichnung, setBezeichnung] = useState("");
  const [start, setStart] = useState(heute);
  const [kategorieId, setKategorieId] = useState("");
  const [schaetzbetrag, setSchaetzbetrag] = useState("");
  const [fristMonate, setFristMonate] = useState("");
  const [zufuehrung, setZufuehrung] = useState("");
  const [sparziel, setSparziel] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setToepfe(await topfRepo.alle());
    setKategorien(await kategorieRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  // Nur Puffer + Spartopf hier; Ersatz-Töpfe gehören zum Inventar.
  const sichtbar = toepfe.filter((t) => t.typ !== "ersatz");
  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  function neu() {
    setEditId(null);
    setTyp("puffer");
    setBezeichnung("");
    setStart(heute);
    setKategorieId("");
    setSchaetzbetrag("");
    setFristMonate("");
    setZufuehrung("");
    setSparziel("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(tp: Topf) {
    setEditId(tp.id);
    setBezeichnung(tp.bezeichnung);
    setStart(tp.start);
    setKategorieId(tp.kategorieId ?? "");
    setFehler(null);
    if (tp.typ === "puffer") {
      setTyp("puffer");
      setSchaetzbetrag(String(minorZuMajor(tp.schaetzbetrag, geld.waehrung)));
      setFristMonate(String(tp.fristMonate));
    } else if (tp.typ === "spartopf") {
      setTyp("spartopf");
      setZufuehrung(String(minorZuMajor(tp.zufuehrungProMonat, geld.waehrung)));
      setSparziel(tp.sparziel != null ? String(minorZuMajor(tp.sparziel, geld.waehrung)) : "");
    }
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await topfAnlegen(
        topfRepo,
        {
          typ,
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
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("toepfe.titel")}
        subtitle={t("toepfe.untertitel")}
        action={<Button variant="primary" plus onClick={neu}>{t("toepfe.anlegen")}</Button>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        <Trans i18nKey="toepfe.erklaerung" components={{ b: <b style={{ color: "var(--ink)" }} /> }} />
      </p>

      <Card title={t("toepfe.kartenTitel")} subtitle={t("toepfe.kartenAnzahl", { count: sichtbar.length })}>
        {sichtbar.length === 0 ? (
          <div className="muted">{t("toepfe.leer")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {sichtbar.map((tp) => {
              const ziel = zielwert(tp);
              const soll = sollstand(tp, heute);
              return (
                <div key={tp.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {tp.bezeichnung} <Pill variant="neutral">{t(`toepfe.art.${tp.typ}`)}</Pill>
                    </span>
                    <span className="muted">
                      {t("toepfe.ansparrate")} {geld.format(ansparrate(tp))} {geld.symbol}{t("toepfe.proMonatKurz")}{"  ·  "}
                      <button className="linkbtn" onClick={() => bearbeiten(tp)}>{t("toepfe.bearbeiten")}</button>{"  ·  "}
                      <button className="linkbtn" onClick={() => topfRepo.loeschen(tp.id).then(laden)}>{t("toepfe.loeschen")}</button>
                    </span>
                  </div>
                  {ziel != null && soll != null ? (
                    <CoverageTrack value={centZuEuro(soll)} max={centZuEuro(ziel)} label={t("toepfe.sollstandHeuteZiel")} right={`${geld.format(soll)} / ${geld.format(ziel)} ${geld.symbol}`} />
                  ) : (
                    <div className="muted">{t("toepfe.keinSparziel")}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? t("toepfe.modalBearbeiten") : t("toepfe.anlegen")}
          subtitle={t("toepfe.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("toepfe.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("toepfe.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("toepfe.feldArt")}>
              <select className="field" value={typ} disabled={editId !== null} onChange={(e) => setTyp(e.target.value as TopfArt)}>
                <option value="puffer">{t("toepfe.optionPuffer")}</option>
                <option value="spartopf">{t("toepfe.optionSpartopf")}</option>
              </select>
            </FormField>
            <FormField label={t("toepfe.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={typ === "puffer" ? t("toepfe.platzhalterBezeichnungPuffer") : t("toepfe.platzhalterBezeichnungSpartopf")} />
            </FormField>
            <FormField label={t("toepfe.feldStart")}>
              <input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </FormField>
            <FormField label={t("toepfe.feldKategorie")} hint={t("toepfe.feldKategorieHinweis")}>
              <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
            </FormField>
            {typ === "puffer" && (
              <>
                <FormField label={`${t("toepfe.feldSchaetzbetrag")} ${geld.symbol}`} required>
                  <input className="field" inputMode="decimal" value={schaetzbetrag} onChange={(e) => setSchaetzbetrag(e.target.value)} placeholder={t("toepfe.platzhalterSchaetzbetrag")} />
                </FormField>
                <FormField label={t("toepfe.feldZeitfenster")} required>
                  <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="12" />
                </FormField>
              </>
            )}
            {typ === "spartopf" && (
              <>
                <FormField label={`${t("toepfe.feldZufuehrung")} ${geld.symbol}`} required>
                  <input className="field" inputMode="decimal" value={zufuehrung} onChange={(e) => setZufuehrung(e.target.value)} placeholder={t("toepfe.platzhalterZufuehrung")} />
                </FormField>
                <FormField label={`${t("toepfe.feldSparziel")} ${geld.symbol}`} hint={t("toepfe.feldSparzielHinweis")}>
                  <input className="field" inputMode="decimal" value={sparziel} onChange={(e) => setSparziel(e.target.value)} placeholder={t("toepfe.platzhalterSparziel")} />
                </FormField>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
