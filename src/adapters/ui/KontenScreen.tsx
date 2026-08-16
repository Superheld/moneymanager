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
  istGeteilt,
  istSummeKonto,
  kontoRegister,
  minorZuMajor,
  realerKontostand,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type RegisterZeile,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungBearbeiten, buchungErfassen, buchungLoeschen } from "../../application/buchungErfassen";
import { zuruecksetzen, type ImportLauf, type Umsatz } from "../../application/import";
import { umbuchungErfassen, umbuchungLoeschen } from "../../application/umbuchungErfassen";
import { buchungSplitten, offenerRest, splitAufheben } from "../../application/buchungSplitten";
import {
  buchungenPaaren,
  gegenbeinErzeugen,
  paarungLoesen,
  paarungsKandidaten,
  umbuchungsBeinBearbeiten,
  MAX_VORSCHLAG_TAGE,
} from "../../application/umbuchungAusBuchung";
import { postenBezahltMarkieren, bezahltZuruecknehmen } from "../../application/bezahltMarkieren";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteUmsatzRepository as umsatzRepo,
  sqliteImportLaufRepository as importLaufRepo,
} from "../persistence/sqliteImportRepositories";
import type { ScreenId } from "./AppShell";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./EinstellungenProvider";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const TAGE_OPTIONEN = [14, 30, 60, 90];
const ART_OPTS = [
  { v: "alle", k: "konten.artAlle" },
  { v: "einnahmen", k: "konten.artEinnahmen" },
  { v: "ausgaben", k: "konten.artAusgaben" },
  { v: "umbuchung", k: "konten.artUmbuchung" },
] as const;

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
  const [artFilter, setArtFilter] = useState<"alle" | "einnahmen" | "ausgaben" | "umbuchung">("alle");
  const [regSuche, setRegSuche] = useState("");
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<IstBuchung | null>(null);
  const [umbuchenAus, setUmbuchenAus] = useState<IstBuchung | null>(null);
  const [splitten, setSplitten] = useState<IstBuchung | null>(null);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [importLaeufe, setImportLaeufe] = useState<ImportLauf[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  // Alles in EINEM Zug laden und zusammen setzen. Gestaffelte await/setState-Paare
  // lassen abgeleitete Werte kurz gegen leere Listen rechnen — der Empfänger einer
  // importierten Buchung käme aus einer noch leeren Umsatz-Liste und die Zeile zeigte
  // für einen Render „Buchung" statt „Edeka".
  async function laden() {
    const [ks, bs, rs, kats, us, laeufe] = await Promise.all([
      kontoRepo.alle(),
      ledgerRepo.alle(),
      regelRepo.alle(),
      kategorieRepo.alle(),
      umsatzRepo.alle(),
      importLaufRepo.alle(),
    ]);
    setKonten(ks);
    setIst(bs);
    setRegeln(rs);
    setKategorien(kats);
    setUmsaetze(us);
    setImportLaeufe(laeufe);
    setAktivId((id) => id || ks[0]?.id || "");
  }
  useEffect(() => {
    laden();
  }, []);
  // Beim Kontowechsel die Filter zurücksetzen.
  useEffect(() => {
    setKatFilter("alle");
    setArtFilter("alle");
    setRegSuche("");
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
    const q = regSuche.trim().toLowerCase();
    return (register?.gebucht ?? []).filter((z) => {
      if (katFilter === "__ohne" ? !!z.kategorieId : katFilter !== "alle" && z.kategorieId !== katFilter) return false;
      if (artFilter === "umbuchung" && !z.gegenkontoId) return false;
      if (artFilter === "einnahmen" && !(z.betrag > 0 && !z.gegenkontoId)) return false;
      if (artFilter === "ausgaben" && !(z.betrag < 0 && !z.gegenkontoId)) return false;
      if (q) {
        const u = z.istId ? umsatzByIst.get(z.istId) : undefined;
        const heu = `${zeilenLabel(z)} ${u?.verwendungszweck ?? ""} ${z.kategorieId ? kategorieName.get(z.kategorieId) ?? "" : ""}`.toLowerCase();
        if (!heu.includes(q)) return false;
      }
      return true;
    });
  }, [register, katFilter, artFilter, regSuche, umsatzByIst, kategorieName]);

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

  function bearbeitenOeffnen(z: RegisterZeile) {
    const b = ist.find((x) => x.id === z.istId);
    if (b) setEditBuchung(b);
  }

  /** Das andere Bein einer Umbuchung — gleiche transferId, andere id. */
  function gegenbuchungZu(b: IstBuchung): IstBuchung | undefined {
    if (!b.transferId) return undefined;
    return ist.find((x) => x.transferId === b.transferId && x.id !== b.id);
  }

  /** Der Import-Lauf, aus dem die Buchung stammt (über ihren Umsatz). */
  function importLaufZuBuchung(b: IstBuchung): ImportLauf | undefined {
    const laufId = umsatzByIst.get(b.id)?.laufId;
    return laufId ? importLaeufe.find((l) => l.id === laufId) : undefined;
  }

  /** Importierte Buchungen tragen einen Umsatz — der muss zurück in die Inbox, sonst verwaist er. */
  async function umsaetzeZuruecksetzen(istIds: string[]) {
    for (const id of istIds) {
      const umsatz = umsaetze.find((u) => u.istbuchungId === id);
      if (umsatz) await umsatzRepo.speichern(zuruecksetzen(umsatz));
    }
  }

  /** Löscht eine Buchung — bei einer Umbuchung BEIDE Beine, sonst bliebe eines verwaist. */
  async function buchungEntfernen(b: IstBuchung) {
    if (b.transferId) {
      const beine = ist.filter((x) => x.transferId === b.transferId);
      await umbuchungLoeschen(ledgerRepo, b.transferId);
      await umsaetzeZuruecksetzen(beine.map((x) => x.id));
    } else {
      await buchungLoeschen(ledgerRepo, b.id);
      await umsaetzeZuruecksetzen([b.id]);
    }
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
          style={{ marginTop: "var(--gap-card)" }}
          pad
        >
          {/* Statement-Masthead: wessen Auszug, welcher reale Stand */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>{aktiv.bezeichnung}</span>
                <Pill variant="neutral">{t(`konten.typ.${aktiv.typ}`)}</Pill>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", marginTop: 8 }}>
                <span className="num" style={{ fontSize: "var(--fs-h1)", fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", lineHeight: 1, color: register.standHeute < 0 ? "var(--warn-deep)" : "var(--ink)" }}>
                  {geld.formatMitSymbol(register.standHeute)}
                </span>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>{t("konten.realerStandLabel")}</span>
              </div>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.anfangsbestand")} {geld.formatMitSymbol(aktiv.saldo)}
                {istSummeKonto(ist, aktiv.id) !== 0 && <> · Σ Ist {geld.formatMitSymbol(istSummeKonto(ist, aktiv.id), { mitVorzeichen: true })}</>}
              </div>
            </div>
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <select className="field" style={{ width: "auto" }} value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {TAGE_OPTIONEN.map((d) => (<option key={d} value={d}>{t("konten.kommendeTage", { tage: d })}</option>))}
              </select>
              {konten.length >= 2 && <Button plus onClick={() => { setFehler(null); setUmbuchenOffen(true); }}>{t("konten.umbuchen")}</Button>}
              <Button variant="primary" plus onClick={() => { setFehler(null); setBuchenOffen(true); }}>{t("konten.btnBuchung")}</Button>
            </span>
          </div>

          {/* Filterleiste: Suche · Art (segmented) · Kategorie · Treffer */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            <span style={{ position: "relative", flex: "1 1 200px", minWidth: 160, display: "inline-flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" style={{ position: "absolute", left: 10, pointerEvents: "none" }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              <input className="field" style={{ width: "100%", paddingLeft: 30 }} value={regSuche} onChange={(e) => setRegSuche(e.target.value)} placeholder={t("konten.suche")} />
            </span>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)" }}>
              {ART_OPTS.map((opt, i) => {
                const an = artFilter === opt.v;
                return (
                  <button key={opt.v} type="button" aria-pressed={an} onClick={() => setArtFilter(opt.v)} style={{ padding: "6px 11px", fontSize: "12.5px", fontWeight: an ? "var(--fw-bold)" : "var(--fw-semi)", fontFamily: "var(--font-ui)", border: "none", borderLeft: i ? "1px solid var(--line-soft)" : "none", background: an ? "var(--accent-wash)" : "transparent", color: an ? "var(--accent-deep)" : "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {t(opt.k)}
                  </button>
                );
              })}
            </div>
            <select className="field" style={{ width: "auto" }} value={katFilter} onChange={(e) => setKatFilter(e.target.value)}>
              <option value="alle">{t("konten.alleKategorien")}</option>
              {kategorienImRegister.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              <option value="__ohne">{t("konten.ohneKategorie")}</option>
            </select>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.buchungenAnzahl", { n: gebuchtGefiltert.length })}</span>
          </div>

          {gebuchtGefiltert.length === 0 ? (
            <div className="muted">{t("konten.keineGebucht")}</div>
          ) : (
            <DataTable
              key={`${aktivId}-${katFilter}-${artFilter}-${regSuche}`}
              pageSize={25}
              columns={[
                { key: "datum", label: t("konten.spalteDatum"), render: (z) => ddmm(z.datum) },
                {
                  key: "bez", label: t("konten.spalteBeschreibung"),
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
                  render: (z) => <button className="linkbtn" onClick={() => bearbeitenOeffnen(z)}>{t("konten.bearbeiten")}</button>,
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
          // Ohne key bliebe beim Sprung zur Gegenbuchung der Formularstate der ALTEN
          // Buchung stehen — useState-Initialwerte laufen nur beim Mount.
          key={editBuchung.id}
          buchung={editBuchung}
          kategorien={kategorien}
          kontoName={kontoName}
          kategorieName={kategorieName}
          umsatz={umsatzByIst.get(editBuchung.id)}
          importLauf={importLaufZuBuchung(editBuchung)}
          regel={editBuchung.planRef ? regeln.find((r) => r.id === editBuchung.planRef!.quelleId) : undefined}
          gegenbuchung={gegenbuchungZu(editBuchung)}
          onClose={() => setEditBuchung(null)}
          onSaved={async () => { setEditBuchung(null); await laden(); }}
          onDelete={async () => { await buchungEntfernen(editBuchung); }}
          onZurUmbuchung={() => { setUmbuchenAus(editBuchung); setEditBuchung(null); }}
          onLoesen={async () => { await paarungLoesen(ledgerRepo, editBuchung.transferId!); setEditBuchung(null); await laden(); }}
          onGegenbuchung={setEditBuchung}
          onSplitten={() => { setSplitten(editBuchung); setEditBuchung(null); }}
          onSplitAufheben={async () => { await splitAufheben(ledgerRepo, editBuchung); setEditBuchung(null); await laden(); }}
        />
      )}

      {splitten && (
        <SplitModal
          buchung={splitten}
          kategorien={kategorien}
          onClose={() => setSplitten(null)}
          onSaved={async () => { setSplitten(null); await laden(); }}
        />
      )}

      {umbuchenAus && (
        <ZurUmbuchungModal
          buchung={umbuchenAus}
          konten={konten}
          alleBuchungen={ist}
          kontoName={kontoName}
          umsatzByIst={umsatzByIst}
          onClose={() => setUmbuchenAus(null)}
          onSaved={async () => { setUmbuchenAus(null); await laden(); }}
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

/** Ein Label/Wert-Paar im Herkunfts-Abschnitt. Lange Werte (Hash, Zweck) dürfen umbrechen. */
function Infozeile({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "var(--sp-3)", padding: "5px 0", alignItems: "baseline" }}>
      <span style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: "break-word", fontFamily: mono ? "var(--font-mono, monospace)" : undefined, color: mono ? "var(--ink-2)" : "var(--ink)" }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Detailansicht einer gebuchten Ist-Buchung (S-1c). Drei Teile:
 *
 *  1. Was man ändern darf — das Formular.
 *  2. Umbuchung — Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen.
 *  3. Herkunft — was über die Buchung bekannt ist, aber nirgends änderbar.
 *
 * Zu 3: Empfänger und Verwendungszweck hängen NICHT an der `IstBuchung`, sondern am
 * `Umsatz` (Import-Kontext, siehe ADR-0002) — hereingereicht statt hier nachgeladen,
 * der Screen hat die Zuordnung ohnehin schon.
 *
 * Zwei Gesichter beim Bearbeiten:
 *  • frei — alle Felder editierbar, plus der Einstieg „Zur Umbuchung machen" (S-1).
 *  • Bein einer Umbuchung — Betrag, Charakter und Kategorie sind FEST. `buchungBearbeiten`
 *    leitet das Vorzeichen über `vorzeichenbehaftet()` aus dem Charakter ab, und das macht
 *    eine Umschichtung immer negativ: das Zugangs-Bein (+500) würde beim Speichern auf
 *    −500 kippen und die Netto-Null der Umbuchung brechen. Datum und Notiz sind
 *    unkritisch (die beiden Beine dürfen ohnehin an verschiedenen Tagen liegen).
 */
function EditBuchungModal({ buchung, kategorien, kontoName, kategorieName, umsatz, importLauf, regel, gegenbuchung, onClose, onSaved, onDelete, onZurUmbuchung, onLoesen, onGegenbuchung, onSplitten, onSplitAufheben }: { buchung: IstBuchung; kategorien: Kategorie[]; kontoName: Map<string, string>; umsatz?: Umsatz; importLauf?: ImportLauf; regel?: Zahlungsregel; gegenbuchung?: IstBuchung; kategorieName: Map<string, string>; onClose: () => void; onSaved: () => void; onDelete: () => void | Promise<void>; onZurUmbuchung: () => void; onLoesen: () => void | Promise<void>; onGegenbuchung: (b: IstBuchung) => void; onSplitten: () => void; onSplitAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const [datum, setDatum] = useState(buchung.datum);
  const [betrag, setBetrag] = useState(String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)));
  const [charakter, setCharakter] = useState<Charakter>(buchung.charakter);
  const [kategorieId, setKategorieId] = useState(buchung.kategorieId ?? "");
  const [notiz, setNotiz] = useState(buchung.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const gepaart = !!buchung.transferId;
  const geteilt = istGeteilt(buchung);

  async function speichern() {
    setFehler(null);
    try {
      if (gepaart) {
        await umbuchungsBeinBearbeiten(ledgerRepo, buchung, { datum, notiz });
      } else {
        await buchungBearbeiten(ledgerRepo, buchung, { datum, betrag: geld.parse(betrag) ?? 0, charakter, kategorieId: kategorieId || undefined, notiz });
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.detail.titel")}
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
      {/* Kopf: worum es geht — Empfänger und Betrag, die beiden Dinge, an denen man
          eine Buchung wiedererkennt. Der Empfänger kommt aus dem Umsatz. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>
            {umsatz?.gegenpartei || buchung.notiz || kontoName.get(buchung.kontoId) || ""}
          </span>
          <span className="muted" style={{ display: "block", fontSize: "var(--fs-xs)", marginTop: 4 }}>
            {ddmm(buchung.datum)} · {kontoName.get(buchung.kontoId) ?? "?"}
          </span>
        </span>
        <span className="num" style={{ fontSize: "var(--fs-h2, var(--fs-h3))", fontWeight: "var(--fw-black)", color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div className="form-grid">
        <FormField label={t("konten.feldDatum")} required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} disabled={gepaart} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        {!gepaart && (
          <>
            <FormField label={t("konten.feldCharakter")}>
              <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
                {CHARAKTERE.map((c) => (<option key={c} value={c}>{charakterLabel(c)}</option>))}
              </select>
            </FormField>
            <FormField label={t("konten.feldKategorie")} hint={t("konten.optional")}>
              <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
            </FormField>
          </>
        )}
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.buchung.notizPlatzhalter")} />
        </FormField>
      </div>

      {/* Umbuchungs-Abschnitt: Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen */}
      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
        {gepaart ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Pill variant="um">{t("konten.paarung.titel")}</Pill>
              <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                {t("konten.paarung.gegenkonto")}: {kontoName.get(buchung.gegenkontoId ?? "") ?? "?"}
              </span>
              <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => onLoesen()}>{t("konten.paarung.loesen")}</button>
            </div>

            {/* Sprung ins andere Bein — derselbe Dialog, andere Buchung. */}
            {gegenbuchung && (
              <button
                className="linkbtn"
                title={t("konten.paarung.gegenbuchungOeffnen")}
                onClick={() => onGegenbuchung(gegenbuchung)}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", textAlign: "left" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(gegenbuchung.datum)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                  {t("konten.paarung.gegenbuchung")} · {kontoName.get(gegenbuchung.kontoId) ?? "?"}
                </span>
                <span className="num" style={{ fontWeight: 700, color: betragFarbe(gegenbuchung) }}>
                  {geld.formatMitSymbol(gegenbuchung.betrag, { mitVorzeichen: true })}
                </span>
                <span aria-hidden style={{ color: "var(--ink-3)" }}>›</span>
              </button>
            )}

            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
              {t("konten.paarung.loesenHinweis")} {t("konten.paarung.loeschtBeide")}
            </div>
          </>
        ) : (
          <>
            <Button onClick={onZurUmbuchung}>{t("konten.zurUmbuchung.aktion")}</Button>
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
              {t("konten.zurUmbuchung.untertitel")}
            </div>
          </>
        )}
      </div>

      {/* Aufteilung (S-7) — bei Umbuchungs-Beinen gar nicht erst anbieten. */}
      {!gepaart && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          {geteilt ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>
                  {t("konten.split.abschnitt")}
                </span>
                <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={onSplitten}>{t("konten.split.bearbeiten")}</button>
                <button className="linkbtn" onClick={() => onSplitAufheben()}>{t("konten.split.aufheben")}</button>
              </div>
              {(buchung.aufteilungen ?? []).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "5px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ fontSize: 13, minWidth: 0 }}>
                    {kategorieName.get(a.kategorieId) ?? "?"}
                    {a.notiz && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{a.notiz}</span>}
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {geld.formatMitSymbol(a.betrag, { mitVorzeichen: true })}
                  </span>
                </div>
              ))}
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.split.aufhebenHinweis")}</div>
            </>
          ) : (
            <>
              <Button onClick={onSplitten}>{t("konten.split.aktion")}</Button>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.split.untertitel")}</div>
            </>
          )}
        </div>
      )}

      {/* Herkunft — alles, was bekannt ist, aber hier nicht geändert wird. */}
      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
          {t("konten.detail.herkunft")}
        </div>

        <Infozeile label={t("konten.detail.erfasstUeber")}>{t(`konten.quelleName.${buchung.quelle}`)}</Infozeile>
        <Infozeile label={t("konten.detail.konto")}>{kontoName.get(buchung.kontoId) ?? "?"}</Infozeile>

        {umsatz ? (
          <>
            <Infozeile label={t("konten.detail.empfaenger")}>{umsatz.gegenpartei || "—"}</Infozeile>
            <Infozeile label={t("konten.detail.zweck")}>{umsatz.verwendungszweck || "—"}</Infozeile>
            {importLauf && (
              <Infozeile label={t("konten.detail.importlauf")}>
                {t("konten.detail.importlaufWert", {
                  quelle: importLauf.dateiname || importLauf.quelle,
                  zeitpunkt: importLauf.zeitpunkt.slice(0, 10),
                })}
              </Infozeile>
            )}
            {umsatz.nativeId && <Infozeile label={t("konten.detail.nativeId")} mono>{umsatz.nativeId}</Infozeile>}
            <Infozeile label={t("konten.detail.rohHash")} mono>{umsatz.rohHash}</Infozeile>
          </>
        ) : (
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.detail.ohneImport")}</div>
        )}

        {buchung.planRef && (
          <Infozeile label={t("konten.detail.planbezug")}>
            {t("konten.detail.planbezugWert", {
              regel: regel?.bezeichnung ?? buchung.planRef.quelleId,
              faelligkeit: ddmm(buchung.planRef.faelligkeit),
            })}
          </Infozeile>
        )}
      </div>
    </Modal>
  );
}

/**
 * S-7 — Buchung auf mehrere Kategorien aufteilen. Der Betrag der Buchung bleibt, was er
 * ist; verteilt wird nur die Kategorie-Zuordnung. Der Dialog lässt sich nicht speichern,
 * solange der Rest nicht null ist — die Invariante steht im Use-Case, hier wird sie nur
 * früh genug sichtbar gemacht.
 *
 * Beträge werden POSITIV eingegeben; das Vorzeichen kommt von der Buchung.
 */
function SplitModal({ buchung, kategorien, onClose, onSaved }: { buchung: IstBuchung; kategorien: Kategorie[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();

  /** Vorbelegung: eine bestehende Aufteilung weiterbearbeiten, sonst zwei leere Zeilen. */
  const [zeilen, setZeilen] = useState<{ kategorieId: string; betrag: string; notiz: string }[]>(() =>
    buchung.aufteilungen?.length
      ? buchung.aufteilungen.map((a) => ({
          kategorieId: a.kategorieId,
          betrag: String(minorZuMajor(Math.abs(a.betrag), geld.waehrung)),
          notiz: a.notiz ?? "",
        }))
      : [
          { kategorieId: buchung.kategorieId ?? "", betrag: String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)), notiz: "" },
          { kategorieId: "", betrag: "", notiz: "" },
        ],
  );
  const [fehler, setFehler] = useState<string | null>(null);

  const eingaben = zeilen.map((z) => ({ kategorieId: z.kategorieId, betrag: geld.parse(z.betrag) ?? 0, notiz: z.notiz }));
  const rest = offenerRest(buchung, eingaben);
  const verteilt = Math.abs(buchung.betrag) - rest;

  function aendere(i: number, feld: "kategorieId" | "betrag" | "notiz", wert: string) {
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, [feld]: wert } : z)));
  }

  /** Den offenen Rest in eine Zeile übernehmen — spart das Kopfrechnen bei drei Teilen. */
  function restEinsetzen(i: number) {
    const schon = geld.parse(zeilen[i].betrag) ?? 0;
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, betrag: String(minorZuMajor(schon + rest, geld.waehrung)) } : z)));
  }

  async function speichern() {
    setFehler(null);
    try {
      await buchungSplitten(ledgerRepo, buchung, eingaben);
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.split.titel")}
      subtitle={t("konten.split.untertitel")}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.split.gesamt")}</span>
        <span className="num" style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-black)", color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      {zeilen.map((z, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <span style={{ flex: "2 1 180px", minWidth: 150 }}>
            <CategoryPicker kategorien={kategorien} value={z.kategorieId} onChange={(v) => aendere(i, "kategorieId", v)} />
          </span>
          <input
            className="field"
            inputMode="decimal"
            style={{ flex: "0 1 110px", minWidth: 90 }}
            value={z.betrag}
            onChange={(e) => aendere(i, "betrag", e.target.value)}
            placeholder="0,00"
            aria-label={`${t("konten.split.spalteBetrag")} ${i + 1}`}
          />
          {rest !== 0 && (
            <button className="linkbtn" title={t("konten.split.restVerteilen")} onClick={() => restEinsetzen(i)} style={{ padding: "6px 4px" }}>+</button>
          )}
          {zeilen.length > 2 && (
            <button className="linkbtn" onClick={() => setZeilen((zs) => zs.filter((_, j) => j !== i))}>
              {t("konten.split.zeileEntfernen")}
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
        <Button plus onClick={() => setZeilen((zs) => [...zs, { kategorieId: "", betrag: "", notiz: "" }])}>
          {t("konten.split.zeileHinzufuegen")}
        </Button>
        <span style={{ fontSize: 13, fontWeight: "var(--fw-bold)", color: rest === 0 ? "var(--ok-deep)" : "var(--warn-deep)" }}>
          {rest === 0
            ? t("konten.split.restPasst")
            : rest > 0
              ? t("konten.split.restOffen", { betrag: geld.formatMitSymbol(rest) })
              : t("konten.split.restZuviel", { betrag: geld.formatMitSymbol(-rest) })}
        </span>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.split.hinweisPositiv")} · {t("konten.split.verteilt")}: {geld.formatMitSymbol(verteilt)}
      </div>
    </Modal>
  );
}

/**
 * S-1 — macht aus einer bestehenden Buchung eine Umbuchung. EIN Dialog für beide Fälle:
 * oben die passenden Gegenbuchungen (S-1b, nachträgliche Paarung), darunter der Ausweg
 * „Gegenbein neu erzeugen" (S-1a, Zielkonto wird nicht importiert). Der Nutzer soll nicht
 * vorher wissen müssen, welcher Fall vorliegt — die Liste beantwortet das.
 */
function ZurUmbuchungModal({ buchung, konten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  const andereKonten = konten.filter((k) => k.id !== buchung.kontoId);
  // Vorauswahl: der beste Kandidat, sonst der Weg über ein neu erzeugtes Gegenbein.
  const [wahl, setWahl] = useState<string>(kandidaten[0]?.id ?? "__neu");
  const [neuKontoId, setNeuKontoId] = useState(andereKonten[0]?.id ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  /** Beschriftung einer Gegenbuchung: Empfänger aus dem Import, sonst Notiz. */
  function kandidatLabel(k: IstBuchung): string {
    return umsatzByIst.get(k.id)?.gegenpartei || k.notiz || "";
  }

  async function speichern() {
    setFehler(null);
    try {
      if (wahl === "__neu") {
        await gegenbeinErzeugen(ledgerRepo, buchung, neuKontoId);
      } else {
        const gegen = alleBuchungen.find((b) => b.id === wahl);
        if (!gegen) return;
        await buchungenPaaren(ledgerRepo, buchung, gegen);
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.zurUmbuchung.titel")}
      subtitle={t("konten.zurUmbuchung.untertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.zurUmbuchung.bestaetigen")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
        {t("konten.zurUmbuchung.kandidatenTitel")}
      </div>
      {kandidaten.length === 0 ? (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.zurUmbuchung.keineKandidaten", { tage: MAX_VORSCHLAG_TAGE })}</div>
      ) : (
        kandidaten.map((k) => (
          <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
            <input type="radio" name="gegenbein" value={k.id} checked={wahl === k.id} onChange={() => setWahl(k.id)} style={{ accentColor: "var(--accent-deep)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(k.datum)}</span>
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
              {kontoName.get(k.kontoId) ?? "?"}
              {kandidatLabel(k) && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{kandidatLabel(k)}</span>}
            </span>
            <span className="num" style={{ fontWeight: 700, color: betragFarbe(k) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </label>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--sp-4) 0 var(--sp-3)", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        {t("konten.zurUmbuchung.oder")}
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="radio" name="gegenbein" value="__neu" checked={wahl === "__neu"} onChange={() => setWahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
        <select className="field" style={{ width: "auto" }} value={neuKontoId} onChange={(e) => { setNeuKontoId(e.target.value); setWahl("__neu"); }}>
          {andereKonten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
        </select>
      </label>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>

      {buchung.kategorieId && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
          {t("konten.zurUmbuchung.kategorieHinweis")}
        </div>
      )}
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
