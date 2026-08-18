// Dublettenfinder — ist diese Buchung schon da?
//
// Quellenagnostisch: er vergleicht `RohUmsatz` mit `RohUmsatz` und weiß nicht, ob die
// eine aus einer Datei und die andere von der Bank kommt. Damit gilt er für alle drei
// Fälle, die auftreten:
//
//   • dieselbe Datei nochmal einlesen (Reimport, um neue Felder nachzutragen)
//   • Bankabruf gegen Dateibestand
//   • Bankabruf gegen Bankabruf (das Rückgriffsfenster überlappt bewusst)
//
// **Warum kein Modell.** Die Frage ist Identität, nicht Ähnlichkeit im Sinne von
// Bedeutung: bei einer Fehlentscheidung muss der Grund lesbar sein, und dieselbe Eingabe
// muss morgen dasselbe Urteil ergeben. Gemessen am echten Bestand ist der
// Verwendungszweck beider Quellen ohnehin DIESELBE Zeichenkette — Finanzguru hängt nur
// den Kartennummern-Block an. Da gibt es nichts zu verstehen, nur zu vergleichen.
//
// **Warum ein Punktesystem und keine feste Regel.** Keine einzelne Angabe trägt allein:
// die Bank vergibt keine stabile Buchungs-ID (`customerReference` ist durchgehend
// NONREF, `bankReference` ein Positionszähler über das abgefragte Fenster), Finanzguru
// liefert die End-to-End-Referenz nicht (Spalte `E-Ref`: 0 von 5279 gefüllt), und der
// Buchungstag verschiebt sich, wenn aus einer angekündigten eine gebuchte Zahlung wird.
// Mehrere schwache Signale zusammen tragen; ein einzelnes nicht.
//
// **Was NICHT verhandelbar ist:** Betrag und Konto müssen exakt stimmen. Zwei Buchungen
// mit verschiedenen Beträgen sind nie dieselbe, egal wie ähnlich der Text ist.

import type { Cent } from "../../core";
import { normalisiereIban } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

/** Was der Finder von einer Buchung braucht — der gemeinsame Nenner beider Quellen. */
export interface Vergleichbar {
  readonly buchungstag: string;
  readonly valuta?: string;
  readonly betrag: Cent;
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  readonly kontoIban?: string;
  readonly gegenparteiIban?: string;
  readonly glaeubigerId?: string;
  readonly mandatsreferenz?: string;
  readonly nativeId?: string;
  readonly quelle: string;
}

export type Urteil = "identisch" | "verdacht" | "verschieden";

export interface Bewertung {
  readonly urteil: Urteil;
  readonly punkte: number;
  /** Warum — in Klartext, damit eine Fehlentscheidung nachvollziehbar bleibt. */
  readonly gruende: readonly string[];
}

/** Ab hier gilt eine Buchung als dieselbe. */
export const SCHWELLE_IDENTISCH = 5;
/** Darunter, aber ab hier: nicht verwerfen, sondern vorlegen. */
export const SCHWELLE_VERDACHT = 3;

/** Wie weit der Buchungstag auseinanderliegen darf, damit überhaupt verglichen wird. */
export const MAX_TAGE = 3;

// ── Normalisierung ────────────────────────────────────────────────────────────────────

/**
 * Buchungstext-Vokabular, das Institute vorn an den Verwendungszweck kleben (MT940-Feld
 * `:86:`, Subfeld `?00`). Für den Vergleich muss es weg: FinTS liefert es mit,
 * Finanzguru nicht — sonst scheitert der Präfix-Vergleich an genau diesem Wort.
 *
 * Die Liste ist unvollständig und darf es sein: was nicht erkannt wird, bleibt stehen
 * und kostet höchstens Punkte, es erzeugt keine falsche Übereinstimmung.
 */
const BUCHUNGSTEXTE = [
  "lastschriftbelastung",
  "uebertragueberweisung",
  "kartenverfuegung",
  "kartenzahlung",
  "kontouebertrag",
  "wertpapierbezug",
  "wertpapiere",
  "auszahlunggaa",
  "dauerauftrag",
  "entgeltabschluss",
  "zinskontoabschluss",
  "gutschrift",
  "ueberweisung",
];

/** Klein, ohne Umlaute, nur Buchstaben und Ziffern. */
export function schlank(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** Verwendungszweck ohne führenden Buchungstext, schlank normalisiert. */
export function zweckKern(zweck: string | undefined): string {
  const s = schlank(zweck);
  for (const b of BUCHUNGSTEXTE) {
    if (s.startsWith(b)) return s.slice(b.length);
  }
  return s;
}

function woerter(text: string | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^a-zA-ZäöüßÄÖÜ0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

/** Anteil gemeinsamer Wörter an der kleineren Menge (0…1). */
function wortUeberlappung(a: string | undefined, b: string | undefined): number {
  const wa = woerter(a);
  const wb = woerter(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let gemeinsam = 0;
  for (const w of wa) if (wb.has(w)) gemeinsam++;
  return gemeinsam / Math.min(wa.size, wb.size);
}

function tageAbstand(a: string, b: string): number {
  const zahl = (iso: string) => {
    const [j, m, t] = iso.split("-").map(Number);
    return Date.UTC(j, m - 1, t) / 86_400_000;
  };
  return Math.abs(zahl(a) - zahl(b));
}

/**
 * Abstand zwischen zwei Buchungen in Tagen — über Buchungstag ODER Valuta, je nachdem,
 * was näher liegt.
 *
 * Der Grund ist der Alltag: aus einer angekündigten wird eine gebuchte Zahlung, und die
 * Bank vergibt dabei einen neuen Buchungstag. Die Wertstellung bleibt. Wer nur den
 * Buchungstag vergleicht, hält dieselbe Zahlung zweimal für zwei.
 */
export function datumsAbstand(a: Vergleichbar, b: Vergleichbar): number {
  const kandidaten = [tageAbstand(a.buchungstag, b.buchungstag)];
  if (a.valuta && b.valuta) kandidaten.push(tageAbstand(a.valuta, b.valuta));
  if (a.valuta) kandidaten.push(tageAbstand(a.valuta, b.buchungstag));
  if (b.valuta) kandidaten.push(tageAbstand(a.buchungstag, b.valuta));
  return Math.min(...kandidaten);
}

// ── Das Urteil ────────────────────────────────────────────────────────────────────────

/**
 * Vergleicht zwei Buchungen. Die Reihenfolge der Stufen ist absteigend sicher: erst die
 * Schlüssel, die eine Quelle selbst vergeben hat, dann der Bankschlüssel, dann das
 * Punktesystem.
 */
export function vergleiche(a: Vergleichbar, b: Vergleichbar): Bewertung {
  const gruende: string[] = [];

  // Harte Vorbedingung. Ein anderer Betrag ist eine andere Buchung — immer.
  if (a.betrag !== b.betrag) return { urteil: "verschieden", punkte: 0, gruende: ["Betrag verschieden"] };

  const kontoA = a.kontoIban ? normalisiereIban(a.kontoIban) : "";
  const kontoB = b.kontoIban ? normalisiereIban(b.kontoIban) : "";
  if (kontoA && kontoB && kontoA !== kontoB) {
    return { urteil: "verschieden", punkte: 0, gruende: ["anderes Konto"] };
  }

  // Stufe 1: dieselbe Quelle hat dieselbe ID vergeben. Das ist keine Schätzung.
  if (a.nativeId && b.nativeId && a.nativeId === b.nativeId) {
    return { urteil: "identisch", punkte: 99, gruende: ["gleiche Buchungs-ID der Quelle"] };
  }

  // Stufe 2: der von der Bank vergebene SEPA-Schlüssel. Gilt nur für Lastschriften und
  // nur, wenn beide Seiten ihn tragen — dann aber eindeutig.
  if (
    a.glaeubigerId &&
    b.glaeubigerId &&
    a.glaeubigerId === b.glaeubigerId &&
    a.mandatsreferenz &&
    b.mandatsreferenz &&
    a.mandatsreferenz === b.mandatsreferenz &&
    datumsAbstand(a, b) <= MAX_TAGE
  ) {
    return {
      urteil: "identisch",
      punkte: 99,
      gruende: ["gleiche Gläubiger-ID und Mandatsreferenz bei gleichem Betrag"],
    };
  }

  // Stufe 3: Punkte. Ab hier ist nichts mehr für sich allein aussagekräftig.
  const abstand = datumsAbstand(a, b);
  if (abstand > MAX_TAGE) {
    return { urteil: "verschieden", punkte: 0, gruende: [`${abstand} Tage auseinander`] };
  }

  let punkte = 0;
  if (abstand === 0) {
    punkte += 3;
    gruende.push("gleicher Tag");
  } else if (abstand <= 1) {
    punkte += 2;
    gruende.push("ein Tag Abstand");
  } else {
    punkte += 1;
    gruende.push(`${abstand} Tage Abstand`);
  }

  const zwA = zweckKern(a.verwendungszweck);
  const zwB = zweckKern(b.verwendungszweck);
  if (zwA && zwB) {
    if (zwA === zwB) {
      punkte += 3;
      gruende.push("gleicher Verwendungszweck");
    } else if (zwA.startsWith(zwB) || zwB.startsWith(zwA)) {
      // Der häufigste Fall zwischen Datei und Bank: dieselbe Zeichenkette, die eine
      // Quelle hängt noch etwas an (Finanzguru den Kartennummern-Block).
      punkte += 3;
      gruende.push("Verwendungszweck ist Anfang des anderen");
    } else if (zwA.slice(0, 15) === zwB.slice(0, 15) && zwA.length >= 15) {
      punkte += 2;
      gruende.push("Verwendungszweck beginnt gleich");
    } else if (wortUeberlappung(a.verwendungszweck, b.verwendungszweck) >= 0.6) {
      punkte += 1;
      gruende.push("Verwendungszweck überwiegend gleiche Wörter");
    } else {
      // Beide Seiten SAGEN etwas, und es passt nicht zusammen. Das ist kein fehlendes
      // Signal, sondern ein Gegenbeweis — sonst reichte „gleicher Tag, gleicher Betrag",
      // um zwei offensichtlich verschiedene Zahlungen zum Verdachtsfall zu machen.
      punkte -= 2;
      gruende.push("Verwendungszweck widerspricht");
    }
  }

  const gpA = schlank(a.gegenpartei);
  const gpB = schlank(b.gegenpartei);
  if (gpA && gpB) {
    if (gpA === gpB) {
      punkte += 2;
      gruende.push("gleiche Gegenpartei");
    } else if (gpA.includes(gpB) || gpB.includes(gpA)) {
      // „Edeka" steckt in „EDK*EDEKA PASCHMANN" — Finanzguru putzt, die Bank liefert roh.
      punkte += 2;
      gruende.push("Gegenpartei steckt in der anderen");
    } else if (wortUeberlappung(a.gegenpartei, b.gegenpartei) >= 0.5) {
      punkte += 1;
      gruende.push("Gegenpartei überwiegend gleiche Wörter");
    } else {
      punkte -= 1;
      gruende.push("Gegenpartei widerspricht");
    }
  } else if (gpA || gpB) {
    // Eine Seite kennt die Gegenpartei nicht (FinTS lässt sie bei jeder vierten Buchung
    // leer). Dann steht sie oft im Verwendungszweck der anderen.
    const bekannt = gpA || gpB;
    const zweckDerAnderen = gpA ? zwB : zwA;
    if (bekannt.length >= 4 && zweckDerAnderen.includes(bekannt)) {
      punkte += 1;
      gruende.push("Gegenpartei steht im Verwendungszweck der anderen Quelle");
    }
  }

  if (a.glaeubigerId && b.glaeubigerId && a.glaeubigerId === b.glaeubigerId) {
    punkte += 2;
    gruende.push("gleiche Gläubiger-ID");
  }

  if (a.gegenparteiIban && b.gegenparteiIban && normalisiereIban(a.gegenparteiIban) === normalisiereIban(b.gegenparteiIban)) {
    punkte += 2;
    gruende.push("gleiche Gegenpartei-IBAN");
  }

  // Bei ABWEICHENDEM Datum reicht kein Punktestand für „identisch" — dann bleibt es
  // höchstens ein Verdacht.
  //
  // Der Fall, der das erzwingt, steht im echten Bestand: zweimal derselbe Betrag beim
  // selben Händler, ein Tag auseinander. Das ist entweder dieselbe Zahlung, deren
  // Buchungstag sich beim Übergang von angekündigt zu gebucht verschoben hat — oder zwei
  // Einkäufe an aufeinanderfolgenden Tagen. Aus den Daten allein ist das nicht zu
  // entscheiden, und beide Fehler sind teuer: still zusammenlegen verliert eine echte
  // Zahlung, still trennen erzeugt die Dublette, die wir gerade abschaffen. Also
  // vorlegen. Wer einen harten Schlüssel hat (Buchungs-ID, Gläubiger-ID plus
  // Mandatsreferenz), ist oben schon durch und kommt hier nie an.
  const datumWeicht = abstand > 0;
  const urteil: Urteil =
    punkte >= SCHWELLE_IDENTISCH && !datumWeicht
      ? "identisch"
      : punkte >= SCHWELLE_VERDACHT
        ? "verdacht"
        : "verschieden";
  if (datumWeicht && punkte >= SCHWELLE_IDENTISCH) {
    gruende.push("Datum weicht ab — zur Bestätigung vorgelegt");
  }
  return { urteil, punkte, gruende };
}

// ── Zuordnung über ganze Listen ───────────────────────────────────────────────────────

export interface Treffer<T> {
  readonly neu: RohUmsatz;
  /** Der Bestandssatz, auf den er zeigt — bei „verschieden" keiner. */
  readonly bestand?: T;
  readonly bewertung: Bewertung;
}

/**
 * Ordnet neue Buchungen dem Bestand zu — jede Bestandszeile höchstens einmal.
 *
 * Ohne diese 1:1-Regel würden bei drei gleichen Beträgen am selben Tag alle drei neuen
 * auf dieselbe alte Zeile zeigen und zwei echte Buchungen verschwinden. Zugeordnet wird
 * gierig nach Punktzahl: der beste Treffer zuerst, damit die knappen Fälle nicht die
 * eindeutigen verdrängen. Bei Gleichstand entscheidet die Reihenfolge im Bestand — das
 * ist beliebig, aber deterministisch, und beide Kandidaten sind dann ohnehin
 * gleichwertig.
 */
export function ordneZu<T extends Vergleichbar>(
  neue: readonly RohUmsatz[],
  bestand: readonly T[],
): Treffer<T>[] {
  // Vorsortierung nach Betrag: der muss exakt stimmen, das spart den Rest der Vergleiche.
  const nachBetrag = new Map<Cent, T[]>();
  for (const b of bestand) {
    const liste = nachBetrag.get(b.betrag);
    if (liste) liste.push(b);
    else nachBetrag.set(b.betrag, [b]);
  }

  const alleBewertungen: { neuIndex: number; kandidat: T; bewertung: Bewertung }[] = [];
  neue.forEach((n, neuIndex) => {
    for (const kandidat of nachBetrag.get(n.betrag) ?? []) {
      const bewertung = vergleiche(n, kandidat);
      if (bewertung.urteil !== "verschieden") alleBewertungen.push({ neuIndex, kandidat, bewertung });
    }
  });

  alleBewertungen.sort((x, y) => y.bewertung.punkte - x.bewertung.punkte);

  const vergeben = new Set<T>();
  const zuNeu = new Map<number, { kandidat: T; bewertung: Bewertung }>();
  for (const eintrag of alleBewertungen) {
    if (zuNeu.has(eintrag.neuIndex) || vergeben.has(eintrag.kandidat)) continue;
    zuNeu.set(eintrag.neuIndex, { kandidat: eintrag.kandidat, bewertung: eintrag.bewertung });
    vergeben.add(eintrag.kandidat);
  }

  return neue.map((n, i) => {
    const treffer = zuNeu.get(i);
    return treffer
      ? { neu: n, bestand: treffer.kandidat, bewertung: treffer.bewertung }
      : { neu: n, bewertung: { urteil: "verschieden" as const, punkte: 0, gruende: [] } };
  });
}
