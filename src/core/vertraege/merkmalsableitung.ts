// Aus zugeordneten Zahlungen wird eine Regel — die Vorschau rueckwaerts gelesen.
//
// Bis hierher lief die Erkennung nur in eine Richtung: jemand tippt ein Muster ein,
// `merkmalsTreffer` sagt, wie oft es trifft. Das reicht, um eine Regel zu PRUEFEN, und es
// hilft nicht dabei, ueberhaupt auf sie zu kommen. Wer eine Handvoll Buchungen vor sich
// hat, die zusammengehoeren, muss den gemeinsamen Nenner selbst sehen und abtippen — und
// bei einem Empfaenger, der Vertragsnummern und Ortsangaben mitfuehrt, sieht man ihn nicht.
//
// Diese Datei dreht die Richtung um: aus den Zahlungen Kandidaten bilden und sie durch
// DIESELBE Messung schicken. Kein zweites Trefferverfahren — was hier gezaehlt wird,
// zaehlt `merkmalsTreffer`, damit die Zahl im Vorschlag und die Zahl in der Regel
// dasselbe bedeuten.
//
// ## Was ein Beleg ist, und was keiner
//
// Beleg ist ausschliesslich eine Zuordnung VON HAND (`vertrag_herkunft = 'manuell'`).
// Eine Buchung, die die Regel selbst zugeordnet hat, ist das Ergebnis der Regel; sie als
// Beleg fuer die Regel zu nehmen ist ein Kreis. Der geht langsam schief und faellt spaet
// auf: die Regel greift einmal zu weit, der Fehlgriff wird Beleg, das abgeleitete Muster
// wird breiter, greift weiter daneben. Das Schema trennt beides bereits — die Trennung
// geht nur verloren, wenn jemand spaeter „alle Buchungen des Vertrags" schreibt, weil das
// die naheliegende Formulierung ist.
//
// ## Drei Gruppen, und warum es drei sind
//
// | | woher | heisst |
// |---|---|---|
// | `dazu` | `vertrag_id = X` ∧ Herkunft Hand | gehoert dazu — von Hand gesagt |
// | `nichtDazu` | `vertrag_id` leer ∧ Herkunft gesetzt | gehoert NICHT dazu — von Hand gesagt |
// | Rest | alles andere | unbeschriftet |
//
// Die mittlere Gruppe ist die wertvollste und die einzige, die es sonst nirgends gibt:
// ueberall sonst im Bestand heisst „kein Vertrag" entweder „gehoert zu keinem" oder „ist
// noch niemandem aufgefallen", und man sieht der Zeile nicht an, welches von beidem. Hier
// steht ein Nein, das jemand hingeschrieben hat.
//
// Der Rest ist deshalb ausdruecklich NICHT „gehoert nicht dazu". Ein Kandidat, der dort
// viel trifft, kann zu weit greifen — oder genau die Zahlungen finden, die beim Auswaehlen
// uebersehen wurden. Beides sieht in der Zahl gleich aus, und deshalb entscheidet sie hier
// nichts, sondern steht daneben.
//
// ## Warum es keine EINE Punktzahl gibt
//
// Naheliegend waere, die drei Zahlen zu einer zu verrechnen und danach zu sortieren. Das
// waere bequem und faengt genau die Frage weg, um die es geht: ein Merkmal, das alle
// Belege deckt und im Bestand ueberall trifft, ist etwas voellig anderes als eines, das
// die Haelfte deckt und sonst nichts — und welches von beiden das richtige ist, haengt am
// Fall. Eine Gewichtung dafuer waere geraten und wuerde als Zahl aussehen wie eine
// Messung. Die Reihenfolge unten ist eine Vorsortierung, keine Bewertung; entschieden
// wird an den drei Zahlen.
//
// ## Und keine Stoppwortliste
//
// Fuer den Verwendungszweck waere eine Liste allgemeiner Woerter („rechnung", „beitrag",
// „kunde") der erste Reflex. Sie ist nicht noetig und waere schlechter als das, was schon
// da ist: wie allgemein ein Wort ist, misst `unbeschriftet` am ECHTEN Bestand, waehrend
// eine Liste raet und gepflegt werden muesste. Ein Wort, das ueberall vorkommt, faellt an
// seiner Zahl auf — in jedem Haushalt an einer anderen.

import { anbieterSchluessel } from "../basis/gegenpartei";
import { musterSchaerfe } from "../basis/muster";
import type { Zahlungsspur } from "../buchung/zahlungsspur";
import {
  MERKMALSARTEN,
  merkmalsTreffer,
  type Erkennungsmerkmal,
  type Vertragszuordnung,
} from "./vertragZuordnung";

/**
 * Welche Zahlungen von Hand beschriftet sind — als IDs, nicht als Listen.
 *
 * Die Form ist Absicht: `Zahlungsspur` traegt keine Vertragsfelder (sie ist die flache
 * Sicht fuer Erkennung und Kategorisierung), und zwei getrennte Listen liessen offen, ob
 * sie Teilmengen der grossen sind. Mit IDs ueber EINER Liste sind die drei Gruppen
 * disjunkt und ihre Summe ist der Bestand — das macht die drei Zahlen unten vergleichbar.
 */
export interface Beleglage {
  /** Von Hand diesem Vertrag zugeordnet. */
  readonly dazu: ReadonlySet<string>;
  /** Von Hand als „zu keinem Vertrag" festgehalten. */
  readonly nichtDazu: ReadonlySet<string>;
}

/** Ein Vorschlag fuer die Merkmalsliste, mit dem, was fuer und gegen ihn spricht. */
export interface Merkmalskandidat {
  readonly merkmal: Erkennungsmerkmal;
  /** Belege, die dieses Merkmal findet. Mehr ist besser. */
  readonly decktAb: number;
  /** Hand-Neins, die es faelschlich findet. Jedes einzelne ist ein Gegenbeweis. */
  readonly widerspricht: number;
  /** Sonstige Zahlungen, die es findet. Weder gut noch schlecht — siehe oben. */
  readonly unbeschriftet: number;
}

/**
 * Ab wie vielen Zeichen ein Wort aus dem Verwendungszweck ueberhaupt als Muster taugt.
 * Kuerzere sind Kuerzel und Bindewoerter; sie treffen alles und sagen nichts.
 */
const ZWECK_MINDESTLAENGE = 4;

/**
 * Ab wie vielen Belegen der Verwendungszweck ueberhaupt herangezogen wird.
 *
 * Bei EINEM Beleg kommt jedes Wort seines Zwecks „in allen Belegen" vor, und die
 * Ableitung wuerde ein Dutzend Muster ausspucken, von denen keines etwas ueber den
 * Vertrag aussagt. Empfaenger und Glaeubiger-ID sind auch aus einem einzigen Beleg
 * brauchbar — der Zweck ist es nicht.
 */
const ZWECK_MINDESTBELEGE = 2;

/**
 * Kandidaten fuer die Merkmalsliste eines Vertrags, aus den von Hand zugeordneten
 * Zahlungen abgeleitet und an allen dreien gemessen.
 *
 * Reine Funktion ueber dem ganzen Bestand: `spuren` ist alles, was es gibt, `belege` sagt,
 * was davon beschriftet ist. Zurueck kommt eine vorsortierte Liste — was davon in die
 * Regel wandert, entscheidet der Mensch. **Diese Funktion schreibt nichts vor und ersetzt
 * keine Regel**, aus demselben Grund, aus dem es `vertrag_herkunft` gibt: eine Ableitung,
 * die zuschlaegt, ueberschreibt eines Tages etwas, das jemand von Hand eingetragen hat.
 */
export function merkmaleAbleiten(
  spuren: readonly Zahlungsspur[],
  belege: Beleglage,
): Merkmalskandidat[] {
  const dazu = belegspuren(spuren, belege);
  if (dazu.length === 0) return [];

  const kandidaten = kandidatenBilden(dazu);
  if (kandidaten.length === 0) return [];

  const nichtDazu = spuren.filter((s) => belege.nichtDazu.has(s.id));
  const rest = spuren.filter((s) => !belege.dazu.has(s.id) && !belege.nichtDazu.has(s.id));

  // Dreimal dieselbe Messung wie im Dialog — die Ergebnisse stehen in der Reihenfolge der
  // Kandidaten, `merkmalsTreffer` bildet eins zu eins ab.
  const inBelegen = merkmalsTreffer(kandidaten, dazu);
  const inNeins = merkmalsTreffer(kandidaten, nichtDazu);
  const imRest = merkmalsTreffer(kandidaten, rest);

  const ergebnis = kandidaten.map((merkmal, i) => ({
    merkmal,
    decktAb: inBelegen[i].trifft,
    widerspricht: inNeins[i].trifft,
    unbeschriftet: imRest[i].trifft,
  }));

  return ergebnis.sort(vergleiche);
}

/**
 * Die Vorsortierung. Jede Stufe ist fuer sich begruendbar, und keine verrechnet zwei
 * Groessen miteinander:
 *
 *  1. **Widerspruch zuerst.** Ein Kandidat, der ein Hand-Nein trifft, ist fuer mindestens
 *     einen Fall nachweislich falsch. Das ist die einzige Stufe mit einem Beweis dahinter.
 *  2. **Deckung.** Was mehr Belege findet, erklaert mehr.
 *  3. **Wenig sonst.** Bei gleicher Deckung ist der schaerfere Vorschlag der bessere.
 *  4. **Art.** Die Glaeubiger-ID identifiziert den Einzieher, der Empfaenger ist Text mit
 *     Unschaerfe, der Zweck ist Freitext — dieselbe Rangfolge, in der `MERKMALSARTEN`
 *     steht, und aus demselben Grund.
 *  5./6. **Schaerfe und Alphabet** nur noch, damit die Reihenfolge nicht vom Zufall der
 *     Erzeugung abhaengt. Zwei Laeufe ueber denselben Bestand sollen dasselbe zeigen.
 */
function vergleiche(a: Merkmalskandidat, b: Merkmalskandidat): number {
  if (a.widerspricht !== b.widerspricht) return a.widerspricht - b.widerspricht;
  if (a.decktAb !== b.decktAb) return b.decktAb - a.decktAb;
  if (a.unbeschriftet !== b.unbeschriftet) return a.unbeschriftet - b.unbeschriftet;
  const artA = MERKMALSARTEN.indexOf(a.merkmal.art);
  const artB = MERKMALSARTEN.indexOf(b.merkmal.art);
  if (artA !== artB) return artA - artB;
  const schaerfeA = musterSchaerfe(a.merkmal.muster);
  const schaerfeB = musterSchaerfe(b.merkmal.muster);
  if (schaerfeA !== schaerfeB) return schaerfeB - schaerfeA;
  return a.merkmal.muster.localeCompare(b.merkmal.muster);
}

/** Alle Kandidaten aus den Belegen, ohne Dubletten und in stabiler Reihenfolge. */
function kandidatenBilden(belege: readonly Zahlungsspur[]): Erkennungsmerkmal[] {
  const gesehen = new Set<string>();
  const raus: Erkennungsmerkmal[] = [];
  const merken = (m: Erkennungsmerkmal) => {
    const schluessel = `${m.art} ${m.muster}`;
    if (gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    raus.push(m);
  };

  // Die Glaeubiger-ID exakt und ohne Stern: sie ist eine Kennung, kein Text. Ein
  // Platzhalter darin wuerde eine Genauigkeit aufgeben, die es sonst nirgends gibt.
  for (const id of einmalig(belege.map((s) => s.glaeubigerId?.trim() ?? ""))) {
    merken({ art: "glaeubigerId", muster: id });
  }

  // Der Empfaenger in seiner normalisierten Form, mit NACHgestelltem Stern: Empfaengerfelder
  // sind „Name zuerst, Zusatz dahinter" — dieselbe Ueberlegung wie in `standardErkennung`,
  // nur aus den Buchungen statt aus dem eingetippten Anbieternamen.
  const namen = belege.map((s) => anbieterSchluessel(s.gegenpartei.trim())).filter(Boolean);
  for (const name of einmalig(namen)) {
    merken({ art: "empfaenger", muster: `${name}*` });
  }
  // Dazu der gemeinsame Anfang aller Namen. Er ist der eigentliche Gewinn dieser Ableitung:
  // wo derselbe Anbieter mal „… kd", mal „… re" im Feld stehen hat, deckt keiner der
  // Einzelnamen alles ab und der gemeinsame Anfang schon.
  const anfang = gemeinsamerWortanfang(namen);
  if (anfang) merken({ art: "empfaenger", muster: `${anfang}*` });

  // Der Zweck nur, wenn die Belege ihn tragen — und eingeschlossen statt vorangestellt:
  // ein Wort im Freitext steht irgendwo, nicht am Anfang. Das ist der bewusste Unterschied
  // zum Empfaenger, wo `*name*` fremde Zahlungen einsammeln wuerde.
  if (belege.length >= ZWECK_MINDESTBELEGE) {
    for (const wort of gemeinsameZweckwoerter(belege)) {
      merken({ art: "verwendungszweck", muster: `*${wort}*` });
    }
  }

  return raus;
}

/**
 * Die Belege, die ueberhaupt etwas hergeben koennen.
 *
 * **Ohne Umschichtungen**, und das ist kein Detail: `merkmalsTreffer` laesst sie aus
 * (eine Verschiebung zwischen eigenen Konten ist nie eine Vertragszahlung), ihr
 * Empfaengerfeld traegt je nach Bank die eigene IBAN, den eigenen Namen oder nichts. Als
 * Beleg mitgezaehlt waere sie ein Nenner, den kein Kandidat je erreichen kann — „deckt 3
 * von 4" bei drei brauchbaren Belegen, und die fehlende vierte findet niemand.
 *
 * Sie steht hier und nicht in der Anwendungsschicht, damit Zaehler und Ableitung
 * dieselbe Menge meinen. Getrennt gerechnet waeren es zwei Antworten auf dieselbe Frage.
 */
export function belegspuren(
  spuren: readonly Zahlungsspur[],
  belege: Beleglage,
): Zahlungsspur[] {
  return spuren.filter((s) => belege.dazu.has(s.id) && s.charakter !== "Umschichtung");
}

/** Nicht-leere Werte, jeder einmal, in der Reihenfolge des ersten Vorkommens. */
function einmalig(werte: readonly string[]): string[] {
  return [...new Set(werte.filter((w) => w.length > 0))];
}

/**
 * Der gemeinsame Wortanfang aller Namen — WORTweise, nicht zeichenweise.
 *
 * Zeichenweise waere kuerzer zu schreiben und faengt sich mitten in einem Wort ab:
 * „nordhoff energie" und „nordhoff erdgas" haetten den gemeinsamen Anfang „nordhoff e",
 * und daraus wird ein Muster, das niemand mehr lesen oder von Hand nachbessern kann.
 *
 * Leer, wenn es nichts Gemeinsames gibt oder der Anfang bereits einer der ganzen Namen ist
 * — dann steht er schon als eigener Kandidat da.
 */
function gemeinsamerWortanfang(namen: readonly string[]): string {
  if (namen.length === 0) return "";
  const zerlegt = namen.map((n) => n.split(" ").filter(Boolean));
  const kuerzeste = Math.min(...zerlegt.map((w) => w.length));
  let laenge = 0;
  while (laenge < kuerzeste && zerlegt.every((w) => w[laenge] === zerlegt[0][laenge])) laenge++;
  if (laenge === 0) return "";
  const anfang = zerlegt[0].slice(0, laenge).join(" ");
  return zerlegt.some((w) => w.length > laenge) ? anfang : "";
}

/**
 * Woerter, die im Verwendungszweck JEDES Belegs vorkommen.
 *
 * Ziffern fliegen raus, und das ist der Kern der Sache: der Zweck traegt Rechnungs- und
 * Vertragsnummern, und ein Muster daraus kaeme genau einmal vor — es sieht nach einer
 * perfekten Regel aus (deckt alles, trifft sonst nichts) und findet die naechste Zahlung
 * desselben Vertrags nie.
 */
function gemeinsameZweckwoerter(belege: readonly Zahlungsspur[]): string[] {
  const proBeleg = belege.map((s) => new Set(zweckwoerter(s.verwendungszweck ?? "")));
  if (proBeleg.some((w) => w.size === 0)) return [];
  const [erster, ...weitere] = proBeleg;
  return [...erster].filter((w) => weitere.every((s) => s.has(w)));
}

function zweckwoerter(zweck: string): string[] {
  return zweck
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= ZWECK_MINDESTLAENGE && !/\d/.test(w));
}

/**
 * Die Beleglage eines Vertrags aus den gespeicherten Zuordnungen.
 *
 * **Nur `herkunft === "manuell"`** — der Kreis aus dem Kopf dieser Datei wird genau hier
 * verhindert, an der einzigen Stelle, an der jemand versucht sein koennte, „alle
 * Buchungen des Vertrags" zu schreiben.
 *
 * Die zweite Gruppe faellt dabei von selbst an: eine Zuordnung von Hand mit
 * `vertragId === null` ist die Aussage „gehoert ausdruecklich zu keinem Vertrag". Sie
 * gilt fuer JEDEN Vertrag als Nein, nicht nur fuer diesen — deshalb steht dort keine
 * Vertragspruefung. Eine Zuordnung von Hand zu einem ANDEREN Vertrag bleibt dagegen
 * unbeschriftet: dass eine Zahlung zu Vertrag B gehoert, ist ein starkes Indiz gegen A,
 * aber kein Nein zu A — und ein Indiz gehoert nicht in eine Gruppe, die „von Hand
 * gesagt" heisst.
 */
export function beleglageFuer(
  vertragId: string,
  zuordnungen: readonly Vertragszuordnung[],
): Beleglage {
  const dazu = new Set<string>();
  const nichtDazu = new Set<string>();
  for (const z of zuordnungen) {
    if (z.herkunft !== "manuell") continue;
    if (z.vertragId === vertragId) dazu.add(z.istbuchungId);
    else if (z.vertragId === null) nichtDazu.add(z.istbuchungId);
  }
  return { dazu, nichtDazu };
}
