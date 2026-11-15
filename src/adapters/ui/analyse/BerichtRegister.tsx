// Register „Bericht" — ein abgeschlossener Monat oder ein Kalenderjahr auf einem Blatt.
//
// Drei Teile untereinander, und jeder beantwortet eine der drei Rechnungen aus
// `core/CLAUDE.md` („Auszahlung und Kosten"):
//
//   1. das ERGEBNIS — was der Zeitraum gekostet hat und was bleibt, mit seinen Stufen und
//      dem Zeitraum davor daneben;
//   2. der WEG ZUM KONTO — warum das nicht die Änderung der Kontostände ist;
//   3. das VERMÖGEN — was am Anfang und am Ende da war.
//
// Gerechnet wird hier nichts: `analyseBericht` liefert jede Zahl fertig, auch die
// Veränderungen. Das Blatt liest sich von oben nach unten, ohne Aufklappen — der
// Überleitung, die in der Übersicht hinter einem Deckel liegt, gehört hier eine eigene
// Karte, weil sie im Rückblick kein Beleg am Rand ist, sondern einer der drei Teile.
//
// Was dazu offen dasteht, sind EINSCHRÄNKUNGEN (`ui/CLAUDE.md`, „Drei Ränge"): ein
// fehlender Vergleich, fehlende Rücklagenraten und dass Vermögenswerte und Schulden mit
// ihrem zuletzt eingetragenen Wert zählen. Jede erscheint nur, wenn sie trifft.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseBericht,
  type Analysebasis,
  type Bericht,
  type Berichtsart,
  type ErgebnisZeileId,
  type Vergleichswert,
  type Vermoegenszeile,
} from "../../../application";
import { Card, DataTable, KPIStat } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { useDatum, useGeld, useProzent } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { Umschalter } from "../bausteine/Umschalter";
import { Filterzeile } from "./ZeitraumWahl";

export interface BerichtZustand {
  readonly art: Berichtsart;
  /**
   * Die Wahl je Art, getrennt: wer vom Jahr zurück auf den Monat schaltet, findet seinen
   * Monat wieder. `null` heisst „der jüngste" — die Vorgabe entscheidet `analyseBericht`.
   */
  readonly monat: string | null;
  readonly jahr: string | null;
}

export const BERICHT_ANFANG: BerichtZustand = { art: "monat", monat: null, jahr: null };

/** Nach welcher Zeile eine Zwischensumme fällig ist — dieselbe Gliederung wie in den Monatskarten. */
const STUFEN: readonly { id: "nachPflichten" | "nachAlltag" | "ergebnis"; zeilen: readonly ErgebnisZeileId[] }[] = [
  { id: "nachPflichten", zeilen: ["einnahmen", "fixkosten"] },
  { id: "nachAlltag", zeilen: ["laufend", "ungeplant"] },
  { id: "ergebnis", zeilen: ["abschreibungen", "vorsorge", "tilgung"] },
];

/** Eine Zeile der Ergebnistabelle: eine Zeile der Rechnung oder eine Stufe darunter. */
interface Ergebniszeile {
  readonly schluessel: string;
  readonly name: string;
  readonly wert: Vergleichswert;
  readonly stufe: boolean;
}

export function BerichtRegister({
  basis,
  heute,
  zustand,
  setZustand,
}: {
  basis: Analysebasis;
  heute: string;
  zustand: BerichtZustand;
  setZustand: (z: BerichtZustand) => void;
}) {
  const { t } = useTranslation();
  const wahl = zustand.art === "jahr" ? zustand.jahr : zustand.monat;
  const sicht = useMemo(() => analyseBericht(basis, zustand.art, wahl, heute), [basis, zustand.art, wahl, heute]);
  const bericht = sicht.bericht;

  const name = (schluessel: string) => zeitraumName(t, zustand.art, schluessel);

  return (
    <>
      <Filterzeile>
        <Umschalter
          label={t("historie.zeitraumWaehlen")}
          optionen={(["monat", "jahr"] as const).map((a) => ({ wert: a, text: t(`bericht.art.${a}`) }))}
          wert={zustand.art}
          aufAendern={(art) => setZustand({ ...zustand, art })}
        />
        {bericht && (
          <Auswahl
            ariaLabel={t(`bericht.art.${zustand.art}`)}
            wert={bericht.schluessel}
            aufAenderung={(v) => setZustand(zustand.art === "jahr" ? { ...zustand, jahr: v } : { ...zustand, monat: v })}
            optionen={sicht.wahl.map((s) => ({ wert: s, text: name(s) }))}
          />
        )}
      </Filterzeile>

      {!bericht ? (
        <Card>
          <p className="hinweis" style={{ margin: 0 }}>{t(`bericht.leer.${zustand.art}`)}</p>
        </Card>
      ) : (
        <>
          <ErgebnisKarte bericht={bericht} art={zustand.art} name={name} />
          <UeberleitungKarte bericht={bericht} />
          <VermoegenKarte bericht={bericht} />
        </>
      )}
    </>
  );
}

/** „Oktober 2026" bzw. „2026" — der Name eines Zeitraums, aus den Monatsnamen der Ergebnisrechnung. */
function zeitraumName(t: (s: string) => string, art: Berichtsart, schluessel: string): string {
  if (art === "jahr") return schluessel;
  return `${t(`ergebnis.monat.${Number(schluessel.slice(5, 7))}`)} ${schluessel.slice(0, 4)}`;
}

function ErgebnisKarte({ bericht, art, name }: { bericht: Bericht; art: Berichtsart; name: (s: string) => string }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const prozent = useProzent();
  const k = bericht.kennzahlen;
  const e = bericht.ergebnis;

  // Eine Zwischensumme steht nur da, wenn danach noch etwas abgeht — die letzte Gruppe mit
  // Zeilen schliesst mit dem Ergebnis (dieselbe Regel wie in den Monatskarten).
  const gruppen = STUFEN.map((s) => ({ ...s, zeilen: e.zeilen.filter((z) => s.zeilen.includes(z.id)) })).filter(
    (g) => g.zeilen.length > 0,
  );
  const zeilen: Ergebniszeile[] = gruppen.flatMap((g, i) => {
    const stufe = i === gruppen.length - 1 ? "ergebnis" : g.id;
    return [
      ...g.zeilen.map((z) => ({ schluessel: z.id, name: t(`ergebnis.zeile.${z.id}`), wert: z.wert, stufe: false })),
      { schluessel: `stufe:${stufe}`, name: t(`ergebnis.stufe.${stufe}`), wert: e[stufe], stufe: true },
    ];
  });

  const betrag = (wert: number | null, fett = false) =>
    wert == null ? "—" : (
      <span style={{ color: geldFarbe(wert), fontWeight: fett ? "var(--fw-bold)" : undefined }}>
        {geld.format(wert, { mitVorzeichen: true })}
      </span>
    );
  const quote = (wert: number | null) => (wert == null ? "—" : prozent(wert));
  const vergleich = bericht.vorher != null;

  return (
    <Card title={name(bericht.schluessel)} subtitle={t(`bericht.untertitel.${art}`)}>
      {/* Was es in der Kostensicht schon gibt, für diesen einen Zeitraum. Ungerichtet und
          deshalb neutral — dieselbe Entscheidung wie dort. */}
      <div className="kpis" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
        <KPIStat size="chip" label={t("historie.kosten.kpiKosten")} value={geld.format(k.kostenJeMonat)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("historie.kosten.kpiFixkostenquote")} value={quote(k.fixkostenquote)} meta={t("historie.kosten.metaFixkostenquote")} />
        <KPIStat size="chip" label={t("historie.kosten.kpiSparquote")} value={quote(k.sparquote)} meta={t("historie.kosten.metaSparquote")} />
      </div>

      <DataTable<Ergebniszeile>
        rowStyle={(z) => (z.stufe ? { fontWeight: "var(--fw-bold)" } : undefined)}
        columns={[
          { key: "name", label: "", schmal: "titel", render: (z) => z.name },
          { key: "jetzt", label: `${name(bericht.schluessel)} ${geld.symbol}`, align: "right", schmal: "wert", render: (z) => betrag(z.wert.jetzt, z.stufe) },
          // Schmal bleibt vom Vergleich die Veränderung, beschriftet: eine dritte Zahl ohne
          // Namen in der zweiten Zeile wäre keine Auskunft (`.zweitzeile-beschriftung`).
          ...(vergleich
            ? [
                { key: "vorher", label: `${name(bericht.vorher!)} ${geld.symbol}`, align: "right" as const, render: (z: Ergebniszeile) => betrag(z.wert.vorher) },
                {
                  key: "veraenderung",
                  label: `${t("bericht.spalteVeraenderung")} ${geld.symbol}`,
                  align: "right" as const,
                  schmal: "zweitzeile" as const,
                  render: (z: Ergebniszeile) => (
                    <>
                      <span className="zweitzeile-beschriftung">{t("bericht.spalteVeraenderung")} </span>
                      {betrag(z.wert.veraenderung)}
                    </>
                  ),
                },
              ]
            : []),
        ]}
        rows={zeilen}
      />

      {!vergleich && (
        <p className="hinweis" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>{t(`bericht.ohneVergleich.${art}`)}</p>
      )}
      {bericht.ruecklagenUnvollstaendig && (
        <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("historie.kosten.hinweisRuecklagen")}</p>
      )}
    </Card>
  );
}

/** Der Weg zum Konto: vom Ergebnis zur Änderung der Kontostände, über denselben Zeitraum. */
function UeberleitungKarte({ bericht }: { bericht: Bericht }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const u = bericht.ueberleitung;
  const zeilen = [
    { schluessel: "ergebnis", name: t("ergebnis.ueberleitung.ergebnis"), betrag: u.ergebnis, summe: false },
    ...u.posten.map((p) => ({ schluessel: p.id, name: t(`ergebnis.ueberleitung.${p.id}`), betrag: p.betrag, summe: false })),
    { schluessel: "summe", name: t("ergebnis.ueberleitung.summe"), betrag: u.kontoaenderung, summe: true },
  ];
  return (
    <Card title={t("ergebnis.ueberleitung.titel")} subtitle={t("bericht.ueberleitungUntertitel")}>
      <DataTable
        rowStyle={(z) => (z.summe ? { fontWeight: "var(--fw-bold)" } : undefined)}
        columns={[
          { key: "name", label: "", schmal: "titel", render: (z) => z.name },
          {
            key: "betrag",
            label: geld.symbol,
            align: "right",
            schmal: "wert",
            render: (z) => <span style={{ color: geldFarbe(z.betrag) }}>{geld.format(z.betrag, { mitVorzeichen: true })}</span>,
          },
        ]}
        rows={zeilen}
      />
    </Card>
  );
}

/** Die Teile heissen wie im Bereich Vermögen — dieselben Schlüssel wie seine Kennzahlen. */
const TEILNAME: Readonly<Record<Vermoegenszeile["teil"], string>> = {
  konten: "vermoegen.kpiKonten",
  depots: "vermoegen.kpiDepots",
  vermoegenswerte: "vermoegen.kpiVermoegenswerte",
  schulden: "vermoegen.kpiSchulden",
  netto: "vermoegen.nettoTitel",
};

function VermoegenKarte({ bericht }: { bericht: Bericht }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const v = bericht.vermoegen;
  const name = (teil: Vermoegenszeile["teil"]) => t(TEILNAME[teil]);
  const betrag = (wert: number, fett: boolean) => (
    <span style={{ color: geldFarbe(wert), fontWeight: fett ? "var(--fw-bold)" : undefined }}>{geld.format(wert, { mitVorzeichen: true })}</span>
  );

  return (
    <Card title={t("vermoegen.nettoTitel")} subtitle={t("bericht.vermoegenUntertitel", { anfang: datum.mitJahr(v.anfang), ende: datum.mitJahr(v.ende) })}>
      <DataTable<Vermoegenszeile>
        rowStyle={(z) => (z.teil === "netto" ? { fontWeight: "var(--fw-bold)" } : undefined)}
        columns={[
          { key: "teil", label: "", schmal: "titel", render: (z) => name(z.teil) },
          { key: "anfang", label: `${datum.mitJahr(v.anfang)} ${geld.symbol}`, align: "right", render: (z) => betrag(z.anfang, false) },
          { key: "ende", label: `${datum.mitJahr(v.ende)} ${geld.symbol}`, align: "right", schmal: "wert", render: (z) => betrag(z.ende, z.teil === "netto") },
          {
            key: "veraenderung",
            label: `${t("bericht.spalteVeraenderung")} ${geld.symbol}`,
            align: "right",
            schmal: "zweitzeile",
            render: (z) => (
              <>
                <span className="zweitzeile-beschriftung">{t("bericht.spalteVeraenderung")} </span>
                {betrag(z.veraenderung, false)}
              </>
            ),
          },
        ]}
        rows={v.zeilen}
      />
      {bericht.mitBeobachtungen && (
        <p className="hinweis" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>{t("bericht.vermoegenHinweis")}</p>
      )}
    </Card>
  );
}
