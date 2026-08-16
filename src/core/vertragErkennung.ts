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
//      schwankt. Deckt aber nur einen kleinen Teil ab: nur wer EINZIEHT, hat eine.
//      Auf echten Daten waren es 8 % der Buchungen (418 von 5279).
//   2. **normalisierter Empfängername** — der Hauptweg. Dauerauftrag, Überweisung und
//      Kartenzahlung tragen keine Gläubiger-ID.
// Deshalb ist die Gläubiger-ID hier ein Präzisionsgewinn, kein Fundament.

import type { Cent } from "./geld";
import { tageBis } from "./datum";
import type { Rhythmus } from "./zahlungsregel";

/**
 * Eine gebuchte Zahlung, so weit sie für die Erkennung zählt. Bewusst eine eigene,
 * flache Form statt `IstBuchung`: Empfänger und Gläubiger-ID stehen am `Umsatz`
 * (Import-Kontext), nicht an der Buchung — das Zusammenführen ist Sache der
 * aufrufenden Schicht, nicht des Kerns.
 */
export interface Zahlungsspur {
  readonly id: string;
  /** ISO „YYYY-MM-DD". */
  readonly datum: string;
  /** Vorzeichenbehaftet; negativ = Abfluss. */
  readonly betrag: Cent;
  readonly gegenpartei: string;
  readonly glaeubigerId?: string;
  readonly kategorieId?: string;
  /**
   * Nur `Aufwand` kann ein Vertrag sein. Ohne diese Prüfung stand auf echten Daten das
   * eigene „Tagesgeldkonto" als Vertragsvorschlag in der Liste: eine monatliche
   * Umbuchung aufs Sparkonto ist perfekt regelmäßig — und trotzdem keine Ausgabe,
   * sondern eigenes Geld, das nur den Platz wechselt.
   */
  readonly charakter: "Aufwand" | "Ertrag" | "Umschichtung";
}

export interface Vertragskandidat {
  /** Gruppierungsschlüssel (Gläubiger-ID oder normalisierter Name) — stabil über Läufe. */
  readonly schluessel: string;
  /** Anzeigename: der längste tatsächlich vorkommende Empfängername der Gruppe. */
  readonly anbieter: string;
  readonly glaeubigerId?: string;
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
  readonly buchungIds: readonly string[];
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

/** Rechtsformen und Füllwörter, die denselben Anbieter verschieden aussehen lassen. */
const RECHTSFORMEN = new Set([
  "gmbh", "mbh", "ag", "kg", "kgaa", "ohg", "gbr", "ug", "se", "ev", "eg",
  "co", "cokg", "ltd", "plc", "sa", "sas", "bv", "nv", "as", "ab", "oy", "inc", "llc",
  "und", "the",
]);

/**
 * Empfängername → Gruppierungsschlüssel.
 *
 * Bewusst zurückhaltend: Kleinschreibung, Umlaute auflösen, Satzzeichen und Ziffern
 * raus, Rechtsformen raus. NICHT gekürzt auf die ersten Wörter — „[anonymisiert] Bonn" und
 * „[anonymisiert] Bremen" würden sonst zu einem Anbieter verschmelzen, und ein falsch
 * zusammengefasster Vorschlag ist schlimmer als zwei getrennte.
 */
export function anbieterSchluessel(name: string): string {
  const roh = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const woerter = roh.split(" ").filter((w) => w && !RECHTSFORMEN.has(w) && !/^\d+$/.test(w));
  return woerter.join(" ") || roh;
}

/** Median einer nicht-leeren Zahlenreihe (bei gerader Länge der untere der beiden mittleren). */
function median(werte: number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.floor((sortiert.length - 1) / 2)];
}

/** Tagesabstand → Rhythmus, oder null, wenn er zu keinem passt. */
function rhythmusAus(tage: number): Rhythmus | null {
  if (tage >= 25 && tage <= 38) return "monatlich";
  if (tage >= 80 && tage <= 105) return "quartalsweise";
  if (tage >= 160 && tage <= 200) return "halbjaehrlich";
  if (tage >= 330 && tage <= 400) return "jaehrlich";
  return null;
}

/**
 * Findet Vertragskandidaten in `spuren`. `heute` entscheidet nur darüber, was noch als
 * laufend gilt — die Erkennung selbst ist zeitunabhängig.
 *
 * Nur Abflüsse: eine Gehaltszahlung ist zwar regelmäßig, aber kein Vertrag, den man
 * kündigt. Einnahmen-Verträge legt man weiter von Hand an.
 */
export function vertragskandidaten(
  spuren: readonly Zahlungsspur[],
  heute: string,
  optionen: ErkennungsOptionen = {},
): Vertragskandidat[] {
  const opt = { ...STANDARD, ...optionen };

  const gruppen = new Map<string, Zahlungsspur[]>();
  for (const s of spuren) {
    if (s.betrag >= 0 || s.charakter !== "Aufwand") continue;
    const name = s.gegenpartei.trim();
    if (!name && !s.glaeubigerId) continue;
    const schluessel = s.glaeubigerId?.trim() || anbieterSchluessel(name);
    if (!schluessel) continue;
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
  if (nahAmMedian / abstaende.length < 0.6) return null;

  const betraege = sortiert.map((s) => Math.abs(s.betrag));
  const medianBetrag = median(betraege);
  if (medianBetrag <= 0) return null;
  // 5 % Toleranz, mindestens 1 € — sonst gälte bei einem 3-€-Abo jeder Cent als Sprung.
  const toleranz = Math.max(100, Math.round(medianBetrag * 0.05));
  const stabil = betraege.filter((b) => Math.abs(b - medianBetrag) <= toleranz).length;

  const letzte = termine[termine.length - 1];
  // Ein Rhythmus darf einmal aussetzen (Zahlungspause, verschobene Abbuchung), bevor
  // ein Vertrag als beendet gilt; 10 Tage Puffer für Wochenend-/Feiertagsverschiebung.
  //
  // Über `tageBis` und NICHT über `ord`: `ord` liefert den Sortierschlüssel YYYYMMDD,
  // keinen Tageszähler — „ord(heute) − 70" ergäbe ein Datum, das es nicht gibt, und
  // damit ein zufälliges Ergebnis. Auf echten Daten fielen dadurch laufende Verträge
  // ([anonymisiert], letzte Zahlung vor einem Monat) in die Rubrik „beendet".
  const laeuft = tageBis(letzte, heute) <= medianAbstand * 2 + 10;

  return {
    schluessel,
    anbieter: anzeigename(sortiert),
    glaeubigerId: sortiert.find((s) => s.glaeubigerId)?.glaeubigerId,
    rhythmus,
    betrag: medianBetrag,
    betragStabilitaet: stabil / betraege.length,
    anzahl: sortiert.length,
    ersteZahlung: termine[0],
    letzteZahlung: letzte,
    laeuft,
    kategorieId: haeufigsteKategorie(sortiert),
    buchungIds: sortiert.map((s) => s.id),
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

function haeufigsteKategorie(gruppe: Zahlungsspur[]): string | undefined {
  const zaehler = new Map<string, number>();
  for (const s of gruppe) {
    if (s.kategorieId) zaehler.set(s.kategorieId, (zaehler.get(s.kategorieId) ?? 0) + 1);
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
