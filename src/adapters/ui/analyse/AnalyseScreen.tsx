// Analyse (Rückblick) — echte Einnahmen und Ausgaben pro Monat aus den verbuchten
// Ist-Buchungen, realer Saldo-Verlauf über die Zeit, Aufschlüsselung nach Kategorien.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().
//
// Abgetrennt von der Übersicht (2026-08-19): dort steht, was JETZT gilt — die drei
// Monatskarten und die Budgets des laufenden Monats. Alles, was einen Zeitraum
// auswertet, hat einen eigenen Bereich bekommen. Vorher war das ein Screen, den man
// nach unten scrollen musste, bis die Kategorien kamen.
//
// **Seit 2026-11-08 in Registern.** Untereinander war die Seite so lang, dass man für
// die Befunde oder ein Depot an allem anderen vorbeiscrollte; mit Reitern ist jeder
// Abschnitt einen Klick entfernt, und die Leiste selbst zeigt, was es gibt. Die Filter
// stehen seit 2026-11-09 am Register, das sie einstellen (siehe `zeitraumWahl`), ihr
// Zustand bleibt gemeinsam — wer im Verlauf einen Monat wählt, sieht in den Kategorien
// denselben.
//
// Was hier NICHT umgekehrt wurde: die Befunde bleiben innerhalb ihres Registers sieben
// Karten untereinander (siehe `BefundeBereich.tsx`). Dort galt und gilt, dass niemand
// sucht, was hinter einem Reiter liegt; ein Reiter „Befunde" sagt aber, was darunter ist,
// sieben Reiter „Treue", „Ohne Plan", „Ausreißer" sagten es nicht mehr.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseAufschluesselung,
  analyseBuchungen,
  analyseFenster,
  analyseFensterTaggenau,
  analyseAusblick,
  analyseBefunde,
  analyseGruppen,
  analyseVerlauf,
  type Analysebasis,
  type GruppenSumme,
  type Depotdaten,
  type IstBuchung,
} from "../../../application";
import { analyse, depots } from "../../dienste";
import { Card, CoverageTrack, DataTable, KPIStat, Pill } from "../bausteine";
import { AUFKLAPP_ZEILEN_SCHMAL, aufklappHoehe } from "../bausteine/aufklappen";
import { Aufklapptabelle } from "../bausteine/Aufklapptabelle";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { AusblickKarte } from "./AusblickKarte";
import { BefundeBereich } from "./BefundeBereich";
import { MonatsFlussChart } from "./MonatsFlussChart";
import { DepotAnsicht } from "./DepotAnsicht";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";
import { Auswahl } from "../bausteine/Auswahl";
import { PageHead } from "../bausteine/PageHead";
import { Registerleiste } from "../bausteine/Registerleiste";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe, geldTon } from "../bausteine/geldFarbe";

import type { KategorieSumme } from "../../../application";
import { Umschalter } from "../bausteine/Umschalter";
import { fehlerMelden } from "../bausteine/Meldungen";

type Zeitraum = "12" | "24" | "jahr" | "alles";

/** Die Register in Anzeigereihenfolge — dieselbe, in der sie vorher untereinander standen. */
type AnalyseRegister = "verlauf" | "kategorien" | "ausblick" | "befunde" | "depot";

/**
 * Eine Sektion (Ausgaben/Einnahmen/Umschichtungen) mit ihren Zeilen.
 *
 * `monate` > 1 blendet den Schnitt pro Monat ein: über einen Zeitraum sagt „4.800 € für
 * Lebensmittel" wenig, „Ø 400 €/Monat" dagegen sofort etwas.
 */
function KategorieSektion({ titel, items, ohneLabel, onSelect, aktivId, renderDetail, monate = 1 }: { titel: string; items: KategorieSumme[]; ohneLabel?: string; onSelect?: (id: string, name: string) => void; aktivId?: string; renderDetail?: (id: string) => ReactNode; monate?: number }) {
  const { t } = useTranslation();
  const geld = useGeld();
  /** „450,00 € · Ø 37,50" — der Schnitt steht bei der Zahl, mit der er sich vergleicht. */
  const mitSchnitt = (summe: number) =>
    monate > 1
      ? `${geld.formatMitSymbol(summe, { mitVorzeichen: true })} · Ø ${geld.format(Math.round(summe / monate))}`
      : geld.formatMitSymbol(summe, { mitVorzeichen: true });

  if (items.length === 0) return null;
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.summe)));
  const summe = items.reduce((s, i) => s + i.summe, 0);
  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
        <span>{titel}</span>
        <span className="num">{geld.formatMitSymbol(summe, { mitVorzeichen: true })}</span>
      </div>
      {items.map((i) => {
        const klickbar = !!onSelect && !!i.kategorieId;
        const aktiv = !!aktivId && i.kategorieId === aktivId;
        return (
          // Zeile und Detail sind GESCHWISTER, nicht ineinander — wie in der
          // Gruppen-Ansicht. Lag das Detail im klickbaren Div, schloss jeder Klick in
          // die Tabelle die Kategorie wieder (der Klick blubberte zur Zeile hoch), und
          // die Einfärbung der offenen Zeile legte sich als Rahmen um die Tabelle.
          <div key={i.kategorieId ?? "__ohne"}>
            <div
              onClick={klickbar ? () => onSelect!(i.kategorieId!, i.name) : undefined}
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: klickbar ? "pointer" : "default", background: aktiv ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
            >
              <CoverageTrack
                value={Math.abs(i.summe)}
                max={maxAbs}
                over={false}
                label={`${aktiv ? "▾ " : "▸ "}${i.kategorieId ? i.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${i.anzahl}`}
                right={mitSchnitt(i.summe)}
              />
            </div>
            {aktiv && renderDetail && i.kategorieId && renderDetail(i.kategorieId)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sektion in der Hauptgruppen-Ansicht: drei Ebenen statt zwei. Aufklappen zeigt erst die
 * Unterkategorien der Gruppe, deren Aufklappen dann die Buchungen — so bleibt die oberste
 * Ebene lesbar, auch wenn darunter 69 Kategorien hängen.
 */
function GruppenSektion({ titel, gruppen, ohneLabel, offeneGruppe, onGruppe, offeneKat, onKat, renderDetail, monate = 1 }: {
  titel: string;
  gruppen: GruppenSumme[];
  ohneLabel?: string;
  offeneGruppe?: string;
  onGruppe: (id: string) => void;
  offeneKat?: string;
  onKat: (id: string) => void;
  renderDetail: (id: string) => ReactNode;
  monate?: number;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  /** „450,00 € · Ø 37,50" — der Schnitt steht bei der Zahl, mit der er sich vergleicht. */
  const mitSchnitt = (summe: number) =>
    monate > 1
      ? `${geld.formatMitSymbol(summe, { mitVorzeichen: true })} · Ø ${geld.format(Math.round(summe / monate))}`
      : geld.formatMitSymbol(summe, { mitVorzeichen: true });

  if (gruppen.length === 0) return null;
  const maxAbs = Math.max(1, ...gruppen.map((g) => Math.abs(g.summe)));
  const summe = gruppen.reduce((s, g) => s + g.summe, 0);

  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
        <span>{titel}</span>
        <span className="num">{geld.formatMitSymbol(summe, { mitVorzeichen: true })}</span>
      </div>
      {gruppen.map((g) => {
        const schluessel = g.kategorieId ?? "__ohne";
        const offen = offeneGruppe === schluessel;
        return (
          <div key={schluessel}>
            <div
              onClick={() => onGruppe(schluessel)}
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: "pointer", background: offen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
            >
              <CoverageTrack
                value={Math.abs(g.summe)}
                max={maxAbs}
                over={false}
                label={`${offen ? "▾ " : "▸ "}${g.kategorieId ? g.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${g.anzahl}`}
                right={mitSchnitt(g.summe)}
              />
            </div>
            {offen && (
              <div style={{
                marginLeft: "var(--sp-4)", borderLeft: "2px solid var(--line-soft)", paddingLeft: "var(--sp-2)",
                // Fünf Unterkategorien, dann wird gescrollt (siehe bausteine/aufklappen.ts).
                // Die 43 px sind die gerechnete Zeilenhöhe: Polsterung 5 px oben und unten,
                // darin der Balken mit seiner Beschriftung.
                //
                // Der Deckel gilt NUR, solange nichts darin aufgeklappt ist. Sonst läge die
                // Buchungstabelle einer Unterkategorie in einem Rahmen von fünf Zeilen
                // Höhe — ein Scrollbereich in einem Scrollbereich, und der äussere frisst
                // die Hälfte des inneren.
                maxHeight: g.kinder.some((k) => !!k.kategorieId && offeneKat === k.kategorieId)
                  ? undefined
                  : aufklappHoehe(AUFKLAPP_ZEILEN_SCHMAL, 43),
                overflowY: "auto",
              }}>
                {g.kinder.map((k) => {
                  const katOffen = !!k.kategorieId && offeneKat === k.kategorieId;
                  return (
                    <div key={k.kategorieId ?? "__k-ohne"}>
                      <div
                        onClick={(e) => { e.stopPropagation(); if (k.kategorieId) onKat(k.kategorieId); }}
                        style={{ padding: "5px 8px", borderRadius: "var(--r-md)", cursor: k.kategorieId ? "pointer" : "default", background: katOffen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent" }}
                      >
                        <CoverageTrack
                          value={Math.abs(k.summe)}
                          max={Math.max(1, ...g.kinder.map((x) => Math.abs(x.summe)))}
                          over={false}
                          label={`${katOffen ? "▾ " : "▸ "}${k.kategorieId ? k.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${k.anzahl}`}
                          right={mitSchnitt(k.summe)}
                        />
                      </div>
                      {katOffen && k.kategorieId && renderDetail(k.kategorieId)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Heute als ISO — die Uhr wird hier gelesen, gerechnet wird in der Anwendungsschicht. */
function toIsoHeute(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function AnalyseScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const [basis, setBasis] = useState<Analysebasis | null>(null);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("12");
  const [aktivMonat, setAktivMonat] = useState<number | null>(null);
  const [offeneKat, setOffeneKat] = useState<string | null>(null);
  const [detail, setDetail] = useState<IstBuchung | null>(null);
  /**
   * Dieselben Monatsdaten in drei Darstellungen. Vorher standen alle drei untereinander —
   * dreimal dieselbe Information, und der Screen wurde so lang, dass die Kategorien
   * darunter aus dem Blick gerieten. Jetzt eine Fläche, umschaltbar.
   */
  const [ansicht, setAnsicht] = useState<"fluss" | "saldo" | "tabelle">("fluss");
  const [register, setRegister] = useState<AnalyseRegister>("verlauf");
  /** Kategorien einzeln oder zu Hauptgruppen gebündelt. */
  const [ebene, setEbene] = useState<"kategorie" | "gruppe">("kategorie");
  const [offeneGruppe, setOffeneGruppe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [geladen, setGeladen] = useState(false);
  /**
   * Die Depots. Getrennt geladen, weil sie mit der übrigen Analyse nichts teilen: sie
   * bestehen aus Beobachtungen, nicht aus Buchungen, und gehen in keine Kennzahl ein.
   */
  const [depotdaten, setDepotdaten] = useState<Depotdaten | null>(null);

  // Gemeinsam laden und in EINEM Schritt setzen — kein Render-Fenster, in dem die
  // Aufschlüsselung gegen eine noch leere Kategorie-Liste rechnet (sonst „ohne Kategorie").
  async function laden() {
    try {
      setBasis(await analyse());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setGeladen(true);
    }
  }
  useEffect(() => {
    laden();
    depots()
      .then(setDepotdaten)
      .catch((e) => { fehlerMelden(e); setDepotdaten(null); });
  }, []);

  const heute = useMemo(() => toIsoHeute(), []);
  const { von, bis } = useMemo(
    () => (basis ? analyseFenster(basis, zeitraum, heute) : { von: heute, bis: heute }),
    [basis, zeitraum, heute],
  );

  // Der Monatsverlauf rechnet in Monaten und bekommt deshalb `bis` als Monatsmarke.
  // Alles, was an einzelnen TAGEN hängt — bislang nur das Depot —, braucht das Ende
  // desselben Monats, sonst fällt der halbe laufende Monat aus dem Fenster.
  const bisTag = useMemo(() => analyseFensterTaggenau(bis), [bis]);

  const verlauf = useMemo(() => (basis ? analyseVerlauf(basis, von, bis) : []), [basis, von, bis]);

  const aufschluesselung = useMemo(() => {
    if (!basis || verlauf.length === 0) return null;
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    const bvon = idx != null ? `${verlauf[idx].label}-01` : von;
    const bbis = idx != null ? `${verlauf[idx].label}-01` : bis;
    return { label: idx != null ? verlauf[idx].label : null, items: analyseAufschluesselung(basis, bvon, bbis) };
  }, [aktivMonat, verlauf, basis, von, bis]);

  // Die Befunde hängen am selben Fenster wie alles darüber — und werden in EINEM Zug
  // gerechnet, damit zwei Zahlen auf einem Bildschirm nicht verschiedene Mengen meinen.
  const befunde = useMemo(() => (basis ? analyseBefunde(basis, von, bis) : null), [basis, von, bis]);

  /**
   * Der Blick nach vorn hängt NICHT am gewählten Zeitraum, sondern steht fest bei sechs
   * und sechs. Er beantwortet eine andere Frage als die Auswertung darüber: die
   * Projektion wird nicht besser, wenn man sie über zwei Jahre zieht — sie wird nur
   * unsicherer, und die letzten Monate darin sind dann Behauptung statt Vorschau.
   */
  const ausblick = useMemo(
    () => (basis ? analyseAusblick(basis, heute, 6, 6) : []),
    [basis, heute],
  );

  const ist = basis?.buchungen ?? [];
  const kategorien = basis?.kategorien ?? [];

  const detailFenster = useMemo(() => {
    const idx = aktivMonat != null && aktivMonat < verlauf.length ? aktivMonat : null;
    return {
      bvon: idx != null ? `${verlauf[idx].label}-01` : von,
      bbis: idx != null ? `${verlauf[idx].label}-01` : bis,
    };
  }, [aktivMonat, verlauf, von, bis]);

  /**
   * Kennzahlen — entweder über den ganzen Zeitraum oder über den gewählten Monat.
   *
   * Der Durchschnitt bleibt IMMER der des Zeitraums: er ist der Maßstab, gegen den ein
   * einzelner Monat etwas aussagt. Ein „Durchschnitt eines Monats" wäre der Monat selbst.
   */
  const monat = aktivMonat != null && aktivMonat < verlauf.length ? verlauf[aktivMonat] : null;
  /** Über wie viele Monate die Aufschlüsselung rechnet — bei gewähltem Monat genau einer. */
  const monateImFenster = monat ? 1 : Math.max(1, verlauf.length);

  const oeEin = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.einnahmen, 0) / verlauf.length) : 0;
  const oeAus = verlauf.length ? Math.round(verlauf.reduce((s, m) => s + m.ausgaben, 0) / verlauf.length) : 0;

  const summeEin = monat ? monat.einnahmen : verlauf.reduce((s, m) => s + m.einnahmen, 0);
  const summeAus = monat ? monat.ausgaben : verlauf.reduce((s, m) => s + m.ausgaben, 0);
  const netto = summeEin + summeAus;
  const saldoJetzt = verlauf.length ? verlauf[verlauf.length - 1].saldo : 0;

  /**
   * Abweichung eines Monatswerts vom Zeitraum-Durchschnitt, in Prozent.
   * `null`, wenn es keinen Vergleich gibt (kein Monat gewählt, oder Ø ist 0).
   */
  function abweichung(wert: number, schnitt: number): number | null {
    if (!monat || schnitt === 0) return null;
    return Math.round(((wert - schnitt) / Math.abs(schnitt)) * 100);
  }

  /** „+12 %" / „−8 %" als Zusatz an einer Kennzahl; U+2212 wie überall beim Geld. */
  function vergleich(wert: number, schnitt: number): string | undefined {
    const a = abweichung(wert, schnitt);
    if (a == null || a === 0) return undefined;
    return t("historie.vsDurchschnitt", { prozent: (a > 0 ? "+" : "\u2212") + Math.abs(a) });
  }

  /**
   * Die Buchungen einer aufgeklappten Kategorie — mit `Aufklapptabelle`, derselben Fläche
   * und Tabelle wie die Buchungen eines Budgets. Bis 2026-11-09 war das hier eine eigene
   * `<table>` mit eigenem Kopf, und dasselbe Aufklappen sah an jeder Stelle anders aus.
   *
   * Anklickbar: beim Durchsehen einer Kategorie stößt man auf Buchungen, die eine
   * Korrektur brauchen — der Umweg über den Kontoauszug entfällt.
   */
  function detailTabelle(kategorieId: string) {
    const bs = basis ? analyseBuchungen(basis, kategorieId, detailFenster.bvon, detailFenster.bbis) : [];
    return (
      <Aufklapptabelle
        zeilen={bs.slice(0, 50)}
        schluessel={(z) => z.buchung.id}
        leer={t("historie.detailLeer")}
        onZeile={(z) => setDetail(z.buchung)}
        zeilenTitel={t("historie.detailOeffnen")}
        mehr={bs.length > 50 ? t("historie.detailMehr", { n: bs.length - 50 }) : undefined}
        spalten={[
          { key: "datum", label: t("historie.spalteDatum"), breite: "10ch", render: (z) => datum.mitJahr(z.buchung.datum) },
          {
            key: "empf",
            label: t("historie.spalteEmpf"),
            fett: true,
            render: (z) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.empfaenger || "—"}</span>
                {/* Dieselbe Markierung wie im Kontoauszug. Sie zählt hier sogar mehr: die
                    Analyse fragt „wofür ging das Geld", und dass ein Posten aus einem
                    laufenden Vertrag stammt, ist die halbe Antwort. */}
                {z.vertragsname && (
                  <span title={t("konten.pillVertrag", { anbieter: z.vertragsname })} style={{ flex: "0 0 auto" }}>
                    <Pill variant="plan">{z.vertragsname}</Pill>
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "zweck",
            label: t("historie.spalteZweck"),
            gedimmt: true,
            render: (z) => (z.verwendungszweck.length > 45 ? z.verwendungszweck.slice(0, 45) + "…" : z.verwendungszweck),
          },
          { key: "konto", label: t("historie.spalteKonto"), gedimmt: true, render: (z) => z.kontoName || "—" },
          {
            key: "betrag",
            label: `${t("historie.spalteBetrag")} ${geld.symbol}`,
            align: "right",
            render: (z) => <span style={{ color: geldFarbe(z.betrag) }}>{geld.format(z.betrag, { mitVorzeichen: true })}</span>,
          },
        ]}
      />
    );
  }

  /**
   * Nur Register mit Inhalt. Ein Reiter „Depot" ohne abgerufenes Depot wäre ein Weg ins
   * Leere — als die Abschnitte untereinander standen, fehlte die Fläche dann einfach,
   * und dasselbe gilt jetzt für ihren Reiter.
   */
  const registerListe = (
    [
      ["verlauf", true],
      ["kategorien", !!aufschluesselung && kategorien.length > 0],
      ["ausblick", true],
      ["befunde", !!befunde && !!basis],
      ["depot", !!depotdaten && depotdaten.depots.length > 0],
    ] as const
  )
    .filter(([, da]) => da)
    .map(([id]) => ({ id, label: t(`analyse.register.${id}`) }));
  /** Verschwindet das gewählte Register (Depot entfernt), gilt wieder das erste. */
  const wirksamesRegister: AnalyseRegister = registerListe.some((r) => r.id === register) ? register : "verlauf";

  /*
   * Die Filter stehen an dem Register, das sie einstellen (seit 2026-11-09), nicht mehr
   * im Seitenkopf: dort sahen sie aus, als gälten sie für alles, und für den Ausblick
   * galten sie nie. Jedes Register bekommt nur, was es wirklich verändert — Verlauf und
   * Kategorien Zeitraum und Monat, Befunde und Depot den Zeitraum, der Ausblick nichts.
   * Der ZUSTAND bleibt gemeinsam: wer im Verlauf auf zwei Jahre stellt und zu den
   * Kategorien wechselt, will dort nicht wieder bei zwölf Monaten anfangen.
   */
  const zeitraumWahl = (
    <Auswahl
      ariaLabel={t("historie.zeitraumWaehlen")}
      wert={zeitraum}
      aufAenderung={(v) => { setZeitraum(v as Zeitraum); setAktivMonat(null); setOffeneKat(null); }}
      optionen={[
        { wert: "12", text: t("historie.zr12") },
        { wert: "24", text: t("historie.zr24") },
        { wert: "jahr", text: t("historie.zrJahr") },
        { wert: "alles", text: t("historie.zrAlles") },
      ]}
    />
  );
  // Monat direkt wählbar — der Klick auf den Chart macht dasselbe, ist bei vielen
  // Monaten aber Zielübung. Beide schreiben denselben Zustand.
  const monatWahl = (
    <Auswahl
      ariaLabel={t("historie.monatWaehlen")}
      wert={aktivMonat == null ? "" : String(aktivMonat)}
      aufAenderung={(v) => { setAktivMonat(v === "" ? null : Number(v)); setOffeneKat(null); }}
      optionen={[
        { wert: "", text: t("historie.alleMonate") },
        ...verlauf.map((m, i) => ({ wert: String(i), text: m.label })),
      ]}
    />
  );
  const filterleiste = (...felder: ReactNode[]) => (
    <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
      {felder}
    </span>
  );
  /** Für Register ohne eigene Karte (Befunde, Depot): die Leiste rechtsbündig darüber. */
  const filterzeile = (...felder: ReactNode[]) => (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--sp-3)" }}>{filterleiste(...felder)}</div>
  );

  return (
    <div className="screen">
      <PageHead title={t("analyse.titel")} subtitle={t("analyse.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--danger, #c0392b)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {!geladen ? null : ist.length === 0 && !fehler ? (
        <Card>{t("historie.leer")}</Card>
      ) : (
        <>
          <Registerleiste
            register={registerListe}
            aktiv={wirksamesRegister}
            onWahl={(id) => setRegister(id as AnalyseRegister)}
          >

          {wirksamesRegister === "verlauf" && (
            <Card
              title={t("historie.verlaufTitel")}
              subtitle={t(`historie.verlauf.${ansicht}`)}
              action={filterleiste(<span key="m">{monatWahl}</span>, <span key="z">{zeitraumWahl}</span>)}
            >
          {/* Alle fünf tragen GERICHTETES Geld, also kommt die Farbe aus dem
              Vorzeichen und nirgendwo sonst (`bausteine/geldFarbe`). Vorher stand hier
              fünfmal ein eigenes Ternär, und drei davon waren verschieden — Einnahmen
              fest grün, Ausgaben „warn, wenn negativ" (also immer), und die positive
              Seite bei Netto grün, beim Saldo neutral. Nebeneinander in einer Reihe. */}
          <div className="kpis" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
            <KPIStat size="chip" label={monat ? t("historie.kpiEinnahmenMonat", { monat: monat.label }) : t("historie.kpiEinnahmen")}
              value={geld.format(summeEin)} unit={geld.symbol} tone={geldTon(summeEin)} meta={vergleich(summeEin, oeEin)} />
            <KPIStat size="chip" label={monat ? t("historie.kpiAusgabenMonat", { monat: monat.label }) : t("historie.kpiAusgaben")}
              value={geld.format(summeAus)} unit={geld.symbol} tone={geldTon(summeAus)} meta={vergleich(summeAus, oeAus)} />
            <KPIStat size="chip" label={t("historie.kpiNetto")} value={geld.format(netto, { mitVorzeichen: true })} unit={geld.symbol} tone={geldTon(netto)} />
            {/* Der Maßstab: was ein Monat im Schnitt kostet. Bleibt beim Zeitraum-Ø,
                auch wenn ein einzelner Monat gewählt ist — sonst gäbe es nichts zu vergleichen. */}
            <KPIStat size="chip" label={t("historie.kpiOeAusgaben")} value={geld.format(oeAus)} unit={geld.symbol} tone={geldTon(oeAus)} />
            <KPIStat size="chip" label={t("historie.kpiSaldo")} value={geld.format(saldoJetzt)} unit={geld.symbol} tone={geldTon(saldoJetzt)} />
          </div>


              {/* Umschalter: eine Fläche, drei Blicke auf dieselben Monate. */}
              <Umschalter
                label={t("historie.ansichtWahl")}
                optionen={(["fluss", "saldo", "tabelle"] as const).map((a) => ({ wert: a, text: t(`historie.ansicht.${a}`) }))}
                wert={ansicht}
                aufAendern={setAnsicht}
                style={{ marginBottom: "var(--sp-3)" }}
              />

              {verlauf.length > 0 && ansicht === "fluss" && (
                <MonatsFlussChart
                  labels={verlauf.map((m) => m.label)}
                  einnahmen={verlauf.map((m) => m.einnahmen)}
                  ausgaben={verlauf.map((m) => -m.ausgaben)}
                  onMonatClick={(i) => setAktivMonat((cur) => (cur === i ? null : i))}
                  aktivIndex={aktivMonat}
                />
              )}

              {verlauf.length > 0 && ansicht === "saldo" && (
                <SaldoVerlaufChart labels={verlauf.map((m) => m.label)} werte={verlauf.map((m) => m.saldo)} legende={t("historie.saldoLegende")} />
              )}

              {verlauf.length > 0 && ansicht === "tabelle" && (
                <DataTable
                  sortable
                  pageSize={24}
                  onRowClick={(m) => setAktivMonat((cur) => { const i = verlauf.findIndex((v) => v.label === m.label); return cur === i ? null : i; })}
                  istAktiv={(m) => aktivMonat != null && verlauf[aktivMonat]?.label === m.label}
                  columns={[
                    { key: "label", label: t("historie.spalteMonat") },
                    { key: "einnahmen", label: `${t("historie.spalteEinnahmen")} ${geld.symbol}`, align: "right", render: (m) => (m.einnahmen ? geld.format(m.einnahmen) : "—") },
                    { key: "ausgaben", label: `${t("historie.spalteAusgaben")} ${geld.symbol}`, align: "right", render: (m) => (m.ausgaben ? geld.format(m.ausgaben) : "—") },
                    { key: "netto", label: `${t("historie.spalteNetto")} ${geld.symbol}`, align: "right", render: (m) => <span style={{ color: geldFarbe(m.netto), fontWeight: "var(--fw-bold)" }}>{geld.format(m.netto, { mitVorzeichen: true })}</span> },
                    { key: "umschichtung", label: `${t("historie.spalteUmschichtung")} ${geld.symbol}`, align: "right", render: (m) => (m.umschichtung ? geld.format(m.umschichtung, { mitVorzeichen: true }) : "—") },
                    { key: "saldo", label: `${t("historie.spalteSaldo")} ${geld.symbol}`, align: "right", render: (m) => geld.format(m.saldo, { mitVorzeichen: true }) },
                  ]}
                  rows={[...verlauf].reverse()}
                />
              )}
            </Card>
          )}

          {wirksamesRegister === "kategorien" && aufschluesselung && (
              <Card
                title={t("historie.katTitel")}
                subtitle={aufschluesselung.label ? t("historie.katMonat", { monat: aufschluesselung.label }) : t("historie.katZeitraum")}
                action={
                  <span className="tabellenfilter" style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                    {monatWahl}
                    {zeitraumWahl}
                    <Auswahl
                      ariaLabel={t("historie.ebeneWaehlen")}
                      wert={ebene}
                      aufAenderung={(v) => { setEbene(v as "kategorie" | "gruppe"); setOffeneKat(null); setOffeneGruppe(null); }}
                      optionen={[
                        { wert: "kategorie", text: t("historie.ebeneKategorie") },
                        { wert: "gruppe", text: t("historie.ebeneGruppe") },
                      ]}
                    />
                  </span>
                }
                           >
                {(["Aufwand", "Ertrag", "Umschichtung"] as const).map((ch) => {
                  const titel = ch === "Aufwand" ? t("historie.sektionAusgaben") : ch === "Ertrag" ? t("historie.sektionEinnahmen") : t("historie.sektionUmschichtung");
                  const ohneLabel = ch === "Umschichtung" ? t("historie.umbuchungen") : undefined;
                  const items = aufschluesselung.items.filter((i) => i.charakter === ch);
                  return ebene === "gruppe" ? (
                    <GruppenSektion
                      key={ch}
                      titel={titel}
                      gruppen={basis ? analyseGruppen(basis, items) : []}
                      ohneLabel={ohneLabel}
                      monate={monateImFenster}
                      offeneGruppe={offeneGruppe ?? undefined}
                      onGruppe={(id) => { setOffeneGruppe((cur) => (cur === id ? null : id)); setOffeneKat(null); }}
                      offeneKat={offeneKat ?? undefined}
                      onKat={(id) => setOffeneKat((cur) => (cur === id ? null : id))}
                      renderDetail={detailTabelle}
                    />
                  ) : (
                    <KategorieSektion
                      key={ch}
                      titel={titel}
                      items={items}
                      ohneLabel={ohneLabel}
                      monate={monateImFenster}
                      onSelect={(id) => setOffeneKat((cur) => (cur === id ? null : id))}
                      aktivId={offeneKat ?? undefined}
                      renderDetail={detailTabelle}
                    />
                  );
                })}
                {aufschluesselung.items.length === 0 && <div className="muted">{t("historie.katLeer")}</div>}
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>{t("historie.katKlickHinweis")}</div>
              </Card>
          )}

          {/* Der Blick nach vorn ist derselbe Saldo wie im Verlauf, nur weitergedacht. Als
              die Abschnitte untereinander standen, sass er deshalb direkt darunter; als
              Register steht er gleich daneben. */}
          {wirksamesRegister === "ausblick" && <AusblickKarte punkte={ausblick} />}

          {/* Die Befunde setzen voraus, dass man gesehen hat, wie viel wohin ging, und
              beantworten die nächste Frage — ob das so tragfähig ist. */}
          {wirksamesRegister === "befunde" && befunde && basis && filterzeile(<span key="z">{zeitraumWahl}</span>)}
          {wirksamesRegister === "befunde" && befunde && basis && (
            <BefundeBereich
              befunde={befunde}
              kontoNamen={basis.kontoNamen}
              onBuchung={(b) => setDetail(b)}
            />
          )}

          {/* Depots zuletzt: sie beantworten eine eigene Frage und mischen sich in die
              Kategorien-Auswertung darüber nicht ein. Nebeneinander wie in der Übersicht —
              bei einem einzelnen Depot nimmt es die volle Breite. */}
          {wirksamesRegister === "depot" && depotdaten && depotdaten.depots.length > 0 && filterzeile(<span key="z">{zeitraumWahl}</span>)}
          {wirksamesRegister === "depot" && depotdaten && depotdaten.depots.length > 0 && (
            <div className="karten-paar" style={{ marginTop: 0 }}>
              {depotdaten.depots.map((d) => (
                <DepotAnsicht key={d.depot.id} sicht={d} von={von} bis={bisTag} />
              ))}
            </div>
          )}

          </Registerleiste>
        </>
      )}

      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}
    </div>
  );
}
