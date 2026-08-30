// Verträge (P2.1) — Übersicht mit Kündigungsterminen; Anlegen im Modal. Eine Maske
// erzeugt Vertrag (Stammdaten) + abgeleitete Zahlungsregel (Planung).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  hauptkategorie,
  RHYTHMUS_MONATE,
  type Charakter,
  type IstBuchung,
  type Rhythmus,
  type Vertrag,
  type Vertragskandidat,
  type Vertragssicht,
  type Zahlungsregel,
} from "../../../application";
import {
  vertraege as vertraegeLaden,
  vertragLoeschen,
  vertragsvorschlagIgnorieren,
} from "../../dienste";
import { Button, Card, DataTable, KPIStat, Pill } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import type { DataColumn } from "../bausteine/DataTable";
import { PageHead } from "../bausteine/PageHead";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { geldFarbe } from "../bausteine/geldFarbe";
import { IconButton } from "../bausteine/IconButton";
import {
  formularAusKandidat,
  formularAusVertrag,
  leeresFormular,
  VertragModal,
  type VertragFormular,
} from "./VertragModal";
import { VertragErkennungModal } from "./VertragErkennungModal";
import { useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_KENNZAHLEN = { proMonat: 0, proJahr: 0, baldKuendbar: 0, ruecklage: 0 } as const;

/** Die Turnus-Ansicht zeigt je Rhythmus eine Gruppe — in dieser Reihenfolge. */
const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
/**
 * Vier Blicke auf dieselben Verträge. „liste" zeigt alle nach Betrag, „faelligkeit"
 * stellt vor, was als Nächstes abgeht, „turnus" gruppiert nach Takt — dort steht auch,
 * was die nicht-monatlichen Verträge im Monat kosten, obwohl sie nicht abgehen —, und
 * „kategorie" beantwortet, WOFÜR die festen Kosten draufgehen.
 *
 * Die Tabellen sind bewusst NICHT sortierbar: eine angeklickte Spalte überschreibt genau
 * die Ordnung, die die gewählte Ansicht ausmacht — wer in „faelligkeit" nach Anbieter
 * sortiert, sieht dieselbe Tabelle wie in „liste" und hat den Umschalter entwertet.
 * Innerhalb einer Ansicht steht die Reihenfolge fest: nach Betrag, groß nach klein
 * (in „faelligkeit" nach Termin — das IST dort die Aussage).
 */
type Ansicht = "liste" | "faelligkeit" | "turnus" | "kategorie";
const ANSICHTEN: Ansicht[] = ["liste", "faelligkeit", "turnus", "kategorie"];
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
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Vertragssicht | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("liste");
  /** Welcher Vertrag seine zugeordneten Zahlungen zeigt — aufgeklappt unter der Tabelle. */
  const [zahlungenVon, setZahlungenVon] = useState<string | null>(null);

  /**
   * Die offene Maske: `start` ist ihr Anfangszustand, `editId` unterscheidet Ändern von
   * Anlegen. Der Formularzustand selbst liegt in `VertragModal` — der Screen gibt nur
   * die Vorbelegung hinein und erfährt, wenn gespeichert wurde.
   */
  const [maske, setMaske] = useState<{ editId: string | null; start: VertragFormular } | null>(null);
  /** Der Vorschlag, dessen Erkennung gerade aufgeschlagen ist. */
  const [befund, setBefund] = useState<Vertragskandidat | null>(null);
  /** Der Vertrag, dessen Erkennungsregel gerade bearbeitet wird. */
  const [regelVon, setRegelVon] = useState<Vertrag | null>(null);

  // EIN Ladevorgang, EIN setState. Die Sicht bringt den Bestand vorher auf Stand
  // (Erkennungen nachziehen, Zuordnungen abgleichen) — beides billig, wenn nichts zu tun
  // ist, und ohne es bliebe der Bestand blind, bis jemand einen Vertrag anfasst.
  async function laden() {
    setSicht(await vertraegeLaden(heute));
  }
  useEffect(() => {
    laden();
  }, []);

  const zeilen = sicht?.zeilen ?? [];
  const vertraege = useMemo(() => zeilen.map((z) => z.vertrag), [zeilen]);
  const kategorien = sicht?.kategorien ?? [];
  const vorschlaege = sicht?.vorschlaege ?? [];
  const personName = sicht?.personNamen ?? LEERE_NAMEN;
  const summe = sicht?.kennzahlen ?? LEERE_KENNZAHLEN;
  const zeileZu = useMemo(() => new Map(zeilen.map((z) => [z.vertrag.id, z])), [zeilen]);
  const zahlungsdetail = zahlungenVon ? zeileZu.get(zahlungenVon) : undefined;

  /** Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort. */
  function vorschlagUebernehmen(k: Vertragskandidat) {
    setMaske({ editId: null, start: formularAusKandidat(k, heute, geld) });
  }

  async function vorschlagVerwerfen(k: Vertragskandidat) {
    await vertragsvorschlagIgnorieren(k.schluessel);
    await laden();
  }

  const regelZuVertrag = useMemo(() => {
    const m = new Map<string, Zahlungsregel>();
    for (const z of zeilen) if (z.regel) m.set(z.vertrag.id, z.regel);
    return m;
  }, [zeilen]);

  /**
   * Die Spalten der Vertragstabelle. Als Funktion, weil die Turnus-Ansicht je Gruppe
   * eine eigene Tabelle zeigt und nur dort die Rücklagen-Spalte trägt — innerhalb einer
   * Gruppe steht der Rhythmus fest, also ist die Spalte dort auch vergleichbar.
   */
  function spalten(mitRuecklage: boolean): DataColumn[] {
    const s: DataColumn[] = [
      {
        key: "anbieter",
        label: t("vertraege.spalteAnbieter"),
        // Nur der Dauervertrag bekommt eine Pille — er ist der Sonderfall. Eine Pille an
        // jeder Zeile („Abo") sagte nichts und kostete eine Spaltenbreite.
        render: (v) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {/* Der Anbieter führt zu den Zahlungen, die der Abgleich diesem Vertrag
                zugeordnet hat. Die Spalte daneben nennt nur ihre ANZAHL — die sagt „die
                Regel greift", aber nicht WAS sie greift. Erst an der Liste sieht man den
                Fehlgriff: eine fremde Zahlung an denselben Empfänger zählt genauso mit
                und macht aus einer falschen Zuordnung eine gute Kennzahl. */}
            <Zeilenlink
              onKlick={() => setZahlungenVon(zahlungenVon === v.id ? null : v.id)}
              titel={t("vertraege.zeigeZahlungen", { anbieter: v.anbieter })}
            >
              {v.anbieter}
            </Zeilenlink>
            {v.art === "dauervertrag" && <Pill variant="neutral">{t("vertraege.artKurz.dauervertrag")}</Pill>}
          </span>
        ),
      },
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
        render: (v) => zeileZu.get(v.id)?.naechsteZahlung ?? <span className="muted">—</span>,
      },
      {
        key: "kuendigung",
        label: t("vertraege.spalteKuendigenBis"),
        render: (v) => {
          const termin = zeileZu.get(v.id)?.kuendigungstermin ?? null;
          if (!termin) return <span className="muted">—</span>;
          const naht = zeileZu.get(v.id)?.kuendigungNaht ?? false;
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
      {
        // Greift die Erkennung? Eine Null heißt: die Regel findet nichts.
        key: "zahlungen",
        label: t("vertraege.spalteZugeordnet"),
        align: "right",
        render: (v) => {
          const n = zeileZu.get(v.id)?.zahlungen ?? 0;
          return n > 0 ? String(n) : <Pill variant="warn">{t("vertraege.keineZuordnung")}</Pill>;
        },
      },
    ];
    if (mitRuecklage) {
      s.push({
        key: "ruecklage",
        label: `${t("vertraege.spalteRuecklage")} ${geld.symbol}`,
        align: "right",
        render: (v) => {
          const wert = zeileZu.get(v.id)?.ruecklage ?? 0;
          return wert > 0 ? geld.format(wert) : <span className="muted">—</span>;
        },
      });
    }
    s.push(
      {
        // Woran wird dieser Vertrag in den Buchungen erkannt — und wie steuert man nach?
        key: "_r",
        label: "",
        align: "right",
        render: (v) => (
          <IconButton icon="regel" label={t("vertraege.regel.aktion")} onClick={() => setRegelVon(v)} />
        ),
      },
      { key: "_e", label: "", align: "right", render: (v) => <IconButton icon="bearbeiten" label={t("vertraege.bearbeiten")} onClick={() => bearbeiten(v)} /> },
      {
        key: "_x",
        label: "",
        align: "right",
        render: (v) => (
          <IconButton
            icon="loeschen"
            ton="gefahr"
            label={t("vertraege.loeschen")}
            onClick={() => loeschfrage.stellen({
              // `v` IST der Vertrag, nicht die Zeile um ihn herum: die Tabelle bekommt
              // `vertraege` (= `zeilen.map(z => z.vertrag)`), und alles daneben schlägt
              // über `v.id` in `zeileZu` nach. Hier stand `v.vertrag.anbieter` — der
              // Zugriff warf beim Klick, der Bestätigungsdialog ging nie auf, und das
              // Löschen sah aus wie ein Knopf ohne Wirkung. `render: (row: any)` in
              // `DataTable.d.ts` hält den Typecheck davon fern; deshalb der Test unten.
              name: v.anbieter,
              // Die Kaskade ist hier echt und nicht klein: vertragLoeschen nimmt die
              // Zahlungsregel, die Erkennungsregel und JEDE Zuordnung mit — auch die von
              // Hand gesetzten. Wer das nicht weiss, verliert Handarbeit.
              folgen: t("vertraege.loeschenFolgen"),
              ausfuehren: async () => { await vertragLoeschen(v.id); await laden(); },
            })}
          />
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
        (zeileZu.get(a.id)?.naechsteZahlung ?? "9999-12-31").localeCompare(
          zeileZu.get(b.id)?.naechsteZahlung ?? "9999-12-31",
        ),
      ),
    [vertraege, zeileZu],
  );

  /** Betrag mit Vorzeichen und Währungssymbol — die Schreibweise der Gruppenköpfe. */
  function betragText(cent: number): string {
    return `${geld.format(Math.round(cent), { mitVorzeichen: true })} ${geld.symbol}`;
  }
  /** Die Regeln der Verträge einer Gruppe (Verträge ohne Regel fallen raus). */
  function regelnVon(vs: Vertrag[]): Zahlungsregel[] {
    return vs.map((v) => regelZuVertrag.get(v.id)).filter((r): r is Zahlungsregel => !!r);
  }

  /**
   * Gruppen der Turnus-Ansicht: je Rhythmus eine, zuletzt die Verträge ohne Zahlung.
   *
   * Der Kopf nennt zwei VERSCHIEDENE Zahlen: was in der Gruppe je Fälligkeit abgeht
   * (die Summe — bei „jährlich" der Jahresbetrag) und was das im Monat ausmacht. Vorher
   * standen dort der Monatsanteil und der Rücklagenbedarf, und die sind bei einer reinen
   * Abflussgruppe derselbe Wert: zweimal „pro Monat" mit identischem Betrag. Der
   * Rücklagenbedarf steht weiterhin in der Tabellenspalte und in der KPI oben.
   * Bei monatlichem Takt sind Summe und Monatsanteil ohnehin dasselbe — dort nur eine Zahl.
   */
  const turnusGruppen = useMemo(() => {
    const gruppen = RHYTHMEN.map((r) => {
      // Auch hier Betrag groß nach klein — innerhalb einer Turnus-Gruppe ist das die
      // einzige Ordnung, die etwas aussagt: der Takt ist ja schon gleich.
      const drin = vertraege
        .filter((v) => regelZuVertrag.get(v.id)?.rhythmus === r)
        .sort((a, b) => betragsRang(b) - betragsRang(a));
      const monate = RHYTHMUS_MONATE[r];
      const summe = regelnVon(drin).reduce((s, x) => s + x.betrag, 0);
      return {
        key: r as string,
        titel: t(`vertraege.rhythmus.${r}`),
        mitRuecklage: monate > 1,
        vertraege: drin,
        meta:
          monate > 1
            ? t("vertraege.gruppeMetaTurnus", {
                count: drin.length,
                summe: betragText(summe),
                proMonat: betragText(summe / monate),
              })
            : t("vertraege.gruppeMeta", { count: drin.length, betrag: betragText(summe) }),
      };
    });
    const ohne = vertraege.filter((v) => !regelZuVertrag.get(v.id));
    if (ohne.length) {
      gruppen.push({
        key: "ohne",
        titel: t("vertraege.gruppeOhneRegel"),
        mitRuecklage: false,
        vertraege: ohne,
        meta: t("vertraege.gruppeMetaOhne", { count: ohne.length }),
      });
    }
    return gruppen.filter((g) => g.vertraege.length > 0);
  }, [vertraege, regelZuVertrag, geld, t]);

  /**
   * Gruppen der Kategorie-Ansicht. Beantwortet die Frage, die weder Liste noch Turnus
   * beantworten: WOFÜR gehen die festen Kosten drauf? Ein Blick auf „Wohnen 1.240 €,
   * Versicherungen 210 €" sagt mehr über den Haushalt als dieselben Verträge nach
   * Abbuchungstakt sortiert.
   *
   * Gruppiert wird über die Kategorie der REGEL, nicht des Vertrags — der Vertrag trägt
   * keine; die Kategorie ist eine Eigenschaft der Zahlung. Und über deren HAUPTkategorie,
   * nicht über die gebuchte Unterkategorie: gebucht wird auf „Strom", „Gas", „Wasser",
   * und drei Gruppen mit je einem Vertrag beantworten die Frage „wofür geht das Geld?"
   * schlechter als eine Gruppe „Wohnen". Dieselbe Rollup-Regel, nach der auch Budgets
   * und Budgetvorschläge rechnen.
   *
   * Die Rücklagen-Spalte hängt hier daran, ob überhaupt ein nicht-monatlicher Vertrag in
   * der Gruppe steckt: anders als beim Turnus ist der Takt innerhalb einer Kategorie
   * gemischt. Aus demselben Grund nennt der Kopf Monats- UND Jahressumme statt einer
   * Summe „je Fälligkeit" — die gäbe es hier gar nicht, die Fälligkeiten sind gemischt.
   */
  const kategorieGruppen = useMemo(() => {
    const nachId = new Map<string, Vertrag[]>();
    const titelVon = new Map<string, string>();
    for (const v of vertraege) {
      const kategorieId = regelZuVertrag.get(v.id)?.kategorieId;
      const haupt = kategorieId ? hauptkategorie(kategorien, kategorieId) : undefined;
      const id = haupt?.id ?? "__ohne";
      if (haupt) titelVon.set(id, haupt.name);
      const liste = nachId.get(id);
      if (liste) liste.push(v);
      else nachId.set(id, [v]);
    }
    /** Was die Gruppe im Monat kostet — danach ordnen sich die Gruppen. */
    const proMonat = (vs: Vertrag[]) =>
      regelnVon(vs).reduce((sum, r) => sum + r.betrag / RHYTHMUS_MONATE[r.rhythmus], 0);

    return [...nachId.entries()]
      .map(([id, vs]) => {
        const monat = proMonat(vs);
        return {
          key: id,
          titel: titelVon.get(id) ?? t("vertraege.gruppeOhneKategorie"),
          mitRuecklage: regelnVon(vs).some((r) => RHYTHMUS_MONATE[r.rhythmus] > 1),
          vertraege: [...vs].sort((a, b) => betragsRang(b) - betragsRang(a)),
          meta: t("vertraege.gruppeMetaKategorie", {
            count: vs.length,
            proMonat: betragText(monat),
            proJahr: betragText(monat * 12),
          }),
          gewicht: Math.abs(monat),
          // „ohne Kategorie" ganz nach hinten: es ist keine Kategorie, sondern ihr Fehlen.
          ohne: id === "__ohne",
        };
      })
      .sort((a, b) => (a.ohne !== b.ohne ? (a.ohne ? 1 : -1) : b.gewicht - a.gewicht));
  }, [vertraege, regelZuVertrag, kategorien, geld, t]);

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
          <KPIStat size="chip" label={t("vertraege.kpiProMonat")} value={geld.format(summe.proMonat, { mitVorzeichen: true })} unit={geld.symbol} tone={summe.proMonat < 0 ? "warn" : "ok"} />
          <KPIStat size="chip" label={t("vertraege.kpiProJahr")} value={geld.format(summe.proJahr, { mitVorzeichen: true })} unit={geld.symbol} tone={summe.proJahr < 0 ? "warn" : "ok"} />
          {summe.ruecklage > 0 && (
            // Ohne meta-Zeile: sie machte genau diese Karte eine Zeile höher als ihre
            // Nachbarn, und die Reihe stand sichtbar schief. Was sie erklärte, steht
            // jetzt im Label.
            <KPIStat size="chip" label={t("vertraege.kpiRuecklage")} value={geld.format(summe.ruecklage)} unit={geld.symbol} />
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
                  <IconButton icon="details" label={t("vertraege.erkennung.aktion")} onClick={() => setBefund(k)} />
                ),
              },
              {
                key: "_u",
                label: "",
                align: "right",
                sortable: false,
                render: (k: Vertragskandidat) => (
                  <IconButton icon="uebernehmen" label={t("vertraege.vorschlagUebernehmen")} onClick={() => vorschlagUebernehmen(k)} />
                ),
              },
              {
                key: "_v",
                label: "",
                align: "right",
                sortable: false,
                render: (k: Vertragskandidat) => (
                  <IconButton icon="verwerfen" label={t("vertraege.vorschlagVerwerfen")} onClick={() => vorschlagVerwerfen(k)} />
                ),
              },
            ]}
            rows={[...vorschlaege]}
          />
        </Card>
      )}

      {vertraege.length === 0 ? (
        <Card>
          <div className="muted">{t("vertraege.leer")}</div>
        </Card>
      ) : (
        /*
         * EINE Card für alle vier Ansichten. Der Umschalter sitzt darin wie eine
         * Filterleiste (dieselbe Bauform wie im Kontenregister) — vorher stand er
         * außerhalb und die gruppierenden Ansichten sprengten die Fläche in eine Card je
         * Gruppe. Damit sah derselbe Bestand je nach Umschalterstellung aus wie ein
         * anderer Screen; die Gruppen sind aber eine Gliederung INNERHALB der Liste,
         * keine eigenständigen Bereiche.
         */
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
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
            {/*
              Die Ordnung steht fest und ist nicht klickbar (siehe Ansicht-Doku oben) —
              also gehört sie hingeschrieben. Sonst sucht man die Sortierpfeile in den
              Spaltenköpfen und hält ihr Fehlen für einen Fehler.
            */}
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t(`vertraege.ordnung.${ansicht}`)}</span>
          </div>

          {ansicht === "turnus" || ansicht === "kategorie" ? (
            (ansicht === "turnus" ? turnusGruppen : kategorieGruppen).map((g, i) => (
              <div
                key={g.key}
                // Trennlinie statt Rahmen: die Gruppen liegen jetzt in EINER Fläche und
                // brauchen nur eine Naht, keine eigene Kante.
                style={i > 0 ? { borderTop: "1px solid var(--line)", marginTop: "var(--sp-5)", paddingTop: "var(--sp-5)" } : undefined}
              >
                <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>{g.titel}</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", margin: "3px 0 var(--sp-3)" }}>{g.meta}</div>
                <DataTable pageSize={25} columns={spalten(g.mitRuecklage)} rows={g.vertraege} />
              </div>
            ))
          ) : (
            <DataTable
              // Ohne key bliebe beim Ansichtswechsel die aufgeschlagene Seite stehen —
              // Seite 3 von „liste" ist in „faelligkeit" ein anderer Ausschnitt.
              key={ansicht}
              pageSize={25}
              columns={spalten(false)}
              rows={ansicht === "faelligkeit" ? nachFaelligkeit : nachBetrag}
            />
          )}
        </Card>
      )}

      {/* Die Zahlungen des gewählten Vertrags. Sie stehen UNTER der Tabelle und nicht in
          einem Dialog: man vergleicht sie mit dem, was in der Zeile darüber steht — Betrag,
          Rhythmus, nächste Fälligkeit —, und ein Dialog verdeckte genau das. */}
      {zahlungsdetail && (
        <Card
          style={{ marginTop: "var(--gap-card)" }}
          title={t("vertraege.zahlungenTitel", { anbieter: zahlungsdetail.vertrag.anbieter })}
        >
          {zahlungsdetail.zahlungsliste.length === 0 ? (
            <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("vertraege.keineZahlungen")}
            </div>
          ) : (
            <DataTable
              sortable
              pageSize={15}
              columns={[
                { key: "datum", label: t("konten.spalteDatum") },
                {
                  key: "betrag",
                  label: `${t("konten.spalteBetrag")} ${geld.symbol}`,
                  align: "right" as const,
                  render: (b: IstBuchung) => (
                    <span style={{ color: geldFarbe(b.betrag) }}>{geld.format(b.betrag)}</span>
                  ),
                },
                {
                  key: "charakter",
                  label: t("vertraege.spalteCharakter"),
                  render: (b: IstBuchung) => t(`charakter.${b.charakter}`),
                },
              ]}
              rows={[...zahlungsdetail.zahlungsliste]}
            />
          )}
        </Card>
      )}

      {befund && <ErkennungsDialog kandidat={befund} onClose={() => setBefund(null)} />}

      {regelVon && (
        <VertragErkennungModal
          vertrag={regelVon}
          onClose={() => setRegelVon(null)}
          onSaved={async () => { setRegelVon(null); await laden(); }}
        />
      )}

      {maske && (
        <VertragModal
          editId={maske.editId}
          start={maske.start}
          onClose={() => setMaske(null)}
          onSaved={async () => { setMaske(null); await laden(); }}
        />
      )}
      {loeschfrage.dialog}

    </div>
  );
}
