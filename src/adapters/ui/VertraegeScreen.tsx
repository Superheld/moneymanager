// Verträge (P2.1) — Übersicht mit Kündigungsterminen; Anlegen im Modal. Eine Maske
// erzeugt Vertrag (Stammdaten) + abgeleitete Zahlungsregel (Planung).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  kuendigungsterminNaht,
  minorZuMajor,
  naechsteFaelligkeit,
  naechsterKuendigungstermin,
  RHYTHMUS_MONATE,
  ruecklagenbedarf,
  ruecklageProMonat,
  type Charakter,
  type Kategorie,
  type Person,
  type Rhythmus,
  type Vertrag,
  type Vertragskandidat,
  type Verlaengerungsart,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { vertragAktualisieren, vertragAnlegen, vertragLoeschen } from "../../application/vertragAnlegen";
import {
  ignorierteSchluessel,
  vertragsvorschlaege,
  vorschlagIgnorieren,
} from "../../application/vertragsvorschlaege";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteEinstellungenRepository as einstellungenRepo } from "../persistence/sqliteEinstellungenRepository";
import {
  sqliteKategorieRepository as kategorieRepo,
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";
import type { DataColumn } from "./ds/DataTable";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
/**
 * Drei Blicke auf dieselben Verträge. „liste" ist die freie Tabelle (Spaltenköpfe
 * sortieren), „faelligkeit" stellt vor, was als Nächstes abgeht, „turnus" gruppiert
 * nach Takt — dort steht auch, was die nicht-monatlichen Verträge im Monat kosten,
 * obwohl sie nicht abgehen.
 */
type Ansicht = "liste" | "faelligkeit" | "turnus";
const ANSICHTEN: Ansicht[] = ["liste", "faelligkeit", "turnus"];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

/**
 * Ein abgesetzter Block in der Maske. Die Felder eines Vertrags zerfallen in zwei
 * Gruppen, die verschieden viel wiegen: was in die Planung rechnet (Betrag, Rhythmus,
 * Fälligkeit, Konto) und was nur die Konditionen beschreibt (Laufzeit, Fristen). Als
 * eine durchgehende Wand aus Eingabefeldern sah beides gleich wichtig aus.
 */
function Abschnitt({ titel, hinweis, children }: { titel: string; hinweis?: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderTop: "1px solid var(--line)", paddingTop: "var(--sp-3)" }}>
        <h4 style={{ margin: 0, fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-black)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>
          {titel}
        </h4>
        {hinweis && <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{hinweis}</span>}
      </div>
      {children}
    </section>
  );
}

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
  const [vorschlaege, setVorschlaege] = useState<Vertragskandidat[]>([]);
  const [ansicht, setAnsicht] = useState<Ansicht>("liste");

  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [anbieter, setAnbieter] = useState("");
  const [inhaberId, setInhaberId] = useState("");
  const [beginn, setBeginn] = useState(heute);
  // Getrennt vom Beginn: der Beginn trägt die Fristen (Mindestlaufzeit, Kündigung), die
  // erste Fälligkeit den Takt der Planung. Bei einem 2015 geschlossenen Jahresvertrag
  // sind das zwei verschiedene Daten — solange ein Feld beides war, verschob das
  // Nachtragen des echten Vertragsbeginns die geplanten Zahlungen.
  const [ersteZahlung, setErsteZahlung] = useState(heute);
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

  // Verwandte Repos in EINEM Effekt und zusammen setzen — gestaffelte setState lassen
  // abgeleitete Werte kurz gegen leere Listen rechnen.
  async function laden() {
    const [v, r, p, k, ko, ignoriert] = await Promise.all([
      vertragRepo.alle(),
      regelRepo.alle(),
      personRepo.alle(),
      kategorieRepo.alle(),
      kontoRepo.alle(),
      ignorierteSchluessel(einstellungenRepo),
    ]);
    setVertraege(v);
    setRegeln(r);
    setPersonen(p);
    setKategorien(k);
    setKonten(ko);
    // Die Vorschläge lesen den gesamten Buchungsbestand — bewusst NACH den Stammdaten,
    // damit die Liste sofort steht und die Karte nachrückt.
    setVorschlaege(await vertragsvorschlaege(ledgerRepo, umsatzRepo, vertragRepo, heute, { ignoriert }));
  }
  useEffect(() => {
    laden();
  }, []);

  /** Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort. */
  function vorschlagUebernehmen(k: Vertragskandidat) {
    neu();
    setAnbieter(k.anbieter);
    setBeginn(k.ersteZahlung);
    setErsteZahlung(k.ersteZahlung);
    setBetragText(String(minorZuMajor(k.betrag, geld.waehrung)));
    setRhythmus(k.rhythmus);
    setCharakter(k.charakter);
    if (k.kategorieId) setKategorieId(k.kategorieId);
    // Das Konto, über das die erkannten Zahlungen tatsächlich liefen — steht in den
    // Buchungen und muss nicht noch einmal gesucht werden.
    if (k.kontoId) setKontoId(k.kontoId);
  }

  async function vorschlagVerwerfen(k: Vertragskandidat) {
    await vorschlagIgnorieren(einstellungenRepo, k.schluessel);
    setVorschlaege((bisher) => bisher.filter((x) => x.schluessel !== k.schluessel));
  }

  const regelZuVertrag = useMemo(() => {
    const m = new Map<string, Zahlungsregel>();
    for (const r of regeln) if (r.vertragId) m.set(r.vertragId, r);
    return m;
  }, [regeln]);
  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  const summe = useMemo(() => {
    let proMonat = 0;
    let baldKuendbar = 0;
    const eigeneRegeln: Zahlungsregel[] = [];
    for (const v of vertraege) {
      const r = regelZuVertrag.get(v.id);
      if (r) {
        proMonat += r.betrag / RHYTHMUS_MONATE[r.rhythmus];
        eigeneRegeln.push(r);
      }
      if (kuendigungsterminNaht(v, heute)) baldKuendbar++;
    }
    return {
      proMonat: Math.round(proMonat),
      proJahr: Math.round(proMonat * 12),
      baldKuendbar,
      // Was die nicht-monatlichen Abflüsse im Monat kosten, obwohl sie nicht abgehen.
      ruecklage: ruecklagenbedarf(eigeneRegeln),
    };
  }, [vertraege, regelZuVertrag, heute]);

  /** Nächste Fälligkeit je Vertrag — aus der abgeleiteten Regel, nicht aus dem Beginn. */
  const naechsteZahlung = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const v of vertraege) {
      const r = regelZuVertrag.get(v.id);
      m.set(v.id, r ? naechsteFaelligkeit(r, heute) : null);
    }
    return m;
  }, [vertraege, regelZuVertrag, heute]);

  /**
   * Die Spalten der Vertragstabelle. Als Funktion, weil die Turnus-Ansicht je Gruppe
   * eine eigene Tabelle zeigt und nur dort die Rücklagen-Spalte trägt — innerhalb einer
   * Gruppe steht der Rhythmus fest, also ist die Spalte dort auch vergleichbar.
   */
  function spalten(mitRuecklage: boolean): DataColumn[] {
    const s: DataColumn[] = [
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
        // Nach Zykluslänge sortieren, nicht alphabetisch — sonst stünde „halbjährlich"
        // vor „monatlich" und die Reihenfolge sagte nichts über den Takt.
        sortValue: (v) => {
          const r = regelZuVertrag.get(v.id);
          return r ? RHYTHMUS_MONATE[r.rhythmus] : 0;
        },
        render: (v) => {
          const r = regelZuVertrag.get(v.id);
          return r ? t(`vertraege.rhythmus.${r.rhythmus}`) : "—";
        },
      },
      {
        key: "naechste",
        label: t("vertraege.spalteNaechste"),
        // Ohne Termin ans Ende, nicht an den Anfang: „kein Termin" ist keine baldige Zahlung.
        sortValue: (v) => naechsteZahlung.get(v.id) ?? "9999-12-31",
        render: (v) => naechsteZahlung.get(v.id) ?? <span className="muted">—</span>,
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
    ];
    if (mitRuecklage) {
      s.push({
        key: "ruecklage",
        label: `${t("vertraege.spalteRuecklage")} ${geld.symbol}`,
        align: "right",
        sortValue: (v) => {
          const r = regelZuVertrag.get(v.id);
          return r ? ruecklageProMonat(r) : 0;
        },
        render: (v) => {
          const r = regelZuVertrag.get(v.id);
          const wert = r ? ruecklageProMonat(r) : 0;
          return wert > 0 ? geld.format(wert) : <span className="muted">—</span>;
        },
      });
    }
    s.push(
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
    );
    return s;
  }

  /** Nach nächster Fälligkeit aufsteigend; Verträge ohne Termin ans Ende. */
  const nachFaelligkeit = useMemo(
    () =>
      [...vertraege].sort((a, b) =>
        (naechsteZahlung.get(a.id) ?? "9999-12-31").localeCompare(naechsteZahlung.get(b.id) ?? "9999-12-31"),
      ),
    [vertraege, naechsteZahlung],
  );

  /** Gruppen der Turnus-Ansicht: je Rhythmus eine, zuletzt die Verträge ohne Zahlung. */
  const turnusGruppen = useMemo(() => {
    const gruppen = RHYTHMEN.map((r) => ({
      key: r as string,
      titel: t(`vertraege.rhythmus.${r}`),
      mitRuecklage: RHYTHMUS_MONATE[r] > 1,
      vertraege: vertraege.filter((v) => regelZuVertrag.get(v.id)?.rhythmus === r),
    }));
    const ohne = vertraege.filter((v) => !regelZuVertrag.get(v.id));
    if (ohne.length) gruppen.push({ key: "ohne", titel: t("vertraege.gruppeOhneRegel"), mitRuecklage: false, vertraege: ohne });
    return gruppen.filter((g) => g.vertraege.length > 0);
  }, [vertraege, regelZuVertrag, t]);

  /** Kopfzeile einer Turnus-Gruppe: Anzahl, Monatsanteil und — falls nötig — die Rücklage. */
  function gruppenUntertitel(g: { vertraege: Vertrag[]; mitRuecklage: boolean }): string {
    const regeln = g.vertraege.map((v) => regelZuVertrag.get(v.id)).filter((r): r is Zahlungsregel => !!r);
    const proMonat = Math.round(regeln.reduce((sum, r) => sum + r.betrag / RHYTHMUS_MONATE[r.rhythmus], 0));
    const basis = t("vertraege.gruppeMeta", {
      count: g.vertraege.length,
      betrag: `${geld.format(proMonat, { mitVorzeichen: true })} ${geld.symbol}`,
    });
    if (!g.mitRuecklage) return basis;
    const rueck = ruecklagenbedarf(regeln);
    if (rueck <= 0) return basis;
    return `${basis} · ${t("vertraege.gruppeRuecklage", { betrag: `${geld.format(rueck)} ${geld.symbol}` })}`;
  }

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
    setErsteZahlung(heute);
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
    setErsteZahlung(r?.startdatum ?? v.beginn);
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
      ersteZahlung: ersteZahlung || undefined,
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
          {summe.ruecklage > 0 && (
            <KPIStat size="chip" label={t("vertraege.kpiRuecklage")} value={geld.format(summe.ruecklage)} unit={geld.symbol} meta={t("vertraege.kpiRuecklageMeta")} />
          )}
          {summe.baldKuendbar > 0 && <KPIStat size="chip" label={t("vertraege.kpiBald")} value={String(summe.baldKuendbar)} tone="warn" />}
        </div>
      )}

      {vorschlaege.length > 0 && (
        <Card
          title={t("vertraege.vorschlaegeTitel")}
          subtitle={t("vertraege.vorschlaegeUntertitel", { count: vorschlaege.length })}
        >
          <p className="muted" style={{ fontSize: "var(--fs-small)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
            {t("vertraege.vorschlaegeHinweis")}
          </p>
          <DataTable
            sortable
            pageSize={10}
            columns={[
              { key: "anbieter", label: t("vertraege.spalteAnbieter"), render: (k: Vertragskandidat) => k.anbieter },
              {
                key: "charakter",
                label: t("vertraege.spalteCharakter"),
                sortValue: (k: Vertragskandidat) => k.charakter,
                render: (k: Vertragskandidat) => (
                  <Pill variant={CHARAKTER_PILL[k.charakter]}>{t(`charakter.${k.charakter}`)}</Pill>
                ),
              },
              { key: "rhythmus", label: t("vertraege.spalteRhythmus"), render: (k: Vertragskandidat) => t(`vertraege.rhythmus.${k.rhythmus}`) },
              {
                key: "betrag",
                label: `${t("vertraege.spalteBetrag")} ${geld.symbol}`,
                align: "right",
                sortValue: (k: Vertragskandidat) => k.betrag,
                render: (k: Vertragskandidat) => geld.format(k.betrag),
              },
              {
                // Die Stabilität sagt, wie ernst der vorgeschlagene Betrag zu nehmen ist:
                // 100 % = immer derselbe (Miete), 30 % = Mittelwert (Strom, Mobilfunk).
                key: "stabil",
                label: t("vertraege.spalteStabil"),
                align: "right",
                sortValue: (k: Vertragskandidat) => k.betragStabilitaet,
                render: (k: Vertragskandidat) =>
                  k.betragStabilitaet >= 0.8 ? (
                    <Pill variant="ok">{t("vertraege.betragFest")}</Pill>
                  ) : (
                    <Pill variant="neutral">{t("vertraege.betragSchwankt")}</Pill>
                  ),
              },
              { key: "anzahl", label: t("vertraege.spalteZahlungen"), align: "right", render: (k: Vertragskandidat) => String(k.anzahl) },
              { key: "letzte", label: t("vertraege.spalteLetzte"), render: (k: Vertragskandidat) => k.letzteZahlung },
              {
                key: "_u",
                label: "",
                align: "right",
                sortable: false,
                render: (k: Vertragskandidat) => (
                  <button className="linkbtn" onClick={() => vorschlagUebernehmen(k)}>
                    {t("vertraege.vorschlagUebernehmen")}
                  </button>
                ),
              },
              {
                key: "_v",
                label: "",
                align: "right",
                sortable: false,
                render: (k: Vertragskandidat) => (
                  <button className="linkbtn" onClick={() => vorschlagVerwerfen(k)}>
                    {t("vertraege.vorschlagVerwerfen")}
                  </button>
                ),
              },
            ]}
            rows={vorschlaege}
          />
        </Card>
      )}

      {vertraege.length === 0 ? (
        <Card>
          <div className="muted">{t("vertraege.leer")}</div>
        </Card>
      ) : (
        <>
          {/* Umschalter: eine Fläche, drei Blicke auf dieselben Verträge. */}
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)" }}>
            {ANSICHTEN.map((a, i) => {
              const an = ansicht === a;
              return (
                <button key={a} type="button" aria-pressed={an} onClick={() => setAnsicht(a)}
                  style={{ padding: "6px 12px", fontSize: "12.5px", fontWeight: an ? "var(--fw-bold)" : "var(--fw-semi)", fontFamily: "var(--font-ui)", border: "none", borderLeft: i ? "1px solid var(--line-soft)" : "none", background: an ? "var(--accent-wash)" : "transparent", color: an ? "var(--accent-deep)" : "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {t(`vertraege.ansicht.${a}`)}
                </button>
              );
            })}
          </div>

          {ansicht === "turnus" ? (
            turnusGruppen.map((g) => (
              <Card key={g.key} title={g.titel} subtitle={gruppenUntertitel(g)}>
                <DataTable sortable pageSize={25} columns={spalten(g.mitRuecklage)} rows={g.vertraege} />
              </Card>
            ))
          ) : (
            <Card>
              <DataTable
                // Ohne key behielte die Tabelle beim Ansichtswechsel ihre angeklickte
                // Sortierung — die neue Reihenfolge wäre dann unsichtbar.
                key={ansicht}
                sortable
                pageSize={25}
                columns={spalten(false)}
                rows={ansicht === "faelligkeit" ? nachFaelligkeit : vertraege}
              />
            </Card>
          )}
        </>
      )}

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
          <FormField label={t("vertraege.feldAnbieter")} required>
            <input className="field" value={anbieter} onChange={(e) => setAnbieter(e.target.value)} placeholder={t("vertraege.feldAnbieterPlatzhalter")} />
          </FormField>

          <Abschnitt titel={t("vertraege.abschnittZahlung")} hinweis={t("vertraege.abschnittZahlungHinweis")}>
            <div className="form-grid">
              <FormField label={`${t("vertraege.feldBetrag")} ${geld.symbol}`} required hint={t("vertraege.feldBetragHinweis")}>
                <input className="field" inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} placeholder={geld.format(0)} />
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
              <FormField label={t("vertraege.feldErsteZahlung")} hint={t("vertraege.feldErsteZahlungHinweis")}>
                <input className="field" type="date" value={ersteZahlung} onChange={(e) => setErsteZahlung(e.target.value)} />
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
            </div>
          </Abschnitt>

          <Abschnitt titel={t("vertraege.abschnittVertrag")} hinweis={t("vertraege.abschnittVertragHinweis")}>
            <div className="form-grid">
              <FormField label={t("vertraege.feldBeginn")} hint={t("vertraege.feldBeginnHinweis")}>
                <input className="field" type="date" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
              </FormField>
              <FormField label={t("vertraege.feldInhaber")} hint={t("vertraege.optional")}>
                <select className="field" value={inhaberId} onChange={(e) => setInhaberId(e.target.value)}>
                  <option value="">—</option>
                  {personen.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t("vertraege.feldMindestlaufzeit")} hint={t("vertraege.optional")}>
                <input className="field" inputMode="numeric" value={mindestlaufzeit} onChange={(e) => setMindestlaufzeit(e.target.value)} placeholder={t("vertraege.feldMindestlaufzeitPlatzhalter")} />
              </FormField>
              <FormField label={t("vertraege.feldKuendigungsfrist")} hint={t("vertraege.optional")}>
                <input className="field" inputMode="numeric" value={kuendigungsfrist} onChange={(e) => setKuendigungsfrist(e.target.value)} placeholder={t("vertraege.feldKuendigungsfristPlatzhalter")} />
              </FormField>
              <FormField label={t("vertraege.feldVerlaengerung")}>
                <select className="field" value={verlaengerung} onChange={(e) => setVerlaengerung(e.target.value as Verlaengerungsart)}>
                  <option value="automatisch">{t("vertraege.verlaengerung.automatisch")}</option>
                  <option value="keine">{t("vertraege.verlaengerung.keine")}</option>
                </select>
              </FormField>
              {/* Ohne automatische Verlängerung hat der Schritt keine Bedeutung — ein Feld,
                  das nichts tut, kostet in jeder Maske Aufmerksamkeit. */}
              {verlaengerung === "automatisch" && (
                <FormField label={t("vertraege.feldVerlaengerungMonate")} hint={t("vertraege.feldVerlaengerungMonateHinweis")}>
                  <input className="field" inputMode="numeric" value={verlaengerungMonate} onChange={(e) => setVerlaengerungMonate(e.target.value)} placeholder={t("vertraege.feldVerlaengerungMonatePlatzhalter")} />
                </FormField>
              )}
            </div>
          </Abschnitt>
        </Modal>
      )}
    </div>
  );
}
