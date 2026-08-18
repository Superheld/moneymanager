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
  realerKontostand,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type RegisterZeile,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungErfassen } from "../../application/buchungErfassen";
import { type Umsatz } from "../../application/import";
import { umbuchungErfassen } from "../../application/umbuchungErfassen";
import { postenBezahltMarkieren, bezahltZuruecknehmen } from "../../application/bezahltMarkieren";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteImportLaufRepository as laufRepo, sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteKontozuordnungRepository as zuordnungRepo } from "../persistence/sqliteBankzugangRepositories";
import type { ScreenId } from "./AppShell";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { CategoryPicker } from "./CategoryPicker";
import { BuchungDetail } from "./BuchungDetail";
import { AbrufDialog } from "./AbrufDialog";
import { ABRUF_QUELLEN, NeueBuchungen } from "./NeueBuchungen";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./einstellungenKontext";

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
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [abruf, setAbruf] = useState(false);
  /** Konten, die an einer Bankverbindung hängen — daran hängt auch der Abruf-Knopf. */
  const [onlineKonten, setOnlineKonten] = useState<Set<string>>(new Set());
  /** Abgerufene, noch nicht bestätigte Buchungen — je Konto. */
  const [neueAbrufe, setNeueAbrufe] = useState<Umsatz[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  // Alles in EINEM Zug laden und zusammen setzen. Gestaffelte await/setState-Paare
  // lassen abgeleitete Werte kurz gegen leere Listen rechnen — der Empfänger einer
  // importierten Buchung käme aus einer noch leeren Umsatz-Liste und die Zeile zeigte
  // für einen Render „Buchung" statt „[anonymisiert]".
  async function laden() {
    const [ks, bs, rs, kats, us, zuordnungen, offene, laeufe] = await Promise.all([
      kontoRepo.alle(),
      ledgerRepo.alle(),
      regelRepo.alle(),
      kategorieRepo.alle(),
      umsatzRepo.alle(),
      zuordnungRepo.alle(),
      umsatzRepo.offene(),
      laufRepo.alle(),
    ]);
    const abrufLaeufe = new Set(laeufe.filter((l) => ABRUF_QUELLEN.has(l.quelle)).map((l) => l.id));
    const neu = offene.filter((u) => abrufLaeufe.has(u.laufId));
    setNeueAbrufe(neu);
    setOnlineKonten(new Set(zuordnungen.map((z) => z.zahlungskontoId)));
    setKonten(ks);
    setIst(bs);
    setRegeln(rs);
    setKategorien(kats);
    setUmsaetze(us);
    // Vorauswahl: das Konto, auf das etwas wartet. Sonst steht die Übersicht auf dem
    // ersten Konto nach Alphabet („Bargeld"), und die abgerufenen Buchungen des
    // Girokontos sieht man erst, wenn man zufällig die richtige Zeile anklickt.
    const wartet = ks.find((k) => neu.some((u) => u.zahlungskontoId === k.id));
    setAktivId((id) => id || wartet?.id || ks[0]?.id || "");
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





  return (
    <div className="screen">
      <PageHead title={t("konten.titel")} subtitle={t("konten.untertitel")} />

      <Card
        title={t("konten.deineKonten")}
        subtitle={t("konten.deineKontenUntertitel")}
        action={
          <span style={{ display: "flex", gap: "var(--sp-2)" }}>
            {/* Nur zeigen, wenn es überhaupt etwas abzurufen gibt — ein Knopf, der
                nichts tun kann, ist eine Frage an den Nutzer statt einer Antwort. */}
            {onlineKonten.size > 0 && (
              <Button variant="primary" onClick={() => setAbruf(true)}>{t("konten.abrufen")}</Button>
            )}
            <Button plus onClick={() => onNavigate("kontenverwaltung")}>{t("konten.kontoAnlegen")}</Button>
          </span>
        }
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
              {
                key: "wartet",
                label: t("konten.spalteWartet"),
                align: "right" as const,
                sortValue: (k) => neueAbrufe.filter((u) => u.zahlungskontoId === k.id).length,
                render: (k) => {
                  const n = neueAbrufe.filter((u) => u.zahlungskontoId === k.id).length;
                  return n > 0 ? <Pill variant="plan">{t("konten.wartet", { n })}</Pill> : "—";
                },
              },
              {
                key: "verbindung",
                label: t("konten.spalteVerbindung"),
                sortValue: (k) => (onlineKonten.has(k.id) ? "0" : "1"),
                render: (k) =>
                  onlineKonten.has(k.id) ? (
                    <Pill variant="ok">{t("konten.online")}</Pill>
                  ) : (
                    <Pill variant="neutral">{t("konten.offline")}</Pill>
                  ),
              },
              { key: "anfang", label: `${t("konten.spalteAnfangsbestand")} ${geld.symbol}`, align: "right", sortValue: (k) => k.saldo, render: (k) => geld.format(k.saldo) },
              { key: "ist", label: `${t("konten.spalteIst")} ${geld.symbol}`, align: "right", sortValue: (k) => istSummeKonto(ist, k.id), render: (k) => (istSummeKonto(ist, k.id) ? geld.format(istSummeKonto(ist, k.id), { mitVorzeichen: true }) : "—") },
              { key: "real", label: `${t("konten.spalteRealerStand")} ${geld.symbol}`, align: "right", sortValue: (k) => realerKontostand(k, ist), render: (k) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(realerKontostand(k, ist))}</span> },
            ]}
            rows={konten}
          />
        )}
      </Card>

      {abruf && (
        <AbrufDialog
          onClose={() => setAbruf(false)}
          onFertig={() => void laden()}
        />
      )}

      {/* Was die Bank gebracht hat, steht VOR dem Register: es ist noch nicht Teil des
          Saldos und wartet auf eine Entscheidung. */}
      {aktivId && (
        <NeueBuchungen
          zeilen={neueAbrufe.filter((u) => u.zahlungskontoId === aktivId)}
          alleOffenen={neueAbrufe}
          kategorien={kategorien}
          onGeaendert={() => void laden()}
        />
      )}

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
              labelSeite={t("konten.seite")}
              labelErste={t("konten.seiteErste")}
              labelLetzte={t("konten.seiteLetzte")}
              labelZurueck={t("konten.seiteZurueck")}
              labelVor={t("konten.seiteVor")}
              columns={[
                { key: "datum", label: t("konten.spalteDatum"), render: (z) => ddmm(z.datum) },
                {
                  // Nicht umbrechen (flexWrap): eine zweizeilige Zeile schiebt den
                  // Seitenschalter darunter je nach Seiteninhalt nach oben oder unten,
                  // und beim Durchblättern klickt man daneben. Der volle Text steht im
                  // title, für die Fälle, in denen abgeschnitten wird.
                  key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 320,
                  render: (z) => (
                    <span title={zeilenLabel(z)} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{zeilenLabel(z)}</span>
                      {z.gegenkontoId && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{z.betrag < 0 ? "→" : "←"} {kontoName.get(z.gegenkontoId) ?? "?"}</span>}
                      {z.gegenkontoId ? <Pill variant="um">{t("konten.pillUmbuchung")}</Pill> : z.quelle === "manuell" ? <Pill variant="neutral">{t("konten.pillManuell")}</Pill> : z.quelle === "bezahlt-markiert" ? <Pill variant="neutral">{t("konten.pillBezahlt")}</Pill> : null}
                    </span>
                  ),
                },
                { key: "kat", label: t("konten.spalteKategorie"), maxWidth: 180, sortValue: (z) => (z.kategorieId ? kategorieName.get(z.kategorieId) ?? "" : ""), render: (z) => (z.kategorieId ? kategorieName.get(z.kategorieId) ?? "?" : "—") },
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
        <BuchungDetail
          buchung={editBuchung}
          onClose={() => setEditBuchung(null)}
          onGeaendert={laden}
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
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.umbuchung.notizPlatzhalter")} />
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
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
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
