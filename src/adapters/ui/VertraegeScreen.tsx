// Verträge (P2.1) — Übersicht mit Kündigungsterminen; Anlegen im Modal. Eine Maske
// erzeugt Vertrag (Stammdaten) + abgeleitete Zahlungsregel (Planung).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  kuendigungsterminNaht,
  naechsteFaelligkeit,
  naechsterKuendigungstermin,
  RHYTHMUS_MONATE,
  ruecklagenbedarf,
  ruecklageProMonat,
  type Charakter,
  type Person,
  type Rhythmus,
  type Vertrag,
  type Vertragskandidat,
  type Zahlungsregel,
} from "../../core";
import { vertragLoeschen } from "../../application/vertragAnlegen";
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
import { sqlitePersonRepository as personRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, KPIStat, Pill } from "./ds";
import { Modal } from "./Modal";
import type { DataColumn } from "./ds/DataTable";
import { PageHead } from "./PageHead";
import {
  formularAusKandidat,
  formularAusVertrag,
  leeresFormular,
  VertragModal,
  type VertragFormular,
} from "./VertragModal";
import { useGeld } from "./einstellungenKontext";

/** Die Turnus-Ansicht zeigt je Rhythmus eine Gruppe — in dieser Reihenfolge. */
const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
/**
 * Drei Blicke auf dieselben Verträge. „liste" zeigt alle nach Betrag, „faelligkeit"
 * stellt vor, was als Nächstes abgeht, „turnus" gruppiert nach Takt — dort steht auch,
 * was die nicht-monatlichen Verträge im Monat kosten, obwohl sie nicht abgehen.
 *
 * Die Tabellen sind bewusst NICHT sortierbar: eine angeklickte Spalte überschreibt genau
 * die Ordnung, die die gewählte Ansicht ausmacht — wer in „faelligkeit" nach Anbieter
 * sortiert, sieht dieselbe Tabelle wie in „liste" und hat den Umschalter entwertet.
 * Innerhalb einer Ansicht steht die Reihenfolge fest: nach Betrag, groß nach klein
 * (in „faelligkeit" nach Termin — das IST dort die Aussage).
 */
type Ansicht = "liste" | "faelligkeit" | "turnus";
const ANSICHTEN: Ansicht[] = ["liste", "faelligkeit", "turnus"];
const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = {
  Aufwand: "aufwand",
  Ertrag: "ertrag",
  Umschichtung: "um",
};

/**
 * „Woran erkannt?" — die Prüfungen, die bei diesem Kandidaten angeschlagen haben, je
 * mit dem gemessenen Wert UND der Schwelle.
 *
 * Warum das sichtbar gehört: ein Vorschlag ohne Begründung lässt nur zwei Reaktionen zu
 * — blind übernehmen oder blind wegklicken. Wer sieht, dass 68 Zahlungen im 30-Tage-Takt
 * an dieselbe Gläubiger-ID gingen, entscheidet anders als bei drei Zahlungen mit
 * schwankendem Abstand. Und wenn die Erkennung danebenliegt, ist hier zu sehen, warum.
 */
function ErkennungsDialog({ kandidat, onClose }: { kandidat: Vertragskandidat; onClose: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const b = kandidat.befund;

  function Zeile({ label, wert }: { label: string; wert: string }) {
    return (
      <div style={{ display: "flex", gap: "var(--sp-3)", padding: "7px 0", alignItems: "baseline", borderBottom: "1px solid var(--line-soft)" }}>
        <span style={{ flex: "0 0 32%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: "break-word" }}>{wert}</span>
      </div>
    );
  }

  return (
    <Modal
      title={t("vertraege.erkennung.titel")}
      subtitle={kandidat.anbieter}
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t("vertraege.erkennung.schliessen")}</Button>}
    >
      <p className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-3)", maxWidth: 620 }}>
        {t("vertraege.erkennung.hinweis")}
      </p>

      <Zeile
        label={t("vertraege.erkennung.schluessel")}
        wert={
          b.schluesselArt === "glaeubigerId"
            ? t("vertraege.erkennung.schluesselGlaeubiger", { wert: b.schluesselWert })
            : t("vertraege.erkennung.schluesselName", { wert: b.schluesselWert })
        }
      />
      <Zeile
        label={t("vertraege.erkennung.termine")}
        wert={t("vertraege.erkennung.termineWert", { termine: b.termine, min: b.minTermine, von: kandidat.ersteZahlung, bis: kandidat.letzteZahlung })}
      />
      <Zeile
        label={t("vertraege.erkennung.takt")}
        wert={t("vertraege.erkennung.taktWert", {
          tage: b.medianAbstandTage,
          rhythmus: t(`vertraege.rhythmus.${kandidat.rhythmus}`),
          von: b.rhythmusFenster[0],
          bis: b.rhythmusFenster[1],
        })}
      />
      <Zeile
        label={t("vertraege.erkennung.regelmaessig")}
        wert={t("vertraege.erkennung.regelmaessigWert", { nah: b.abstaendeNah, gesamt: b.abstaendeGesamt, prozent: Math.round(b.minAnteilNah * 100) })}
      />
      <Zeile
        label={t("vertraege.erkennung.betrag")}
        wert={t("vertraege.erkennung.betragWert", {
          median: `${geld.format(kandidat.betrag)} ${geld.symbol}`,
          nah: b.betraegeNah,
          gesamt: b.betraegeGesamt,
          toleranz: `${geld.format(b.betragsToleranz)} ${geld.symbol}`,
        })}
      />
      <Zeile
        label={t("vertraege.erkennung.richtung")}
        wert={t("vertraege.erkennung.richtungWert", { charakter: t(`charakter.${kandidat.charakter}`) })}
      />
      <Zeile
        label={t("vertraege.erkennung.laufend")}
        wert={t("vertraege.erkennung.laufendWert", { tage: b.letzteVorTagen, grenze: b.beendetAbTagen })}
      />
    </Modal>
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
  const [vorschlaege, setVorschlaege] = useState<Vertragskandidat[]>([]);
  const [ansicht, setAnsicht] = useState<Ansicht>("liste");

  /**
   * Die offene Maske: `start` ist ihr Anfangszustand, `editId` unterscheidet Ändern von
   * Anlegen. Der Formularzustand selbst liegt in `VertragModal` — der Screen gibt nur
   * die Vorbelegung hinein und erfährt, wenn gespeichert wurde.
   */
  const [maske, setMaske] = useState<{ editId: string | null; start: VertragFormular } | null>(null);
  /** Der Vorschlag, dessen Erkennung gerade aufgeschlagen ist. */
  const [befund, setBefund] = useState<Vertragskandidat | null>(null);

  // Verwandte Repos in EINEM Effekt und zusammen setzen — gestaffelte setState lassen
  // abgeleitete Werte kurz gegen leere Listen rechnen.
  async function laden() {
    const [v, r, p, ignoriert] = await Promise.all([
      vertragRepo.alle(),
      regelRepo.alle(),
      personRepo.alle(),
      ignorierteSchluessel(einstellungenRepo),
    ]);
    setVertraege(v);
    setRegeln(r);
    setPersonen(p);
    // Die Vorschläge lesen den gesamten Buchungsbestand — bewusst NACH den Stammdaten,
    // damit die Liste sofort steht und die Karte nachrückt.
    setVorschlaege(await vertragsvorschlaege(ledgerRepo, umsatzRepo, vertragRepo, heute, { ignoriert }));
  }
  useEffect(() => {
    laden();
  }, []);

  /** Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort. */
  function vorschlagUebernehmen(k: Vertragskandidat) {
    setMaske({ editId: null, start: formularAusKandidat(k, heute, geld) });
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
      { key: "inhaber", label: t("vertraege.spalteInhaber"), render: (v) => (v.inhaberId ? personName.get(v.inhaberId) ?? "?" : "—") },
      {
        key: "charakter",
        label: t("vertraege.spalteCharakter"),
        render: (v) => {
          const r = regelZuVertrag.get(v.id);
          return r ? <Pill variant={CHARAKTER_PILL[r.charakter]}>{t(`charakter.${r.charakter}`)}</Pill> : "—";
        },
      },
      {
        key: "rhythmus",
        label: t("vertraege.spalteRhythmus"),
        render: (v) => {
          const r = regelZuVertrag.get(v.id);
          return r ? t(`vertraege.rhythmus.${r.rhythmus}`) : "—";
        },
      },
      {
        key: "naechste",
        label: t("vertraege.spalteNaechste"),
        render: (v) => naechsteZahlung.get(v.id) ?? <span className="muted">—</span>,
      },
      {
        key: "kuendigung",
        label: t("vertraege.spalteKuendigenBis"),
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
        render: (v) => {
          const r = regelZuVertrag.get(v.id);
          const wert = r ? ruecklageProMonat(r) : 0;
          return wert > 0 ? geld.format(wert) : <span className="muted">—</span>;
        },
      });
    }
    s.push(
      { key: "_e", label: "", align: "right", render: (v) => <button className="linkbtn" onClick={() => bearbeiten(v)}>{t("vertraege.bearbeiten")}</button> },
      {
        key: "_x",
        label: "",
        align: "right",
        render: (v) => (
          <button className="linkbtn" onClick={() => vertragLoeschen(vertragRepo, regelRepo, v.id).then(laden)}>
            {t("vertraege.loeschen")}
          </button>
        ),
      },
    );
    return s;
  }

  /**
   * Die Grundordnung: großer Betrag zuerst. Verglichen wird der BETRAG, nicht sein
   * Vorzeichen — sonst stünden alle Einnahmen vor allen Ausgaben, und die Frage „was
   * kostet am meisten?" wäre nur noch am Ende der Liste zu beantworten. Verträge ohne
   * Regel tragen keinen Betrag und fallen ans Ende.
   */
  function betragsRang(v: Vertrag): number {
    const r = regelZuVertrag.get(v.id);
    return r ? Math.abs(r.betrag) : -1;
  }
  const nachBetrag = useMemo(
    () => [...vertraege].sort((a, b) => betragsRang(b) - betragsRang(a)),
    [vertraege, regelZuVertrag],
  );

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
      // Auch hier Betrag groß nach klein — innerhalb einer Turnus-Gruppe ist das die
      // einzige Ordnung, die etwas aussagt: der Takt ist ja schon gleich.
      vertraege: vertraege
        .filter((v) => regelZuVertrag.get(v.id)?.rhythmus === r)
        .sort((a, b) => betragsRang(b) - betragsRang(a)),
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

  function neu() {
    setMaske({ editId: null, start: leeresFormular(heute) });
  }
  function bearbeiten(v: Vertrag) {
    setMaske({ editId: v.id, start: formularAusVertrag(v, regelZuVertrag.get(v.id), geld) });
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
                key: "_r",
                label: "",
                align: "right",
                sortable: false,
                render: (k: Vertragskandidat) => (
                  <button className="linkbtn" onClick={() => setBefund(k)}>
                    {t("vertraege.erkennung.aktion")}
                  </button>
                ),
              },
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
                <DataTable pageSize={25} columns={spalten(g.mitRuecklage)} rows={g.vertraege} />
              </Card>
            ))
          ) : (
            <Card>
              <DataTable
                // Ohne key bliebe beim Ansichtswechsel die aufgeschlagene Seite stehen —
                // Seite 3 von „liste" ist in „faelligkeit" ein anderer Ausschnitt.
                key={ansicht}
                pageSize={25}
                columns={spalten(false)}
                rows={ansicht === "faelligkeit" ? nachFaelligkeit : nachBetrag}
              />
            </Card>
          )}
        </>
      )}

      {befund && <ErkennungsDialog kandidat={befund} onClose={() => setBefund(null)} />}

      {maske && (
        <VertragModal
          editId={maske.editId}
          start={maske.start}
          onClose={() => setMaske(null)}
          onSaved={async () => { setMaske(null); await laden(); }}
        />
      )}
    </div>
  );
}
