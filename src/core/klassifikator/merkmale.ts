// Merkmalsextraktion — aus einer Zahlung wird die Liste von Tokens, auf der der
// Klassifikator rechnet. Reine Funktionen, kein IO.
//
// Warum das eine eigene Datei mit eigenen Tests ist und nicht drei Zeilen im Modell:
// Aus dem Lern-Spike (2026-06) steht fest, dass der Deckel bei ~85 % daten- und nicht
// modelllimitiert ist — linear, MLP und tief+breit lagen gleichauf. Was dann noch etwas
// bewegt, ist die Frage, WAS überhaupt in den Vektor kommt. Die Extraktion ist der Hebel,
// das Modell dahinter ist Arithmetik.
//
// Vier Quellen, jede in einem eigenen Namensraum:
//
//   • `emp=…`  der ganze normalisierte Empfängername als EIN Token. Scharf: wer 68-mal
//              an dieselbe Firma gezahlt hat, wird darüber praktisch sicher erkannt.
//   • `emp:…`  seine Einzelwörter. Unscharf, aber sie GENERALISIEREN — „apotheke" zieht
//              bei „Apotheke am Markt" und bei „Sonnen-Apotheke", auch wenn genau dieser
//              Anbieter noch nie vorkam. Das ist der Teil, der einmalige Zahlungen im
//              Urlaub auffängt, für die eine Regel nur eine tote Zeile wäre.
//   • `vwz:…`  Wörter aus dem Verwendungszweck. Bei Kartenzahlungen oft die einzige
//              Stelle, an der überhaupt steht, worum es ging — aber auch das
//              schmutzigste Feld (siehe STRUKTURFILTER).
//   • `gid:…`  die SEPA-Gläubiger-ID. Nur bei Lastschrift dabei (auf echten Daten 8 %),
//              dann aber ein sehr scharfes Signal. Kostet ein Token und wird ignoriert,
//              wo sie fehlt.
//
// Dazu das VORZEICHEN als eigenes Token. Der Spike hat gezeigt, dass der Betrag on-top
// redundant ist — das gilt für die HÖHE. Das Vorzeichen ist etwas anderes: es trennt
// Zufluss von Abfluss hart. Ohne es wird eine Supermarkt-Gutschrift zur Lebensmittel-
// ausgabe, weil der gesamte übrige Vektor identisch aussieht.
//
// Getrennte Namensräume, weil sonst ein Wort aus dem Verwendungszweck ein Empfänger-Token
// überstimmen kann und in der Begründung nicht mehr zu sehen ist, woher der Treffer kam.

import type { Cent } from "../geld";
import { anbieterSchluessel } from "../vertragErkennung";

/** Was von einer Zahlung in die Extraktion geht. Bewusst flach — kein Aggregat. */
export interface Merkmalsquelle {
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  readonly glaeubigerId?: string;
  /** Vorzeichenbehaftet; nur das Vorzeichen wird verwendet, nicht die Höhe. */
  readonly betrag: Cent;
}

/** Warum ein Wort es nicht in den Vektor geschafft hat. */
export type Verwurfsgrund = "zuKurz" | "ziffern" | "stoppwort" | "platzhalter";

export interface VerworfenesWort {
  readonly wort: string;
  readonly grund: Verwurfsgrund;
}

export interface Merkmalsbefund {
  /** Die Tokens, auf denen gerechnet wird — ohne Dubletten, in stabiler Reihenfolge. */
  readonly merkmale: readonly string[];
  /** Was aussortiert wurde und warum. Grundlage der Anzeige „was fällt weg?". */
  readonly verworfen: readonly VerworfenesWort[];
}

/**
 * Wörter unter dieser Länge tragen nichts. Zwei Zeichen bleiben bewusst drin: „o2" ist
 * ein Anbieter, und im Empfängerfeld sind kurze Marken die Regel, nicht die Ausnahme.
 */
const MIN_LAENGE = 2;

/**
 * Ab dieser Länge gilt ein Wort mit Ziffern als Referenznummer und fliegt raus.
 *
 * Die Grenze ist der Kompromiss zwischen zwei echten Fällen: „de89370400440532013000"
 * (IBAN), „re2026004711" (Rechnungsnummer) und „mandat0815" sollen weg — „o2", „m1" und
 * „b12" (Buslinien, Produktnamen) sollen bleiben. Reine Ziffernfolgen fliegen unabhängig
 * von der Länge raus; ein Datum oder ein Betrag im Verwendungszweck sagt über die
 * Kategorie nichts, kommt aber in jeder zweiten Zeile vor.
 */
const ZIFFERN_AB_LAENGE = 4;

/**
 * Ab wie vielen Stellen eine Ziffernfolge am Wortrand als angeklebte Nummer gilt und
 * abgeschnitten wird.
 *
 * Gemessen am echten Bestand (2026-08-16): ohne diesen Schritt verwarf die Ziffernregel
 * `debitkarte2025` (309×), `debitkarte2024`, `debitkarte2026`, `3386comdirect` (364×) und
 * `3386kdn` (326×) KOMPLETT — mitsamt dem brauchbaren Wort darin. Banken setzen zwischen
 * Bezeichnung und Nummer kein Leerzeichen; wer das ganze Token wegwirft, wirft die
 * Bezeichnung mit weg.
 *
 * Drei Stellen als Grenze, damit „o2" und „m1" heil bleiben: dort ist die Ziffer Teil des
 * Namens, keine angehängte Nummer. Ein einstelliges Abschneiden machte aus dem Anbieter
 * „o2" ein nichtssagendes „o".
 */
const ZIFFERNRAND_AB = 3;

/**
 * Wie viel Wort nach dem Abschneiden übrig bleiben muss, damit sich das Abschneiden
 * gelohnt hat.
 *
 * Sonst wird aus `de89370400440532013000` ein `de` und aus `re2026004711` ein `re` — das
 * IBAN-Länderkürzel und das Rechnungspräfix, beide massenhaft in den Daten und beide
 * ohne jeden Bezug zur Kategorie. Bleibt nur so ein Stummel übrig, war das ganze Token
 * eine Nummer mit Präfix und kein Wort mit angehängter Nummer.
 *
 * Drei Zeichen, weil `3386kdn` → `kdn` erhalten bleiben soll: eine Abkürzung, die
 * wiederkehrt, ist ein brauchbares Token — anders als ein Zwei-Zeichen-Präfix.
 */
const KERN_MIN = 3;

/**
 * Wörter, die in Zahlungsdaten massenhaft vorkommen und nichts unterscheiden.
 *
 * Bewusst KURZ gehalten. Ein lineares Modell lernt von selbst, dass ein Token nicht
 * trennt — sein Gewicht landet überall nahe null. Die Liste ist deshalb keine
 * Genauigkeits-, sondern eine Aufräummaßnahme: sie hält Vokabular und Begründung lesbar.
 * Jeder Eintrag mehr ist eine Behauptung darüber, was nichts bedeutet — und die kann
 * falsch sein. Im Zweifel drinlassen und das Modell entscheiden lassen.
 *
 * Zwei Gruppen: deutsche Funktionswörter, und Bank-Boilerplate, die in fast jedem
 * Verwendungszweck steht. NICHT drin sind Zahlungsarten wie „kartenzahlung" — die
 * korrelieren durchaus mit Kategorien (wer die Miete zahlt, zieht keine Karte).
 */
export const STOPPWOERTER: ReadonlySet<string> = new Set([
  // Funktionswörter
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines",
  "und", "oder", "fuer", "von", "vom", "zu", "zur", "zum", "mit", "am", "im",
  "in", "an", "auf", "bei", "ihr", "ihre", "ihren", "sie", "wir", "uns",
  // Bank-Boilerplate
  "sepa", "lastschrift", "basislastschrift", "einzug", "mandat", "mandatsreferenz",
  "referenz", "ref", "glaeubiger", "glaeubigerid", "nr", "nummer", "kundennummer",
  "kundennr", "rechnungsnummer", "rechnungsnr", "vertragsnummer", "vertragsnr",
  "datum", "betrag", "eur", "buchung", "buchungstag", "valuta", "verwendungszweck",
  "end", "endtoend", "eref", "kref", "mref", "cred", "svwz", "abwa", "abwe",
]);

/**
 * Text → Wörter. Dieselbe Normalisierung wie `anbieterSchluessel` (klein, Umlaute
 * aufgelöst, alles Nicht-Alphanumerische trennt), damit ein Wort aus dem Empfängerfeld
 * und dasselbe Wort aus dem Verwendungszweck sich gleichen — sonst wären „Müller" und
 * „mueller" zwei verschiedene Dinge, je nachdem, wo sie standen.
 */
function zerlegen(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Schneidet angeklebte Nummern von den Wortenden ab: `debitkarte2025` → `debitkarte`,
 * `3386comdirect` → `comdirect`. Kurze Ziffern (`o2`) bleiben stehen — siehe ZIFFERNRAND_AB.
 */
function ohneRandziffern(wort: string): string {
  const rand = new RegExp(`^\\d{${ZIFFERNRAND_AB},}|\\d{${ZIFFERNRAND_AB},}$`, "g");
  return wort.replace(rand, "");
}

/**
 * Prüft EIN Wort und liefert entweder das zu verwendende Token oder den Grund, warum
 * keins entsteht.
 *
 * Das Token kann vom Eingabewort abweichen (Randziffern abgeschnitten). In der
 * Verwurfs-Statistik steht dagegen immer das ORIGINAL — sonst stünde in der Anzeige ein
 * Wort, das so nirgends in den Daten vorkommt.
 */
function pruefe(wort: string): { token: string } | { grund: Verwurfsgrund } {
  // Reine Ziffernfolgen zuerst: ein Datum oder ein Betrag steht in jeder zweiten Zeile
  // und sagt über die Kategorie nichts.
  if (/^\d+$/.test(wort)) return { grund: "ziffern" };

  // Maskierte Kartennummern (`xxxx`) und Sternchenblöcke. Sie sind häufig — auf echten
  // Daten kam `xxxx` 1060-mal vor — und tragen per Konstruktion keine Information: was
  // sie verdecken, ist genau das, was interessant wäre.
  if (/^(.)\1{2,}$/.test(wort)) return { grund: "platzhalter" };

  const kern = ohneRandziffern(wort);
  if (!kern) return { grund: "ziffern" };
  // Wurde etwas abgeschnitten, muss ein echtes Wort übrig sein — sonst war das Token
  // eine Nummer mit Präfix (`de…`, `re…`) und der Stummel ist keine Information.
  if (kern !== wort && kern.length < KERN_MIN) return { grund: "ziffern" };
  if (kern.length < MIN_LAENGE) return { grund: "zuKurz" };
  // Ziffern MITTEN im Wort (`abc123def`) bleiben ein Verdachtsfall — die stehen nicht für
  // eine angehängte Nummer, sondern für einen zusammengeschriebenen Referenzcode.
  if (kern.length >= ZIFFERN_AB_LAENGE && /\d/.test(kern)) return { grund: "ziffern" };
  if (STOPPWOERTER.has(kern)) return { grund: "stoppwort" };
  return { token: kern };
}

/**
 * Die volle Extraktion mit Belegen: was drin ist UND was warum wegfiel.
 *
 * Der Verwurf ist bewusst Teil des Ergebnisses und keine nachgelagerte Statistik: die
 * Frage „was von meinen Daten sieht das Modell eigentlich?" soll aus derselben Rechnung
 * beantwortet werden wie das Training. Zwei getrennte Wege wären zwei Antworten auf
 * dieselbe Frage, und die zweite fiele beim ersten Feintuning hinten runter.
 */
export function merkmalsbefund(q: Merkmalsquelle): Merkmalsbefund {
  const merkmale: string[] = [];
  const verworfen: VerworfenesWort[] = [];
  const gesehen = new Set<string>();

  const hinzu = (token: string) => {
    if (gesehen.has(token)) return;
    gesehen.add(token);
    merkmale.push(token);
  };

  // Empfänger — wiederverwendet `anbieterSchluessel` (Rechtsformen und Ziffern sind dort
  // schon raus), damit derselbe Name hier und in der Vertragserkennung dieselbe Form hat.
  const empfaenger = anbieterSchluessel(q.gegenpartei.trim());
  if (empfaenger) {
    hinzu(`emp=${empfaenger}`);
    const woerter = empfaenger.split(" ").filter(Boolean);
    // Bei einem einwortigen Namen wäre das Teil-Token eine Kopie des ganzen — es sagt
    // nichts Zusätzliches und würde diesem Anbieter nur doppeltes Gewicht geben.
    if (woerter.length > 1) {
      for (const w of woerter) {
        const r = pruefe(w);
        if ("grund" in r) verworfen.push({ wort: w, grund: r.grund });
        else hinzu(`emp:${r.token}`);
      }
    }
  }

  for (const w of zerlegen(q.verwendungszweck)) {
    const r = pruefe(w);
    if ("grund" in r) verworfen.push({ wort: w, grund: r.grund });
    else hinzu(`vwz:${r.token}`);
  }

  const gid = q.glaeubigerId?.trim();
  if (gid) hinzu(`gid:${gid.toUpperCase()}`);

  // Kein Token bei Betrag 0: eine Null hat keine Richtung, und „ist weder Zu- noch
  // Abfluss" ist eine Aussage, die kein Beispiel im Bestand stützt.
  if (q.betrag !== 0) hinzu(q.betrag < 0 ? "vz:-" : "vz:+");

  return { merkmale, verworfen };
}

/** Nur die Tokens — der heiße Pfad in Training und Klassifikation. */
export function merkmaleFuer(q: Merkmalsquelle): string[] {
  return [...merkmalsbefund(q).merkmale];
}

/** Der Namensraum eines Tokens (`emp`, `vwz`, `gid`, `vz`) — für Anzeige und Gruppierung. */
export function namensraum(merkmal: string): string {
  const i = merkmal.search(/[=:]/);
  return i < 0 ? "" : merkmal.slice(0, i);
}
