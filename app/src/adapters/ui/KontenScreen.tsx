// Konten (P3) — die kontozentrische Sicht. Oben alle Konten mit realem Stand; darunter
// das Register eines gewählten Kontos: Anfangsbestand → gebuchte Ist-Buchungen (laufender
// Saldo) → „heute" → geplante Buchungen der kommenden X Tage (abhakbar). Plus manuelle
// Buchung erfassen (ADR-0002 rev.: Bar dauerhaft, Bankkonten vorläufig bis Import).
//
// i18n + Mehrwährung (ADR-0004): alle sichtbaren Strings über t()/<Trans>, alles Geld über
// useGeld() (Parse bei Eingabe, Format + Symbol bei Anzeige).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  istSummeKonto,
  kontoRegister,
  minorZuMajor,
  realerKontostand,
  fensterEnde,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type RegisterZeile,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungBearbeiten, buchungErfassen, buchungLoeschen } from "../../application/buchungErfassen";
import { zuruecksetzen, type Umsatz } from "../../application/import";
import { umbuchungErfassen, umbuchungLoeschen } from "../../application/umbuchungErfassen";
import { postenBezahltMarkieren, bezahltZuruecknehmen } from "../../application/bezahltMarkieren";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import type { ScreenId } from "./AppShell";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./EinstellungenProvider";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const TAGE_OPTIONEN = [14, 30, 60, 90];

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}
function betragFarbe(z: { betrag: number; charakter: Charakter }): string {
  if (z.betrag >= 0) return "var(--ok-deep)";
  return z.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)";
}

export function KontenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const heute = useMemo(heuteIso, []);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [aktivId, setAktivId] = useState("");
  const [tage, setTage] = useState(30);
  const [katFilter, setKatFilter] = useState("alle");
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<IstBuchung | null>(null);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    const ks = await kontoRepo.alle();
    setKonten(ks);
    setIst(await ledgerRepo.alle());
    setRegeln(await regelRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setUmsaetze(await umsatzRepo.alle());
    setAktivId((id) => id || ks[0]?.id || "");
  }
  useEffect(() => {
    laden();
  }, []);
  // Beim Kontowechsel den Kategorie-Filter zurücksetzen.
  useEffect(() => {
    setKatFilter("alle");
  }, [aktivId]);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const aktiv = konten.find((k) => k.id === aktivId);
  const register = useMemo(
    () => (aktiv ? kontoRegister(aktiv, ist, regeln, heute, tage) : null),
    [aktiv, ist, regeln, heute, tage],
  );

  // Importierte Buchungen tragen ihren Empfänger am Umsatz (nicht an der IstBuchung).
  const umsatzByIst = useMemo(() => {
    const m = new Map<string, Umsatz>();
    for (const u of umsaetze) if (u.istbuchungId) m.set(u.istbuchungId, u);
    return m;
  }, [umsaetze]);

  // Kategorien, die im gebuchten Register wirklich vorkommen (für das Filter-Dropdown).
  const kategorienImRegister = useMemo(() => {
    const ids = new Set<string>();
    for (const z of register?.gebucht ?? []) if (z.kategorieId) ids.add(z.kategorieId);
    return [...ids].map((id) => ({ id, name: kategorieName.get(id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [register, kategorieName]);

  const gebuchtGefiltert = useMemo(() => {
    const alle = register?.gebucht ?? [];
    if (katFilter === "alle") return alle;
    if (katFilter === "__ohne") return alle.filter((z) => !z.kategorieId);
    return alle.filter((z) => z.kategorieId === katFilter);
  }, [register, katFilter]);

  // Standardansicht: neueste zuerst (Tabelle sortiert/paginiert intern weiter).
  const gebuchtFuerTabelle = useMemo(() => [...gebuchtGefiltert].reverse(), [gebuchtGefiltert]);

  /** Anzeigename einer Registerzeile: Empfänger (Import) > Notiz/Regel-Bezeichnung; „Buchung" ist Füllwort. */
  function zeilenLabel(z: RegisterZeile): string {
    const u = z.istId ? umsatzByIst.get(z.istId) : undefined;
    if (u?.gegenpartei) return u.gegenpartei;
    return z.bezeichnung && z.bezeichnung !== "Buchung" ? z.bezeichnung : "";
  }

  async function abhaken(z: RegisterZeile, schonBezahlt: boolean) {
    if (!z.planRef) return;
    setFehler(null);
    try {
      if (schonBezahlt) {
        await bezahltZuruecknehmen(ledgerRepo, z.planRef.quelleId, z.planRef.faelligkeit);
      } else {
        const regel = regeln.find((r) => r.id === z.planRef!.quelleId);
        if (regel) await postenBezahltMarkieren(ledgerRepo, { regel, faelligkeit: z.planRef.faelligkeit, kontoId: aktivId });
      }
      setIst(await ledgerRepo.alle());
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function zeileEntfernen(z: RegisterZeile) {
    if (z.transferId) {
      await umbuchungLoeschen(ledgerRepo, z.transferId);
    } else if (z.istId) {
      await buchungLoeschen(ledgerRepo, z.istId);
      // Importierte Buchung? Den verknüpften Umsatz zurück in die Inbox setzen.
      const umsatz = umsaetze.find((u) => u.istbuchungId === z.istId);
      if (umsatz) await umsatzRepo.speichern(zuruecksetzen(umsatz));
    }
    await laden();
  }

  function bearbeitenOeffnen(z: RegisterZeile) {
    const b = ist.find((x) => x.id === z.istId);
    if (b) setEditBuchung(b);
  }

  async function buchungEntfernen(b: IstBuchung) {
    await buchungLoeschen(ledgerRepo, b.id);
    const umsatz = umsaetze.find((u) => u.istbuchungId === b.id);
    if (umsatz) await umsatzRepo.speichern(zuruecksetzen(umsatz));
    setEditBuchung(null);
    await laden();
  }

  return (
    <div className="screen">
      <PageHead title={t("konten.titel")} subtitle={t("konten.untertitel")} />

      <Card
        title={t("konten.deineKonten")}
        subtitle={t("konten.deineKontenUntertitel")}
        action={<Button plus onClick={() => onNavigate("einstellungen")}>{t("konten.kontoAnlegen")}</Button>}
      >
        {konten.length === 0 ? (
          <div className="muted">{t("konten.keineKonten")}</div>
        ) : (
          <DataTable
            sortable
            onRowClick={(k) => setAktivId(k.id)}
            istAktiv={(k) => k.id === aktivId}
            columns={[
              { key: "bezeichnung", label: t("konten.spalteBezeichnung"), render: (k) => (<span style={{ fontWeight: k.id === aktivId ? "var(--fw-bold)" : "var(--fw-semi)" }}>{k.bezeichnung}</span>) },
              { key: "typ", label: t("konten.spalteTyp"), sortValue: (k) => k.typ, render: (k) => <Pill variant="neutral">{t(`konten.typ.${k.typ}`)}</Pill> },
              { key: "anfang", label: `${t("konten.spalteAnfangsbestand")} ${geld.symbol}`, align: "right", sortValue: (k) => k.saldo, render: (k) => geld.format(k.saldo) },
              { key: "ist", label: `${t("konten.spalteIst")} ${geld.symbol}`, align: "right", sortValue: (k) => istSummeKonto(ist, k.id), render: (k) => (istSummeKonto(ist, k.id) ? geld.format(istSummeKonto(ist, k.id), { mitVorzeichen: true }) : "—") },
              { key: "real", label: `${t("konten.spalteRealerStand")} ${geld.symbol}`, align: "right", sortValue: (k) => realerKontostand(k, ist), render: (k) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(realerKontostand(k, ist))}</span> },
            ]}
            rows={konten}
          />
        )}
      </Card>

      {aktiv && register && (
        <Card
          title={t("konten.registerTitel", { konto: aktiv.bezeichnung })}
          subtitle={t("konten.registerUntertitel", { stand: geld.format(register.standHeute), symbol: geld.symbol, datum: ddmm(fensterEnde(heute, tage)) })}
          style={{ marginTop: "var(--gap-card)" }}
          action={
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <select className="field" style={{ width: "auto" }} value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {TAGE_OPTIONEN.map((d) => (<option key={d} value={d}>{t("konten.kommendeTage", { tage: d })}</option>))}
              </select>
              {konten.length >= 2 && <Button plus onClick={() => { setFehler(null); setUmbuchenOffen(true); }}>{t("konten.umbuchen")}</Button>}
              <Button variant="primary" plus onClick={() => { setFehler(null); setBuchenOffen(true); }}>{t("konten.btnBuchung")}</Button>
            </span>
          }
        >
          {/* Gebuchte Historie als sortierbare, paginierte Tabelle; Kategorie-Filter darüber */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", padding: "4px 0 8px" }}>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.anfangsbestand")}: {geld.formatMitSymbol(aktiv.saldo)}</span>
            <select className="field" style={{ width: "auto", marginLeft: "auto" }} value={katFilter} onChange={(e) => setKatFilter(e.target.value)}>
              <option value="alle">{t("konten.alleKategorien")}</option>
              {kategorienImRegister.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              <option value="__ohne">{t("konten.ohneKategorie")}</option>
            </select>
          </div>

          {gebuchtGefiltert.length === 0 ? (
            <div className="muted">{t("konten.keineGebucht")}</div>
          ) : (
            <DataTable
              key={`${aktivId}-${katFilter}`}
              sortable
              pageSize={25}
              columns={[
                { key: "datum", label: t("konten.spalteDatum"), sortValue: (z) => z.datum, render: (z) => ddmm(z.datum) },
                {
                  key: "bez", label: t("konten.spalteBeschreibung"), sortValue: (z) => zeilenLabel(z),
                  render: (z) => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {zeilenLabel(z)}
                      {z.gegenkontoId && <span className="muted" style={{ fontSize: 12 }}>{z.betrag < 0 ? "→" : "←"} {kontoName.get(z.gegenkontoId) ?? "?"}</span>}
                      {z.gegenkontoId ? <Pill variant="um">{t("konten.pillUmbuchung")}</Pill> : z.quelle === "manuell" ? <Pill variant="neutral">{t("konten.pillManuell")}</Pill> : z.quelle === "bezahlt-markiert" ? <Pill variant="neutral">{t("konten.pillBezahlt")}</Pill> : null}
                    </span>
                  ),
                },
                { key: "kat", label: t("konten.spalteKategorie"), sortValue: (z) => (z.kategorieId ? kategorieName.get(z.kategorieId) ?? "" : ""), render: (z) => (z.kategorieId ? kategorieName.get(z.kategorieId) ?? "?" : "—") },
                { key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right", sortValue: (z) => z.betrag, render: (z) => <span className="num" style={{ fontWeight: 700, color: betragFarbe(z) }}>{geld.format(z.betrag, { mitVorzeichen: true })}</span> },
                { key: "saldo", label: `${t("konten.spalteSaldo")} ${geld.symbol}`, align: "right", sortValue: (z) => z.saldo, render: (z) => geld.format(z.saldo) },
                {
                  key: "_a", label: "", align: "right", sortable: false,
                  render: (z) => z.gegenkontoId
                    ? <button className="linkbtn" onClick={() => zeileEntfernen(z)}>{t("konten.loeschen")}</button>
                    : <button className="linkbtn" onClick={() => bearbeitenOeffnen(z)}>{t("konten.bearbeiten")}</button>,
                },
              ]}
              rows={gebuchtFuerTabelle}
            />
          )}

          {/* Trenner heute */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 8px", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-wide, .04em)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            {t("konten.heuteRealerStand", { stand: geld.format(register.standHeute), symbol: geld.symbol })}
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          {/* Geplante Vorschau */}
          {register.geplant.length === 0 ? (
            <div className="muted" style={{ paddingTop: 4 }}>{t("konten.keineGeplanten", { tage })}</div>
          ) : (
            register.geplant.map((z, i) => (
              <Zeile
                key={`g${i}`}
                faint
                links={
                  <>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => abhaken(z, false)}
                      title={t("konten.alsBezahltMarkieren")}
                      style={{ cursor: "pointer", accentColor: "var(--accent-deep)" }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(z.datum)}</span>
                    {z.bezeichnung}
                    {z.charakter === "Umschichtung" && <Pill variant="um">{charakterLabel("Umschichtung")}</Pill>}
                  </>
                }
                betrag={z.betrag}
                charakter={z.charakter}
                saldo={z.saldo}
              />
            ))
          )}

          {fehler && <div className="err" style={{ marginTop: 10 }}>{fehler}</div>}
        </Card>
      )}

      {buchenOffen && aktiv && (
        <BuchungModal
          konto={aktiv}
          kategorien={kategorien}
          heute={heute}
          onClose={() => setBuchenOffen(false)}
          onSaved={async () => { setBuchenOffen(false); setIst(await ledgerRepo.alle()); }}
        />
      )}

      {editBuchung && (
        <EditBuchungModal
          buchung={editBuchung}
          kategorien={kategorien}
          onClose={() => setEditBuchung(null)}
          onSaved={async () => { setEditBuchung(null); await laden(); }}
          onDelete={async () => { await buchungEntfernen(editBuchung); }}
        />
      )}

      {umbuchenOffen && aktiv && (
        <UmbuchungModal
          konten={konten}
          vonId={aktivId}
          heute={heute}
          onClose={() => setUmbuchenOffen(false)}
          onSaved={async () => { setUmbuchenOffen(false); setIst(await ledgerRepo.alle()); }}
        />
      )}
    </div>
  );
}

/** Eine Registerzeile: linke Beschreibung, Betrag, laufender Saldo, optionale Aktion rechts. */
function Zeile({ links, betrag, charakter, saldo, faint, aktion }: { links: ReactNode; betrag?: number; charakter?: Charakter; saldo: number; faint?: boolean; aktion?: ReactNode }) {
  const geld = useGeld();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--line-soft)", opacity: faint ? 0.62 : 1 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, minWidth: 0, flexWrap: "wrap" }}>{links}</span>
      <span style={{ display: "flex", gap: 18, whiteSpace: "nowrap", alignItems: "center" }}>
        {betrag != null && charakter != null && (
          <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color: betragFarbe({ betrag, charakter }), minWidth: 92, textAlign: "right" }}>{geld.formatMitSymbol(betrag, { mitVorzeichen: true })}</span>
        )}
        <span className="num" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", minWidth: 92, textAlign: "right" }}>{geld.formatMitSymbol(saldo)}</span>
        {aktion != null && <span style={{ minWidth: 64, textAlign: "right" }}>{aktion}</span>}
      </span>
    </div>
  );
}

function UmbuchungModal({ konten, vonId, heute, onClose, onSaved }: { konten: Zahlungskonto[]; vonId: string; heute: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [von, setVon] = useState(vonId);
  const [nach, setNach] = useState(konten.find((k) => k.id !== vonId)?.id ?? "");
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await umbuchungErfassen(ledgerRepo, { vonKontoId: von, nachKontoId: nach, datum, betrag: geld.parse(betrag) ?? 0, notiz });
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.umbuchung.titel")}
      subtitle={t("konten.umbuchung.untertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("konten.umbuchung.vonKonto")} required>
          <select className="field" value={von} onChange={(e) => setVon(e.target.value)}>
            {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
          </select>
        </FormField>
        <FormField label={t("konten.umbuchung.nachKonto")} required>
          <select className="field" value={nach} onChange={(e) => setNach(e.target.value)}>
            {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
          </select>
        </FormField>
        <FormField label={t("konten.feldDatum")} required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.umbuchung.notizPlatzhalter")} />
        </FormField>
      </div>
    </Modal>
  );
}

function EditBuchungModal({ buchung, kategorien, onClose, onSaved, onDelete }: { buchung: IstBuchung; kategorien: Kategorie[]; onClose: () => void; onSaved: () => void; onDelete: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const [datum, setDatum] = useState(buchung.datum);
  const [betrag, setBetrag] = useState(String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)));
  const [charakter, setCharakter] = useState<Charakter>(buchung.charakter);
  const [kategorieId, setKategorieId] = useState(buchung.kategorieId ?? "");
  const [notiz, setNotiz] = useState(buchung.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await buchungBearbeiten(ledgerRepo, buchung, { datum, betrag: geld.parse(betrag) ?? 0, charakter, kategorieId: kategorieId || undefined, notiz });
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.editTitel")}
      subtitle={buchung.quelle === "import" ? t("konten.editUntertitelImport") : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          <button className="linkbtn" style={{ marginLeft: "auto", color: "var(--danger, #c0392b)" }} onClick={() => onDelete()}>{t("konten.loeschen")}</button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div className="form-grid">
        <FormField label={t("konten.feldDatum")} required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label={t("konten.feldCharakter")}>
          <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
            {CHARAKTERE.map((c) => (<option key={c} value={c}>{charakterLabel(c)}</option>))}
          </select>
        </FormField>
        <FormField label={t("konten.feldKategorie")} hint={t("konten.optional")}>
          <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
        </FormField>
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.buchung.notizPlatzhalter")} />
        </FormField>
      </div>
    </Modal>
  );
}

function BuchungModal({ konto, kategorien, heute, onClose, onSaved }: { konto: Zahlungskonto; kategorien: Kategorie[]; heute: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [kategorieId, setKategorieId] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const vorlaeufig = konto.typ !== "Bargeld";

  async function speichern() {
    setFehler(null);
    try {
      await buchungErfassen(ledgerRepo, {
        kontoId: konto.id,
        datum,
        betrag: geld.parse(betrag) ?? 0,
        charakter,
        kategorieId: kategorieId || undefined,
        notiz,
      });
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.buchung.titel", { konto: konto.bezeichnung })}
      subtitle={vorlaeufig ? t("konten.buchung.untertitelVorlaeufig") : t("konten.buchung.untertitelBargeld")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("konten.feldDatum")} required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} hint={t("konten.buchung.betragHinweis")} required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label={t("konten.feldCharakter")}>
          <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
            {CHARAKTERE.map((c) => (<option key={c} value={c}>{charakterLabel(c)}</option>))}
          </select>
        </FormField>
        <FormField label={t("konten.feldKategorie")} hint={t("konten.optional")}>
          <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
        </FormField>
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.buchung.notizPlatzhalter")} />
        </FormField>
      </div>
    </Modal>
  );
}
