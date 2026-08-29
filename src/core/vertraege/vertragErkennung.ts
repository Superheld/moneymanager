// Vertragserkennung — findet in gebuchten Zahlungen wiederkehrende Muster und schlägt
// sie als Vertragskandidaten vor. Reine Funktion über bereits geladene Daten: keine
// Repositories, kein IO, kein Schreiben. Was daraus ein Vertrag wird, entscheidet der
// Nutzer in der Oberfläche; hier entsteht nur der Vorschlag.
//
// Warum überhaupt: Verträge von Hand zu erfassen ist die Arbeit, an der die Budgetierung
// bisher hängen blieb. Die Daten liegen aber schon da — wer 68-mal an O2 gezahlt hat,
// muss das nicht abtippen.
//
// Der Schlüssel, über den gruppiert wird, ist zweistufig:
//   1. **Gläubiger-ID** (SEPA-Lastschrift) — stabil, auch wenn der Name im Auszug
//      schwankt. Deckt aber nur einen kleinen Teil ab: nur wer EINZIEHT, hat eine —
//      auf echten Daten eine einstellige Prozentzahl der Buchungen.
//   2. **normalisierter Empfängername** — der Hauptweg. Dauerauftrag, Überweisung und
//      Kartenzahlung tragen keine Gläubiger-ID.
// Deshalb ist die Gläubiger-ID hier ein Präzisionsgewinn, kein Fundament.

import type { Cent } from "../basis/geld";
import { tageBis } from "../basis/datum";
import type { Rhythmus } from "../basis/zahlungsregel";
import { anbieterSchluessel } from "../basis/gegenpartei";
import type { Zahlungsspur } from "../buchung/zahlungsspur";


/**
 * Was die Erkennung an EINER Gruppe gemessen hat — die Belege hinter dem Vorschlag.
 *
 * Warum das mitläuft: ein Vorschlag ohne Begründung ist entweder blind zu glauben oder
 * blind zu verwerfen. Wer sieht, dass 68 Zahlungen im 30-Tage-Takt an dieselbe
 * Gläubiger-ID gingen, entscheidet anders als bei drei Zahlungen mit schwankendem
 * Abstand. Gemessene Werte UND die Schwelle, gegen die sie geprüft wurden — der Wert
 * allein sagt nicht, ob er knapp war.
 */
export interface Erkennungsbefund {
  /** Woran gruppiert wurde: die Gläubiger-ID (präzise) oder der normalisierte Name. */
  readonly schluesselArt: "glaeubigerId" | "name";
  /** Der Wert, der die Gruppe zusammenhält (ID bzw. normalisierter Name). */
  readonly schluesselWert: string;
  /** Zahl der TERMINE (Zahlungen am selben Tag zählen als einer) und die Mindestzahl. */
  readonly termine: number;
  readonly minTermine: number;
  /** Median-Abstand zwischen den Terminen, in Tagen, und das Fenster des Rhythmus. */
  readonly medianAbstandTage: number;
  readonly rhythmusFenster: readonly [number, number];
  /** Wie viele Abstände nah am Median lagen (von wie vielen) und der geforderte Anteil. */
  readonly abstaendeNah: number;
  readonly abstaendeGesamt: number;
  readonly minAnteilNah: number;
  /** Toleranz, innerhalb derer ein Betrag als „derselbe" gilt, und wie viele es waren. */
  readonly betragsToleranz: Cent;
  readonly betraegeNah: number;
  readonly betraegeGesamt: number;
  /** Tage seit der letzten Zahlung und die Grenze, ab der der Vertrag als beendet gilt. */
  readonly letzteVorTagen: number;
  readonly beendetAbTagen: number;
}

export interface Vertragskandidat {
  /**
   * Gruppierungsschlüssel (Gläubiger-ID oder normalisierter Name) — stabil über Läufe,
   * denn er trägt den Merkzettel der weggeklickten Vorschläge. Einnahmen bekommen das
   * Präfix `+`: derselbe Name kann in beide Richtungen zahlen (Arbeitgeber, der auch
   * Rechnungen stellt), und zwei Richtungen in einer Gruppe ergäben Unsinn. Nur die
   * Einnahmen tragen das Präfix, damit die bereits weggeklickten Ausgaben-Vorschläge
   * nicht alle zurückkommen.
   */
  readonly schluessel: string;
  /** Anzeigename: der längste tatsächlich vorkommende Empfängername der Gruppe. */
  readonly anbieter: string;
  readonly glaeubigerId?: string;
  /** `Aufwand` (Abfluss) oder `Ertrag` (Zufluss) — belegt in der Maske den Charakter vor. */
  readonly charakter: "Aufwand" | "Ertrag";
  readonly rhythmus: Rhythmus;
  /** Median der Beträge, positiv (Betragshöhe, nicht Richtung). */
  readonly betrag: Cent;
  /**
   * Anteil der Zahlungen nahe am Median (0…1). 1 = immer derselbe Betrag (Miete),
   * niedrig = schwankend (Strom mit Nachzahlung). Ein niedriger Wert widerlegt den
   * Vertrag nicht — er sagt nur, dass der vorgeschlagene Betrag ein Mittelwert ist.
   */
  readonly betragStabilitaet: number;
  readonly anzahl: number;
  readonly ersteZahlung: string;
  readonly letzteZahlung: string;
  /**
   * Läuft der Vertrag noch? Die letzte Zahlung liegt innerhalb des erwarteten
   * Fensters. Ein gekündigter Vertrag von 2024 soll nicht als Vorschlag erscheinen.
   */
  readonly laeuft: boolean;
  /** Häufigste Kategorie der Gruppe, sofern eine gesetzt ist. */
  readonly kategorieId?: string;
  /** Konto, über das die Gruppe überwiegend lief — Vorbelegung der Maske. */
  readonly kontoId?: string;
  readonly buchungIds: readonly string[];
  /** Womit dieser Kandidat durch die Prüfungen kam — für die Anzeige „woran erkannt?". */
  readonly befund: Erkennungsbefund;
}

export interface ErkennungsOptionen {
  /** Weniger Zahlungen ergeben kein Muster, nur Zufall. */
  readonly minZahlungen?: number;
  /** Wie stark die Abstände schwanken dürfen (Anteil des Median-Abstands). */
  readonly maxAbstandsAbweichung?: number;
  /** Auch Verträge vorschlagen, deren letzte Zahlung lange her ist. */
  readonly auchBeendete?: boolean;
}

const STANDARD: Required<ErkennungsOptionen> = {
  minZahlungen: 3,
  maxAbstandsAbweichung: 0.35,
  auchBeendete: false,
};

/** Median einer nicht-leeren Zahlenreihe (bei gerader Länge der untere der beiden mittleren). */
function median(werte: number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.floor((sortiert.length - 1) / 2)];
}

/**
 * Tagesfenster je Rhythmus: in dieser Spanne muss der Median-Abstand liegen, damit die
 * Gruppe als dieser Takt durchgeht. Bewusst weit — Abbuchungen wandern über Wochenenden
 * und Monatslängen, ein starres „30 Tage" fände nichts.
 */
export const RHYTHMUS_FENSTER: Record<Rhythmus, readonly [number, number]> = {
  monatlich: [25, 38],
  quartalsweise: [80, 105],
  halbjaehrlich: [160, 200],
  jaehrlich: [330, 400],
};

/** Anteil der Abstände, der nah am Median liegen muss, damit es ein Takt ist. */
export const MIN_ANTEIL_NAH = 0.6;

/**
 * Wie weit ein Betrag vom Median abweichen darf und noch als derselbe gilt: der Anteil,
 * und darunter ein fester Boden.
 *
 * Der Boden ist der Grund, warum es zwei Werte sind — bei einem kleinen Abo wäre ein
 * reiner Prozentsatz so eng, dass jeder Cent Rundungsdifferenz als Betragssprung zählte.
 */
export const BETRAGS_TOLERANZ_ANTEIL = 0.05;
/** Untergrenze der Betragstoleranz in Cent. */
export const BETRAGS_TOLERANZ_MIN: Cent = 100;

/**
 * Ab wann ein Takt als abgerissen gilt: so viele Takte darf er aussetzen, plus Puffer.
 *
 * Der Faktor lässt EINE Zahlung ausfallen (Zahlungspause, verschobene Abbuchung), ohne
 * dass der Vertrag als beendet gilt; der Puffer fängt Wochenend- und
 * Feiertagsverschiebungen ab, die sonst am Rand jedes Fensters zuschlügen.
 */
export const AUSSETZER_FAKTOR = 2;
/** Puffer in Tagen auf den ausgesetzten Takt. */
export const VERSCHIEBUNGS_PUFFER_TAGE = 10;

/** Tagesabstand → Rhythmus, oder null, wenn er zu keinem passt. */
function rhythmusAus(tage: number): Rhythmus | null {
  for (const r of Object.keys(RHYTHMUS_FENSTER) as Rhythmus[]) {
    const [von, bis] = RHYTHMUS_FENSTER[r];
    if (tage >= von && tage <= bis) return r;
  }
  return null;
}

/**
 * Findet Vertragskandidaten in `spuren`. `heute` entscheidet nur darüber, was noch als
 * laufend gilt — die Erkennung selbst ist zeitunabhängig.
 *
 * Beide Richtungen: Abflüsse (Aufwand) sind der Regelfall, Zuflüsse (Ertrag) der zweite
 * — Gehalt, Miete aus Vermietung, Kindergeld. Kündbar ist so eine Einnahme meist nicht,
 * aber der Vertrag ist trotzdem die Stelle, an der sie in die Planung kommt; sonst
 * müsste man genau die größten Posten von Hand abtippen.
 *
 * Nur `Umschichtung` bleibt draußen: eine Umbuchung aufs eigene Tagesgeldkonto ist
 * perfekt regelmäßig und trotzdem kein Vertrag.
 */
export function vertragskandidaten(
  spuren: readonly Zahlungsspur[],
  heute: string,
  optionen: ErkennungsOptionen = {},
): Vertragskandidat[] {
  const opt = { ...STANDARD, ...optionen };

  const gruppen = new Map<string, Zahlungsspur[]>();
  for (const s of spuren) {
    // Richtung und Charakter müssen zusammenpassen: eine Rückerstattung auf einer
    // Aufwands-Kategorie ist ein Zufluss und gehört nicht in die Ausgaben-Reihe.
    const richtung = s.charakter === "Aufwand" && s.betrag < 0
      ? "Aufwand"
      : s.charakter === "Ertrag" && s.betrag > 0
        ? "Ertrag"
        : null;
    if (!richtung) continue;
    const name = s.gegenpartei.trim();
    if (!name && !s.glaeubigerId) continue;
    const basis = s.glaeubigerId?.trim() || anbieterSchluessel(name);
    if (!basis) continue;
    const schluessel = richtung === "Ertrag" ? `+${basis}` : basis;
    const liste = gruppen.get(schluessel);
    if (liste) liste.push(s);
    else gruppen.set(schluessel, [s]);
  }

  const kandidaten: Vertragskandidat[] = [];
  for (const [schluessel, gruppe] of gruppen) {
    if (gruppe.length < opt.minZahlungen) continue;
    const kandidat = auswerten(schluessel, gruppe, heute, opt);
    if (kandidat && (opt.auchBeendete || kandidat.laeuft)) kandidaten.push(kandidat);
  }

  // Größter Jahresbetrag zuerst: was am meisten kostet, will man zuerst erfassen.
  return kandidaten.sort((a, b) => jahresbetrag(b) - jahresbetrag(a));
}

/** Was der Kandidat im Jahr kostet — die Reihenfolge, in der Vorschläge sich lohnen. */
export function jahresbetrag(k: Vertragskandidat): Cent {
  const proJahr = { monatlich: 12, quartalsweise: 4, halbjaehrlich: 2, jaehrlich: 1 };
  return k.betrag * proJahr[k.rhythmus];
}

function auswerten(
  schluessel: string,
  gruppe: Zahlungsspur[],
  heute: string,
  opt: Required<ErkennungsOptionen>,
): Vertragskandidat | null {
  const sortiert = [...gruppe].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

  // Abstände zwischen aufeinanderfolgenden Zahlungen. Zwei Zahlungen am selben Tag
  // (Doppelabbuchung, Nachzahlung) ergäben einen Abstand von 0 und zögen den Median
  // nach unten — sie zählen als EIN Termin.
  const termine: string[] = [];
  for (const s of sortiert) {
    if (termine[termine.length - 1] !== s.datum) termine.push(s.datum);
  }
  if (termine.length < opt.minZahlungen) return null;

  const abstaende: number[] = [];
  for (let i = 1; i < termine.length; i++) abstaende.push(tageBis(termine[i - 1], termine[i]));
  const medianAbstand = median(abstaende);
  const rhythmus = rhythmusAus(medianAbstand);
  if (!rhythmus) return null;

  // Regelmäßigkeit: die Mehrheit der Abstände muss nah am Median liegen. Ohne diese
  // Prüfung würde jede Gruppe mit zufällig passendem Median durchgehen — etwa ein
  // Supermarkt, bei dem man mal alle drei Wochen, mal alle sechs einkauft.
  const nahAmMedian = abstaende.filter(
    (a) => Math.abs(a - medianAbstand) <= medianAbstand * opt.maxAbstandsAbweichung,
  ).length;
  if (nahAmMedian / abstaende.length < MIN_ANTEIL_NAH) return null;

  const betraege = sortiert.map((s) => Math.abs(s.betrag));
  const medianBetrag = median(betraege);
  if (medianBetrag <= 0) return null;
  const toleranz = Math.max(BETRAGS_TOLERANZ_MIN, Math.round(medianBetrag * BETRAGS_TOLERANZ_ANTEIL));
  const stabil = betraege.filter((b) => Math.abs(b - medianBetrag) <= toleranz).length;

  const letzte = termine[termine.length - 1];
  // Über `tageBis` und NICHT über `ord`: `ord` liefert den Sortierschlüssel YYYYMMDD,
  // keinen Tageszähler — „ord(heute) − 70" ergäbe ein Datum, das es nicht gibt, und
  // damit ein zufälliges Ergebnis. Auf echten Daten fielen dadurch laufende Verträge
  // (Musterbank, letzte Zahlung vor einem Monat) in die Rubrik „beendet".
  // Woran die Gruppe hängt: das „+" markiert nur die Richtung (Einnahmen) und gehört
  // nicht zum Wert. Trägt eine Spur genau diesen Wert als Gläubiger-ID, hat die ID
  // gruppiert — sonst war es der normalisierte Name.
  const basisWert = schluessel.replace(/^\+/, "");
  const schluesselArt = sortiert.some((s) => s.glaeubigerId?.trim() === basisWert) ? "glaeubigerId" : "name";

  const beendetAbTagen = medianAbstand * AUSSETZER_FAKTOR + VERSCHIEBUNGS_PUFFER_TAGE;
  const letzteVorTagen = tageBis(letzte, heute);
  const laeuft = letzteVorTagen <= beendetAbTagen;

  return {
    schluessel,
    anbieter: anzeigename(sortiert),
    glaeubigerId: sortiert.find((s) => s.glaeubigerId)?.glaeubigerId,
    // Die Gruppe ist richtungsrein (siehe Gruppierung) — die erste Spur entscheidet.
    charakter: sortiert[0].charakter === "Ertrag" ? "Ertrag" : "Aufwand",
    rhythmus,
    betrag: medianBetrag,
    betragStabilitaet: stabil / betraege.length,
    anzahl: sortiert.length,
    ersteZahlung: termine[0],
    letzteZahlung: letzte,
    laeuft,
    kategorieId: haeufigster(sortiert, (s) => s.kategorieId),
    kontoId: haeufigster(sortiert, (s) => s.kontoId),
    buchungIds: sortiert.map((s) => s.id),
    befund: {
      schluesselArt,
      schluesselWert: basisWert,
      termine: termine.length,
      minTermine: opt.minZahlungen,
      medianAbstandTage: medianAbstand,
      rhythmusFenster: RHYTHMUS_FENSTER[rhythmus],
      abstaendeNah: nahAmMedian,
      abstaendeGesamt: abstaende.length,
      minAnteilNah: MIN_ANTEIL_NAH,
      betragsToleranz: toleranz,
      betraegeNah: stabil,
      betraegeGesamt: betraege.length,
      letzteVorTagen,
      beendetAbTagen,
    },
  };
}

/**
 * Anzeigename der Gruppe: der häufigste Schreibweise-Variante, bei Gleichstand die
 * längste. Der häufigste ist der, den der Nutzer wiedererkennt; die Länge entscheidet
 * nur den Gleichstand, weil „Telefonica Germany GmbH" mehr sagt als „O2".
 */
function anzeigename(gruppe: Zahlungsspur[]): string {
  const zaehler = new Map<string, number>();
  for (const s of gruppe) {
    const name = s.gegenpartei.trim();
    if (name) zaehler.set(name, (zaehler.get(name) ?? 0) + 1);
  }
  let bester = "";
  let besteZahl = 0;
  for (const [name, n] of zaehler) {
    if (n > besteZahl || (n === besteZahl && name.length > bester.length)) {
      bester = name;
      besteZahl = n;
    }
  }
  return bester;
}

/**
 * Häufigster Wert eines Merkmals in der Gruppe (Kategorie, Konto). Ein Vertrag läuft in
 * aller Regel über EIN Konto und EINE Kategorie; ein Ausreißer (einmal von Hand vom
 * anderen Konto gezahlt) soll die Vorbelegung nicht kippen.
 */
function haeufigster(
  gruppe: Zahlungsspur[],
  merkmal: (s: Zahlungsspur) => string | undefined,
): string | undefined {
  const zaehler = new Map<string, number>();
  for (const s of gruppe) {
    const wert = merkmal(s);
    if (wert) zaehler.set(wert, (zaehler.get(wert) ?? 0) + 1);
  }
  let bester: string | undefined;
  let besteZahl = 0;
  for (const [id, n] of zaehler) {
    if (n > besteZahl) {
      bester = id;
      besteZahl = n;
    }
  }
  return bester;
}
