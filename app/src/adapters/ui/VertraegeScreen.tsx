// Verträge (P2.1) — Übersicht mit Kündigungsterminen; Anlegen im Modal. Eine Maske
// erzeugt Vertrag (Stammdaten) + abgeleitete Zahlungsregel (Planung).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  kuendigungsterminNaht,
  minorZuMajor,
  naechsterKuendigungstermin,
  RHYTHMUS_MONATE,
  type Charakter,
  type Kategorie,
  type Person,
  type Rhythmus,
  type Vertrag,
  type Verlaengerungsart,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { vertragAktualisieren, vertragAnlegen, vertragLoeschen } from "../../application/vertragAnlegen";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function VertraegeScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [anbieter, setAnbieter] = useState("");
  const [inhaberId, setInhaberId] = useState("");
  const [beginn, setBeginn] = useState(heute);
  const [mindestlaufzeit, setMindestlaufzeit] = useState("");
  const [verlaengerung, setVerlaengerung] = useState<Verlaengerungsart>("automatisch");
  const [verlaengerungMonate, setVerlaengerungMonate] = useState("12");
  const [kuendigungsfrist, setKuendigungsfrist] = useState("");
  const [betragText, setBetragText] = useState("");
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [kategorieId, setKategorieId] = useState("");
  const [kontoId, setKontoId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setVertraege(await vertragRepo.alle());
    setRegeln(await regelRepo.alle());
    setPersonen(await personRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setKonten(await kontoRepo.alle());
  }
  useEffect(() => {
    laden();
  }, []);

  const regelZuVertrag = useMemo(() => {
    const m = new Map<string, Zahlungsregel>();
    for (const r of regeln) if (r.vertragId) m.set(r.vertragId, r);
    return m;
  }, [regeln]);
  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  const summe = useMemo(() => {
    let proMonat = 0;
    let baldKuendbar = 0;
    for (const v of vertraege) {
      const r = regelZuVertrag.get(v.id);
      if (r) proMonat += r.betrag / RHYTHMUS_MONATE[r.rhythmus];
      if (kuendigungsterminNaht(v, heute)) baldKuendbar++;
    }
    return { proMonat: Math.round(proMonat), proJahr: Math.round(proMonat * 12), baldKuendbar };
  }, [vertraege, regelZuVertrag, heute]);

  function kategorieWaehlen(id: string) {
    setKategorieId(id);
    const k = kategorien.find((x) => x.id === id);
    if (k) setCharakter(k.defaultCharakter);
  }

  function neu() {
    setEditId(null);
    setAnbieter("");
    setInhaberId("");
    setBeginn(heute);
    setMindestlaufzeit("");
    setVerlaengerung("automatisch");
    setVerlaengerungMonate("12");
    setKuendigungsfrist("");
    setBetragText("");
    setRhythmus("monatlich");
    setCharakter("Aufwand");
    setKategorieId("");
    setKontoId("");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(v: Vertrag) {
    const r = regelZuVertrag.get(v.id);
    setEditId(v.id);
    setAnbieter(v.anbieter);
    setInhaberId(v.inhaberId ?? "");
    setBeginn(v.beginn);
    setMindestlaufzeit(v.mindestlaufzeitMonate != null ? String(v.mindestlaufzeitMonate) : "");
    setVerlaengerung(v.verlaengerung);
    setVerlaengerungMonate(v.verlaengerungMonate != null ? String(v.verlaengerungMonate) : "12");
    setKuendigungsfrist(v.kuendigungsfristMonate != null ? String(v.kuendigungsfristMonate) : "");
    setBetragText(r ? String(minorZuMajor(Math.abs(r.betrag), geld.waehrung)) : "");
    setRhythmus(r?.rhythmus ?? "monatlich");
    setCharakter(r?.charakter ?? "Aufwand");
    setKategorieId(r?.kategorieId ?? "");
    setKontoId(r?.kontoId ?? "");
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    const eingabe = {
      anbieter,
      inhaberId: inhaberId || undefined,
      beginn,
      mindestlaufzeitMonate: mindestlaufzeit ? Number(mindestlaufzeit) : undefined,
      verlaengerung,
      verlaengerungMonate: verlaengerungMonate ? Number(verlaengerungMonate) : undefined,
      kuendigungsfristMonate: kuendigungsfrist ? Number(kuendigungsfrist) : undefined,
      betrag: geld.parse(betragText) ?? 0,
      rhythmus,
      charakter,
      kategorieId: kategorieId || undefined,
      kontoId: kontoId || undefined,
    };
    try {
      if (editId) await vertragAktualisieren(vertragRepo, regelRepo, editId, eingabe);
      else await vertragAnlegen(vertragRepo, regelRepo, eingabe);
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("vertraege.titel")}
        subtitle={t("vertraege.untertitel")}
        action={
          <Button variant="primary" plus onClick={neu}>
            {t("vertraege.anlegen")}
          </Button>
        }
      />

      {vertraege.length > 0 && (
        <div className="kpis">
          <KPIStat size="chip" label={t("vertraege.kpiAnzahl")} value={String(vertraege.length)} />
          <KPIStat size="chip" label={t("vertraege.kpiProMonat")} value={geld.format(summe.proMonat, { mitVorzeichen: true })} unit={geld.symbol} />
          <KPIStat size="chip" label={t("vertraege.kpiProJahr")} value={geld.format(summe.proJahr, { mitVorzeichen: true })} unit={geld.symbol} />
          {summe.baldKuendbar > 0 && <KPIStat size="chip" label={t("vertraege.kpiBald")} value={String(summe.baldKuendbar)} tone="warn" />}
        </div>
      )}

      <Card>
        {vertraege.length === 0 ? (
          <div className="muted">{t("vertraege.leer")}</div>
        ) : (
          <DataTable
            sortable
            columns={[
              { key: "anbieter", label: t("vertraege.spalteAnbieter") },
              { key: "inhaber", label: t("vertraege.spalteInhaber"), sortValue: (v) => (v.inhaberId ? personName.get(v.inhaberId) ?? "" : ""), render: (v) => (v.inhaberId ? personName.get(v.inhaberId) ?? "?" : "—") },
              {
                key: "charakter",
                label: t("vertraege.spalteCharakter"),
                sortValue: (v) => regelZuVertrag.get(v.id)?.charakter ?? "",
                render: (v) => {
                  const r = regelZuVertrag.get(v.id);
                  return r ? <Pill variant={CHARAKTER_PILL[r.charakter]}>{t(`charakter.${r.charakter}`)}</Pill> : "—";
                },
              },
              {
                key: "rhythmus",
                label: t("vertraege.spalteRhythmus"),
                sortValue: (v) => regelZuVertrag.get(v.id)?.rhythmus ?? "",
                render: (v) => {
                  const r = regelZuVertrag.get(v.id);
                  return r ? t(`vertraege.rhythmus.${r.rhythmus}`) : "—";
                },
              },
              {
                key: "kuendigung",
                label: t("vertraege.spalteKuendigenBis"),
                sortable: false,
                render: (v) => {
                  const termin = naechsterKuendigungstermin(v, heute);
                  if (!termin) return <span className="muted">—</span>;
                  const naht = kuendigungsterminNaht(v, heute);
                  return (
                    <span>
                      {termin.kuendigenBis} {naht && <Pill variant="warn">{t("vertraege.bald")}</Pill>}
                    </span>
                  );
                },
              },
              {
                key: "betrag",
                label: `${t("vertraege.spalteBetrag")} ${geld.symbol}`,
                align: "right",
                sortValue: (v) => regelZuVertrag.get(v.id)?.betrag ?? 0,
                render: (v) => {
                  const r = regelZuVertrag.get(v.id);
                  return r ? geld.format(r.betrag) : "—";
                },
              },
              { key: "_e", label: "", align: "right", sortable: false, render: (v) => <button className="linkbtn" onClick={() => bearbeiten(v)}>{t("vertraege.bearbeiten")}</button> },
              {
                key: "_x",
                label: "",
                align: "right",
                sortable: false,
                render: (v) => (
                  <button className="linkbtn" onClick={() => vertragLoeschen(vertragRepo, regelRepo, v.id).then(laden)}>
                    {t("vertraege.loeschen")}
                  </button>
                ),
              },
            ]}
            rows={vertraege}
          />
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? t("vertraege.modalBearbeiten") : t("vertraege.anlegen")}
          subtitle={t("vertraege.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={
            <>
              <Button variant="primary" onClick={speichern}>
                {t("vertraege.speichern")}
              </Button>
              <button className="linkbtn" onClick={() => setOffen(false)}>
                {t("vertraege.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <div className="form-grid">
            <FormField label={t("vertraege.feldAnbieter")} required>
              <input className="field" value={anbieter} onChange={(e) => setAnbieter(e.target.value)} placeholder={t("vertraege.feldAnbieterPlatzhalter")} />
            </FormField>
            <FormField label={t("vertraege.feldInhaber")}>
              <select className="field" value={inhaberId} onChange={(e) => setInhaberId(e.target.value)}>
                <option value="">—</option>
                {personen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("vertraege.feldBeginn")}>
              <input className="field" type="date" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
            </FormField>
            <FormField label={t("vertraege.feldMindestlaufzeit")} hint={t("vertraege.optional")}>
              <input className="field" inputMode="numeric" value={mindestlaufzeit} onChange={(e) => setMindestlaufzeit(e.target.value)} placeholder={t("vertraege.feldMindestlaufzeitPlatzhalter")} />
            </FormField>
            <FormField label={t("vertraege.feldVerlaengerung")}>
              <select className="field" value={verlaengerung} onChange={(e) => setVerlaengerung(e.target.value as Verlaengerungsart)}>
                <option value="automatisch">{t("vertraege.verlaengerung.automatisch")}</option>
                <option value="keine">{t("vertraege.verlaengerung.keine")}</option>
              </select>
            </FormField>
            <FormField label={t("vertraege.feldVerlaengerungMonate")} hint={t("vertraege.feldVerlaengerungMonateHinweis")}>
              <input className="field" inputMode="numeric" value={verlaengerungMonate} onChange={(e) => setVerlaengerungMonate(e.target.value)} placeholder={t("vertraege.feldVerlaengerungMonatePlatzhalter")} />
            </FormField>
            <FormField label={t("vertraege.feldKuendigungsfrist")} hint={t("vertraege.optional")}>
              <input className="field" inputMode="numeric" value={kuendigungsfrist} onChange={(e) => setKuendigungsfrist(e.target.value)} placeholder={t("vertraege.feldKuendigungsfristPlatzhalter")} />
            </FormField>
            <FormField label={`${t("vertraege.feldBetrag")} ${geld.symbol}`} required hint={t("vertraege.feldBetragHinweis")}>
              <input className="field" inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} placeholder="0,00" />
            </FormField>
            <FormField label={t("vertraege.feldRhythmus")}>
              <select className="field" value={rhythmus} onChange={(e) => setRhythmus(e.target.value as Rhythmus)}>
                {RHYTHMEN.map((r) => (
                  <option key={r} value={r}>
                    {t(`vertraege.rhythmus.${r}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("vertraege.feldKategorie")} hint={t("vertraege.feldKategorieHinweis")}>
              <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={kategorieWaehlen} />
            </FormField>
            <FormField label={t("vertraege.feldCharakter")}>
              <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (
                  <option key={c} value={c}>
                    {t(`charakter.${c}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("vertraege.feldKonto")} hint={t("vertraege.optional")}>
              <select className="field" value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
                <option value="">—</option>
                {konten.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.bezeichnung}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
