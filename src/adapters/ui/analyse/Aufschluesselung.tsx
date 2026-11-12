// Die Aufschlüsselung eines Fensters nach Kategorien — Ausgaben, Einnahmen, Umschichtungen,
// jede Zeile aufklappbar bis zu ihren Buchungen.
//
// Seit 2026-11-11 eine eigene Datei und im Register „Verlauf" zuhause: ein Klick auf einen
// Monat zeigt sie DARUNTER, für genau diesen Monat. Vorher stand sie als Register
// „Kategorien" neben dem Verlauf und teilte mit ihm Monat und Zeitraum — wer einen Monat
// anklickte, musste den Reiter wechseln, um zu sehen, wofür das Geld ging. Das Register
// „Kategorien" ist seitdem eine eigene Auswertung über die Zeit (`KategorienRegister`).

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseAufschluesselung,
  analyseBuchungen,
  analyseGruppen,
  type Analysebasis,
  type GruppenSumme,
  type IstBuchung,
  type KategorieSumme,
} from "../../../application";
import { CoverageTrack, Pill } from "../bausteine";
import { AUFKLAPP_ZEILEN_SCHMAL, aufklappHoehe } from "../bausteine/aufklappen";
import { Aufklapptabelle } from "../bausteine/Aufklapptabelle";
import { Umschalter } from "../bausteine/Umschalter";
import { useDatum, useGeld, useProzent } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

/**
 * Seit 2026-11-11 misst jeder Balken den ANTEIL an seiner Seite (alle Ausgaben, alle
 * Einnahmen des Fensters) — nicht mehr den grössten Posten. Vorher war der grösste
 * Balken immer voll, und eine Länge sagte nur „kleiner als die Miete". Jetzt ist ein
 * Viertel der Ausgaben auch ein Viertel des Balkens, und die Prozentzahl steht daneben.
 *
 * Ein Rückfluss (unterm Strich mehr zurück als hinaus) hat an seiner Seite keinen
 * Anteil: sein Balken bleibt leer, und statt eines negativen Prozentwerts steht nichts.
 */
function useAnteil(gesamt: number) {
  const prozent = useProzent();
  return (summe: number) => {
    const anteil = gesamt === 0 ? 0 : summe / gesamt;
    return { wert: Math.max(0, anteil), text: anteil > 0 ? prozent(anteil, 0) : "" };
  };
}

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

  const summe = items.reduce((s, i) => s + i.summe, 0);
  const anteil = useAnteil(summe);
  if (items.length === 0) return null;
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
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: klickbar ? "pointer" : "default", background: aktiv ? "var(--accent-soft)" : "transparent" }}
            >
              <CoverageTrack
                value={anteil(i.summe).wert}
                max={1}
                over={false}
                label={`${aktiv ? "▾ " : "▸ "}${i.kategorieId ? i.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${i.anzahl}`}
                right={mitAnteil(mitSchnitt(i.summe), anteil(i.summe).text)}
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

  const summe = gruppen.reduce((s, g) => s + g.summe, 0);
  const anteil = useAnteil(summe);
  if (gruppen.length === 0) return null;

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
              style={{ padding: "7px 8px", borderRadius: "var(--r-md)", cursor: "pointer", background: offen ? "var(--accent-soft)" : "transparent" }}
            >
              <CoverageTrack
                value={anteil(g.summe).wert}
                max={1}
                over={false}
                label={`${offen ? "▾ " : "▸ "}${g.kategorieId ? g.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${g.anzahl}`}
                right={mitAnteil(mitSchnitt(g.summe), anteil(g.summe).text)}
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
                        style={{ padding: "5px 8px", borderRadius: "var(--r-md)", cursor: k.kategorieId ? "pointer" : "default", background: katOffen ? "var(--accent-soft)" : "transparent" }}
                      >
                        <CoverageTrack
                          value={anteil(k.summe).wert}
                          max={1}
                          over={false}
                          label={`${katOffen ? "▾ " : "▸ "}${k.kategorieId ? k.name : (ohneLabel ?? t("historie.ohneKategorie"))} · ${k.anzahl}`}
                          right={mitAnteil(mitSchnitt(k.summe), anteil(k.summe).text)}
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

/**
 * Die Aufschlüsselung über [von, bis]. `monate` > 1 blendet je Zeile den Schnitt ein.
 *
 * Was aufgeklappt ist und welche Ebene gilt, gehört ihr selbst — wechselt das Fenster,
 * gibt der Aufrufer einen neuen `key`, und sie beginnt zugeklappt.
 */
export function Aufschluesselung({
  basis,
  von,
  bis,
  monate = 1,
  onBuchung,
}: {
  basis: Analysebasis;
  von: string;
  bis: string;
  monate?: number;
  onBuchung: (b: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  /** Kategorien einzeln oder zu Hauptgruppen gebündelt. */
  const [ebene, setEbene] = useState<"kategorie" | "gruppe">("kategorie");
  const [offeneKat, setOffeneKat] = useState<string | null>(null);
  const [offeneGruppe, setOffeneGruppe] = useState<string | null>(null);
  const items = analyseAufschluesselung(basis, von, bis);

  const detailTabelle = (kategorieId: string) => (
    <KategorieBuchungen basis={basis} kategorieId={kategorieId} von={von} bis={bis} onBuchung={onBuchung} />
  );

  return (
    <>
      <Umschalter
        label={t("historie.ebeneWaehlen")}
        optionen={[
          { wert: "kategorie" as const, text: t("historie.ebeneKategorie") },
          { wert: "gruppe" as const, text: t("historie.ebeneGruppe") },
        ]}
        wert={ebene}
        aufAendern={(v) => { setEbene(v); setOffeneKat(null); setOffeneGruppe(null); }}
        style={{ marginBottom: "var(--sp-3)" }}
      />
      {(["Aufwand", "Ertrag", "Umschichtung"] as const).map((ch) => {
        const titel = ch === "Aufwand" ? t("historie.sektionAusgaben") : ch === "Ertrag" ? t("historie.sektionEinnahmen") : t("historie.sektionUmschichtung");
        const ohneLabel = ch === "Umschichtung" ? t("historie.umbuchungen") : undefined;
        const teil = items.filter((i) => i.charakter === ch);
        return ebene === "gruppe" ? (
          <GruppenSektion
            key={ch}
            titel={titel}
            gruppen={analyseGruppen(basis, teil)}
            ohneLabel={ohneLabel}
            monate={monate}
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
            items={teil}
            ohneLabel={ohneLabel}
            monate={monate}
            onSelect={(id) => setOffeneKat((cur) => (cur === id ? null : id))}
            aktivId={offeneKat ?? undefined}
            renderDetail={detailTabelle}
          />
        );
      })}
      {items.length === 0 && <div className="muted">{t("historie.katLeer")}</div>}
      <div className="hinweis" style={{ marginTop: "var(--sp-2)" }}>{t("historie.katKlickHinweis")}</div>
    </>
  );
}

/**
 * Die Buchungen einer Kategorie im Fenster — mit `Aufklapptabelle`, derselben Fläche
 * und Tabelle wie die Buchungen eines Budgets. Bis 2026-11-09 war das hier eine eigene
 * `<table>` mit eigenem Kopf, und dasselbe Aufklappen sah an jeder Stelle anders aus.
 *
 * Anklickbar: beim Durchsehen einer Kategorie stößt man auf Buchungen, die eine
 * Korrektur brauchen — der Umweg über den Kontoauszug entfällt.
 */
export function KategorieBuchungen({
  basis,
  kategorieId,
  von,
  bis,
  onBuchung,
}: {
  basis: Analysebasis;
  kategorieId: string;
  von: string;
  bis: string;
  onBuchung: (b: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const bs = analyseBuchungen(basis, kategorieId, von, bis);
  return (
    <Aufklapptabelle
      zeilen={bs.slice(0, 50)}
      schluessel={(z) => z.buchung.id}
      leer={t("historie.detailLeer")}
      onZeile={(z) => onBuchung(z.buchung)}
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

/** „450,00 € · 22 %" — der Anteil hinter dem Betrag, leer bleibt leer. */
function mitAnteil(betrag: string, anteil: string): string {
  return anteil ? `${betrag} · ${anteil}` : betrag;
}
