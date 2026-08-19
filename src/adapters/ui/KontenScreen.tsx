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
  registerSicht,
  type Charakter,
  type IstBuchung,
  type Kontensicht,
  type Registerzeile,
  type RegisterZeile,
  type Zahlungskonto,
} from "../../application";
import { type Umsatz } from "../../application/import";
import {
  alsBezahltMarkieren,
  bezahltZurueck,
  konten as kontenLaden,
  umbuchungErfassen,
} from "../dienste";
import type { ScreenId } from "./AppShell";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { BuchungDetail } from "./BuchungDetail";
import { SammelDialog } from "./SammelDialog";
import { AbrufDialog } from "./AbrufDialog";
import { NeueBuchungen } from "./NeueBuchungen";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";
import { IconButton } from "./IconButton";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./einstellungenKontext";
import { geldFarbe } from "./geldFarbe";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_IDS: ReadonlySet<string> = new Set();

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
/**
 * Datum einer Registerzeile — MIT Jahr. Ohne es liest sich eine Liste, die über den
 * Jahreswechsel reicht, als wäre alles aus demselben Jahr; im Register stehen aber alle
 * Buchungen eines Kontos, nicht nur die des laufenden Jahres.
 */
function datumKurz(iso: string): string {
  const [j, m, d] = iso.split("-");
  return `${d}.${m}.${j}`;
}

export function KontenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Kontensicht | null>(null);
  const [aktivId, setAktivId] = useState("");
  const [tage, setTage] = useState(30);
  const [katFilter, setKatFilter] = useState("alle");
  const [artFilter, setArtFilter] = useState<"alle" | "einnahmen" | "ausgaben" | "umbuchung">("alle");
  const [regSuche, setRegSuche] = useState("");
  /**
   * Nur die Zeilen zeigen, die womöglich doppelt im Konto stehen.
   *
   * Seit der Abruf direkt bucht, gibt es keine Vorstufe mehr, in der ein Zwilling
   * auffiele — die Frage „steht das schon drin?" gehört deshalb an den Auszug selbst.
   */
  const [nurDubletten, setNurDubletten] = useState(false);
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<IstBuchung | null>(null);
  /**
   * Massenbearbeitung — auf Wunsch, nicht immer. Eine dauerhafte Kästchenspalte macht
   * aus einer Leseansicht ein Formular; sie erscheint erst, wenn man sie einschaltet.
   */
  const [auswahlModus, setAuswahlModus] = useState(false);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [sammelOffen, setSammelOffen] = useState(false);
  /** Die abgerufene Zeile, die gerade im Dialog liegt — noch nichts davon ist gebucht. */
  const [entwurf, setEntwurf] = useState<Umsatz | null>(null);
  const [abruf, setAbruf] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // EIN Ladevorgang, EIN setState. Gestaffelte await/setState-Paare lassen abgeleitete
  // Werte kurz gegen leere Listen rechnen — der Empfänger einer importierten Buchung
  // käme aus einer noch leeren Umsatz-Liste und die Zeile zeigte für einen Render
  // „Buchung" statt „[anonymisiert]".
  async function laden() {
    const s = await kontenLaden();
    setSicht(s);
    // Vorauswahl: das Konto, auf das etwas wartet. Sonst steht die Übersicht auf dem
    // ersten Konto nach Alphabet („Bargeld"), und die abgerufenen Buchungen des
    // Girokontos sieht man erst, wenn man zufällig die richtige Zeile anklickt.
    const wartet = s.zeilen.find((z) => z.wartet > 0);
    setAktivId((id) => id || wartet?.konto.id || s.zeilen[0]?.konto.id || "");
  }
  useEffect(() => {
    laden();
  }, []);

  // Beim Kontowechsel die Filter zurücksetzen.
  useEffect(() => {
    setKatFilter("alle");
    setArtFilter("alle");
    setRegSuche("");
    setNurDubletten(false);
    // Die Auswahl gehört zum Register des Kontos — sie über einen Wechsel mitzunehmen
    // hiesse, Buchungen zu ändern, die man nicht mehr vor sich hat.
    setAuswahl(new Set());
  }, [aktivId]);

  const kontozeilen = sicht?.zeilen ?? [];
  const kategorien = sicht?.kategorien ?? [];
  const ist = sicht?.buchungen ?? [];
  const umsaetze = sicht?.umsaetze ?? [];
  const neueAbrufe = sicht?.neueAbrufe ?? [];
  const kontoName = sicht?.kontoNamen ?? LEERE_NAMEN;
  const ausBankabruf = sicht?.ausBankabruf ?? LEERE_IDS;
  const aktivZeile = kontozeilen.find((z) => z.konto.id === aktivId);
  const aktiv = aktivZeile?.konto;

  const register = useMemo(
    () => (sicht && aktiv ? registerSicht(sicht, aktiv, heute, tage) : null),
    [sicht, aktiv, heute, tage],
  );

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  // Kategorien, die im gebuchten Register wirklich vorkommen (für das Filter-Dropdown).
  const kategorienImRegister = useMemo(() => {
    const ids = new Set<string>();
    for (const z of register?.gebucht ?? []) if (z.zeile.kategorieId) ids.add(z.zeile.kategorieId);
    return [...ids].map((id) => ({ id, name: kategorieName.get(id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [register, kategorieName]);

  const gebuchtGefiltert = useMemo(() => {
    const q = regSuche.trim().toLowerCase();
    // „12,50" soll die Zeile über 12,50 € finden, egal ob sie ein Zu- oder Abfluss ist.
    // Zwei Wege nebeneinander, weil beide gebraucht werden: der geparste Betrag trifft
    // exakt (auch „12" → 12,00), der formatierte Text erlaubt das Suchen nach Anfängen
    // („1.2" findet 1.234,56). Nur der Text allein hätte „12" nie auf 12,00 gebracht.
    const qBetrag = regSuche.trim() ? geld.parse(regSuche.trim()) : null;
    return (register?.gebucht ?? []).filter((r) => {
      const z = r.zeile;
      if (nurDubletten && !r.dublette) return false;
      if (katFilter === "__ohne" ? !!z.kategorieId : katFilter !== "alle" && z.kategorieId !== katFilter) return false;
      if (artFilter === "umbuchung" && !z.gegenkontoId) return false;
      if (artFilter === "einnahmen" && !(z.betrag > 0 && !z.gegenkontoId)) return false;
      if (artFilter === "ausgaben" && !(z.betrag < 0 && !z.gegenkontoId)) return false;
      if (q) {
        const heu = `${r.bezeichnung} ${r.verwendungszweck} ${r.kategorieName} ${geld.format(Math.abs(z.betrag))}`.toLowerCase();
        const trifftBetrag = qBetrag != null && Math.abs(z.betrag) === Math.abs(qBetrag);
        if (!heu.includes(q) && !trifftBetrag) return false;
      }
      return true;
    });
  }, [register, katFilter, artFilter, regSuche, nurDubletten, geld]);

  /** Wie viele Zeilen des Registers überhaupt einen Verdacht tragen. */
  const dublettenAnzahl = useMemo(
    () => (register?.gebucht ?? []).filter((r) => r.dublette).length,
    [register],
  );

  // Standardansicht: neueste zuerst (Tabelle sortiert/paginiert intern weiter).
  const gebuchtFuerTabelle = useMemo(() => [...gebuchtGefiltert].reverse(), [gebuchtGefiltert]);

  async function abhaken(z: RegisterZeile, schonBezahlt: boolean) {
    if (!z.planRef) return;
    setFehler(null);
    try {
      if (schonBezahlt) {
        await bezahltZurueck(z.planRef.quelleId, z.planRef.faelligkeit);
      } else {
        const regel = (sicht?.regeln ?? []).find((r) => r.id === z.planRef!.quelleId);
        if (regel) await alsBezahltMarkieren(regel, z.planRef.faelligkeit, aktivId);
      }
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /** Die markierten Zeilen als echte Buchungen — nur die, die es noch gibt. */
  const gewaehlteBuchungen = useMemo(
    () => ist.filter((b) => auswahl.has(b.id)),
    [ist, auswahl],
  );

  function auswahlUmschalten(id: string) {
    setAuswahl((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  /**
   * Alles-Markieren bezieht sich auf das GEFILTERTE Register, nicht auf die sichtbare
   * Seite. Wer nach „[anonymisiert]" filtert und alles markiert, meint alle [anonymisiert]-Zeilen — nicht
   * die ersten fünfundzwanzig davon.
   */
  const alleIds = useMemo(
    () => gebuchtGefiltert.map((r) => r.zeile.istId).filter((x): x is string => !!x),
    [gebuchtGefiltert],
  );
  const alleGewaehlt = alleIds.length > 0 && alleIds.every((id) => auswahl.has(id));





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
            {kontozeilen.some((z) => z.online) && (
              <Button variant="primary" onClick={() => setAbruf(true)}>{t("konten.abrufen")}</Button>
            )}
            <Button plus onClick={() => onNavigate("kontenverwaltung")}>{t("konten.kontoAnlegen")}</Button>
          </span>
        }
      >
        {kontozeilen.length === 0 ? (
          <div className="muted">{t("konten.keineKonten")}</div>
        ) : (
          <DataTable
            sortable
            onRowClick={(z) => setAktivId(z.konto.id)}
            istAktiv={(z) => z.konto.id === aktivId}
            columns={[
              { key: "bezeichnung", label: t("konten.spalteBezeichnung"), render: (z) => (<span style={{ fontWeight: z.konto.id === aktivId ? "var(--fw-bold)" : "var(--fw-semi)" }}>{z.konto.bezeichnung}</span>) },
              { key: "typ", label: t("konten.spalteTyp"), sortValue: (z) => z.konto.typ, render: (z) => <Pill variant="neutral">{t(`konten.typ.${z.konto.typ}`)}</Pill> },
              {
                key: "wartet",
                label: t("konten.spalteWartet"),
                align: "right" as const,
                sortValue: (z) => z.wartet,
                render: (z) => (z.wartet > 0 ? <Pill variant="plan">{t("konten.wartet", { n: z.wartet })}</Pill> : "—"),
              },
              {
                key: "verbindung",
                label: t("konten.spalteVerbindung"),
                sortValue: (z) => (z.online ? "0" : "1"),
                render: (z) =>
                  z.online ? (
                    <Pill variant="ok">{t("konten.online")}</Pill>
                  ) : (
                    <Pill variant="neutral">{t("konten.offline")}</Pill>
                  ),
              },
              { key: "ist", label: `${t("konten.spalteIst")} ${geld.symbol}`, align: "right", sortValue: (z) => z.bewegungen, render: (z) => (z.bewegungen ? geld.format(z.bewegungen, { mitVorzeichen: true }) : "—") },
              { key: "real", label: `${t("konten.spalteRealerStand")} ${geld.symbol}`, align: "right", sortValue: (z) => z.realerStand, render: (z) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(z.realerStand)}</span> },
            ]}
            rows={[...kontozeilen]}
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
          // Verglichen wird gegen alles, was auf diesem Konto schon liegt — verbucht,
          // offen ODER verworfen, nur nicht gegen die neuen Zeilen selbst.
          bestand={umsaetze.filter(
            (u) => u.zahlungskontoId === aktivId && !neueAbrufe.some((n) => n.id === u.id),
          )}
          // Weggelegte Zeilen desselben Kontos aus einem Abruf — der Rückweg.
          weggelegte={umsaetze.filter(
            (u) =>
              u.zahlungskontoId === aktivId &&
              (u.status === "verworfen" || u.status === "duplikat") &&
              (sicht?.abrufLaeufe.has(u.laufId) ?? false),
          )}
          alleNeuen={neueAbrufe}
          konten={kontozeilen.map((z) => z.konto)}
          kategorien={[...kategorien]}
          onOeffnen={setEntwurf}
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
              {/* Woraus die grosse Zahl darüber besteht — ausgeschrieben statt als
                  „Anfangsbestand [Betrag] € · Σ Ist +[Betrag] €". Die alte Fassung nannte
                  zwei Zahlen und verschwieg, dass sie zusammen genau den Stand darüber
                  ergeben; „Σ Ist" hiess dabei nichts, was ausserhalb des Codes jemand
                  wissen konnte. */}
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.standHerkunft", {
                  anfang: geld.formatMitSymbol(aktiv.saldo),
                  bewegung: geld.formatMitSymbol(aktivZeile?.bewegungen ?? 0, { mitVorzeichen: true }),
                })}
              </div>

              {/* Der Abgleich gegen die Bank. Ohne ihn ist der Stand oben nur in sich
                  schlüssig — er kann vollständig aussehen und trotzdem eine Buchung
                  vermissen. Die Differenz macht daraus eine Aussage: null heißt
                  beweisbar vollständig, alles andere benennt, wieviel fehlt.
                  Vorzeichen mit Bedeutung: die Bank hat mehr (+) → es fehlt eine
                  Einnahme; die App hat mehr (−) → eine Ausgabe fehlt oder etwas ist
                  doppelt drin. */}
              {(() => {
                const stand = aktivZeile?.bankSaldo;
                if (!stand) return null;
                const diff = aktivZeile?.abweichung ?? 0;
                return (
                  <div style={{ fontSize: "var(--fs-xs)", marginTop: 6, display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "baseline" }}>
                    <Pill variant={diff === 0 ? "ok" : "warn"}>
                      {diff === 0
                        ? t("konten.abgleich.stimmt")
                        : t("konten.abgleich.differenz", { betrag: geld.formatMitSymbol(diff, { mitVorzeichen: true }) })}
                    </Pill>
                    <span className="muted">
                      {t("konten.abgleich.bankSagt", {
                        betrag: geld.formatMitSymbol(stand.betrag),
                        datum: stand.datum ?? "?",
                      })}
                    </span>
                    {diff !== 0 && (
                      <span className="muted">
                        {t(diff > 0 ? "konten.abgleich.bankMehr" : "konten.abgleich.appMehr")}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <select className="field" style={{ width: "auto" }} value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {TAGE_OPTIONEN.map((d) => (<option key={d} value={d}>{t("konten.kommendeTage", { tage: d })}</option>))}
              </select>
              {kontozeilen.length >= 2 && <Button plus onClick={() => { setFehler(null); setUmbuchenOffen(true); }}>{t("konten.umbuchen")}</Button>}
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
            {/* Erscheint nur, wenn es etwas zu sehen gibt. Ein Schalter, der dauerhaft
                „0 mögliche Dubletten" anbietet, ist eine Frage ohne Antwort. */}
            {dublettenAnzahl > 0 && (
              <button
                type="button"
                aria-pressed={nurDubletten}
                onClick={() => setNurDubletten((x) => !x)}
                style={{
                  padding: "5px 10px", fontSize: "12.5px", fontFamily: "var(--font-ui)",
                  fontWeight: "var(--fw-bold)", borderRadius: "var(--r-md)", cursor: "pointer",
                  border: "1px solid var(--warn, var(--line))",
                  background: nurDubletten ? "var(--warn, #b8860b)" : "var(--warn-wash, transparent)",
                  color: nurDubletten ? "var(--surface, #fff)" : "var(--warn-deep, var(--ink-2))",
                  whiteSpace: "nowrap",
                }}
              >
                {t("konten.dubletten.filter", { n: dublettenAnzahl })}
              </button>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)", color: "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={auswahlModus}
                onChange={(e) => { setAuswahlModus(e.target.checked); if (!e.target.checked) setAuswahl(new Set()); }}
                style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
              />
              {t("konten.sammel.modus")}
            </label>
          </div>

          {/* Die Aktionsleiste erscheint erst, wenn etwas markiert ist — vorher gäbe es
              nichts zu tun, und ein grauer Knopf ist eine Frage ohne Antwort. */}
          {auswahlModus && auswahl.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--accent-wash)" }}>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--accent-deep)" }}>
                {t("konten.sammel.gewaehlt", { n: auswahl.size })}
              </span>
              <Button variant="primary" onClick={() => setSammelOffen(true)}>{t("konten.sammel.bearbeiten")}</Button>
              <button className="linkbtn" onClick={() => setAuswahl(new Set())}>{t("konten.sammel.aufheben")}</button>
            </div>
          )}

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
                // Die Auswahlspalte gibt es nur im Auswahlmodus — sonst hätte jede Zeile
                // dauerhaft ein Kästchen, das in neun von zehn Sitzungen niemand braucht.
                ...(auswahlModus
                  ? [{
                      key: "_sel",
                      label: (
                        <input
                          type="checkbox"
                          checked={alleGewaehlt}
                          aria-label={t("konten.sammel.alleWaehlen")}
                          onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(alleIds))}
                          style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                        />
                      ),
                      sortable: false,
                      render: (r: Registerzeile) =>
                        r.zeile.istId ? (
                          <input
                            type="checkbox"
                            checked={auswahl.has(r.zeile.istId)}
                            aria-label={t("konten.sammel.zeileWaehlen")}
                            onChange={() => auswahlUmschalten(r.zeile.istId!)}
                            style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                          />
                        ) : null,
                    }]
                  : []),
                { key: "datum", label: t("konten.spalteDatum"), render: (r) => datumKurz(r.zeile.datum) },
                {
                  // Nicht umbrechen (flexWrap): eine zweizeilige Zeile schiebt den
                  // Seitenschalter darunter je nach Seiteninhalt nach oben oder unten,
                  // und beim Durchblättern klickt man daneben. Der volle Text steht im
                  // title, für die Fälle, in denen abgeschnitten wird.
                  key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 320,
                  render: (r) => (
                    <span title={r.bezeichnung} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.bezeichnung}</span>
                      {r.zeile.gegenkontoId && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.zeile.betrag < 0 ? "→" : "←"} {kontoName.get(r.zeile.gegenkontoId) ?? "?"}</span>}
                      {!r.zeile.gegenkontoId && (r.zeile.quelle === "manuell" ? <Pill variant="neutral">{t("konten.pillManuell")}</Pill> : r.zeile.quelle === "bezahlt-markiert" ? <Pill variant="neutral">{t("konten.pillBezahlt")}</Pill> : null)}
                      {/* Der Verdacht steht an BEIDEN Zeilen — es gibt kein Original.
                          Die Gründe hängen im title, entschieden wird im Detail. */}
                      {r.dublette && (
                        // Der title sitzt am Wrapper, nicht an der Pille: `ds/` ist aus
                        // dem Design-System kopiert und kennt die Eigenschaft nicht —
                        // dort wird nichts erfunden.
                        <span
                          style={{ flex: "0 0 auto", display: "inline-flex" }}
                          title={`${r.dublette.gruende.join(" · ")} · ${t("konten.dubletten.zwilling", { datum: r.dublette.zwillingDatum })}`}
                        >
                          <Pill variant="warn">
                            {t(r.dublette.urteil === "identisch" ? "konten.dubletten.sicher" : "konten.dubletten.verdacht")}
                          </Pill>
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  // Die Umbuchungs-Pille steht HIER, nicht bei der Beschreibung: eine
                  // Umbuchung trägt keine Kategorie (sie verschiebt nur eigenes Geld),
                  // die Pille sagt also genau das, was in dieser Spalte fehlt. Vorher
                  // stand sie rechts neben dem Empfänger und die Kategorie-Spalte zeigte
                  // daneben einen Strich — zwei Zeichen für dieselbe Aussage.
                  key: "kat", label: t("konten.spalteKategorie"), maxWidth: 180,
                  sortValue: (r) => (r.zeile.gegenkontoId ? "" : r.kategorieName),
                  render: (r) =>
                    r.zeile.gegenkontoId
                      ? <Pill variant="um">{t("konten.pillUmbuchung")}</Pill>
                      : r.kategorieName || "—",
                },
                { key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right", sortValue: (r) => r.zeile.betrag, render: (r) => <span className="num" style={{ fontWeight: 700, color: geldFarbe(r.zeile.betrag) }}>{geld.format(r.zeile.betrag, { mitVorzeichen: true })}</span> },
                { key: "saldo", label: `${t("konten.spalteSaldo")} ${geld.symbol}`, align: "right", sortValue: (r) => r.zeile.saldo, render: (r) => geld.format(r.zeile.saldo) },
                {
                  key: "_a", label: "", align: "right", sortable: false,
                  render: (r) => <IconButton icon="bearbeiten" label={t("konten.bearbeiten")} onClick={() => r.buchung && setEditBuchung(r.buchung)} />,
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
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 66 }}>{datumKurz(z.datum)}</span>
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

      {/* Anlegen und Bearbeiten sind derselbe Dialog: ohne `buchung` legt er eine neue an,
          vorbelegt mit dem Konto, dessen Register gerade offen ist. */}
      {buchenOffen && aktiv && (
        <BuchungDetail
          vorgabe={{ kontoId: aktiv.id, datum: heute }}
          onClose={() => setBuchenOffen(false)}
          onGeaendert={laden}
        />
      )}

      {editBuchung && (
        <BuchungDetail
          buchung={editBuchung}
          // Was die BANK geliefert hat, wird nicht von Hand gelöscht — beim nächsten
          // Abruf käme es zurück, und bis dahin stimmte der Saldo nicht mehr mit ihr
          // überein. Der Weg für so eine Zeile ist das Verwerfen im Abruf. Was aus einer
          // Datei kam, hat diese Bindung nicht und ist löschbar.
          loeschenGesperrt={ausBankabruf.has(editBuchung.id)}
          onClose={() => setEditBuchung(null)}
          onGeaendert={laden}
        />
      )}

      {sammelOffen && (
        <SammelDialog
          buchungen={gewaehlteBuchungen}
          kategorien={[...kategorien]}
          gesperrteIds={ausBankabruf}
          onClose={() => setSammelOffen(false)}
          onGeaendert={async () => { setAuswahl(new Set()); await laden(); }}
        />
      )}

      {/* Derselbe Dialog für die Bankzeile — er schreibt erst beim Übernehmen oder
          Verwerfen. Wegklicken lässt den Entwurf unangetastet stehen. */}
      {entwurf && (
        <BuchungDetail
          entwurf={entwurf}
          onClose={() => setEntwurf(null)}
          onGeaendert={laden}
        />
      )}

      {umbuchenOffen && aktiv && (
        <UmbuchungModal
          konten={kontozeilen.map((z) => z.konto)}
          vonId={aktivId}
          heute={heute}
          onClose={() => setUmbuchenOffen(false)}
          onSaved={async () => { setUmbuchenOffen(false); await laden(); }}
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
          <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color: geldFarbe(betrag), minWidth: 92, textAlign: "right" }}>{geld.formatMitSymbol(betrag, { mitVorzeichen: true })}</span>
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
      await umbuchungErfassen({ vonKontoId: von, nachKontoId: nach, datum, betrag: geld.parse(betrag) ?? 0, notiz });
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
