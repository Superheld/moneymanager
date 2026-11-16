// Eine Rücklage als Folge von Zyklen — die Rechenbausteine für „eine Rücklage" (ADR-0006).
//
// Seit Paket 3 des Umbaus (Migration 80) rechnet die Ergebnisrechnung jede Rücklage über
// diese Bausteine — seit Migration 81 auch die früheren aufbauenden Budgets, die jetzt
// Rücklagen der Sorte `fortlaufend` sind. `topf.test.ts` hält fest, dass sie auf den
// Daten von davor DASSELBE ergeben wie die Rechnung von davor, und
// `src/umstellungsprobe.test.ts` prüft es Zahl für Zahl an ganzen Beständen.
//
// Das Bild dahinter: eine Rücklage legt Monat für Monat ihre Rate zurück und trägt die
// Ausgaben, die zu ihr gehören. Eine `fortlaufend`e tut das für immer, eine
// `abschliessend`e, bis der Nutzer sie abschliesst — danach beginnt sie bei null (oder
// endet). Jedes Stück zwischen zwei Abschlüssen ist ein ZYKLUS, und jeder Zyklus rechnet
// für sich:
//
//     Kosten bis M = max(Σ Raten bis M, Σ Entnahmen bis Ende M)
//
// die Regel des aufbauenden Budgets (bis Paket 3 `topfKosten` in `ergebnis.ts`), jetzt je Zyklus.
// Ausgenommen sind nur Zyklen, die vor der Umstellung mit einer verknüpften Buchung
// ausgebucht wurden: für die gilt die alte Regel weiter (`altabschlussKosten`), damit
// kein vergangener Monat anders kostet als vorher.

import { addMonate, addTage, parseIso, toIso } from "../basis/datum";
import type { Cent } from "../basis/geld";
import type { Budgetmonat } from "../budgets/budgetverlauf";
import { hatGeschichte, type Ruecklage, type Ruecklagenart, type Ruecklagenrate, type Ruecklagenzyklus } from "./ruecklage";

/** Die Sorte einer Rücklage; ohne Angabe `abschliessend`, wie jede vor Migration 79. */
export function ruecklagenart(r: Pick<Ruecklage, "art">): Ruecklagenart {
  return r.art ?? "abschliessend";
}

/**
 * Eine Ausgabe, die eine Rücklage trägt — vorzeichenbehaftet wie die Buchung (Abfluss
 * negativ, eine Erstattung positiv). Welche Ausgaben das sind, entscheidet
 * `zustaendigkeit`; hier wird nur noch gezählt.
 */
export interface Ruecklagenentnahme {
  readonly datum: string;
  readonly betrag: Cent;
}

/**
 * Ein Zyklus: von einem Beginn bis zum Abschluss oder, beim laufenden, offen.
 *
 * Zwei Fenster, und sie sind absichtlich nicht dasselbe:
 *
 *   • RATEN zählen von Monat(beginn) bis Monat(ende) − 1. Die Rate des Abschlussmonats
 *     gehört dem neuen Zyklus — so rechnet heute `zyklusSoll`, und so beginnt der neue
 *     Zyklus am Abschlusstag mit der Rate seines ersten Monats.
 *   • ENTNAHMEN zählen von `entnahmenAb` bis einschliesslich `ende`. Der Kauf am Tag des
 *     Abschlusses gehört dem Zyklus, den er abschliesst; der neue beginnt deshalb erst am
 *     Tag DANACH zu entnehmen. Sonst stünde eine Ausgabe dieses Tages in beiden.
 */
export interface Zyklus {
  readonly ruecklageId: string;
  readonly art: Ruecklagenart;
  /**
   * Der erste Tag (ISO). Fehlt er, ist die Geschichte unbekannt (eine Ausbuchung von vor
   * Migration 76): der Zyklus kostet dann nichts und trägt nichts — erfunden wird nichts.
   */
  readonly beginn?: string;
  /** Der Tag des Abschlusses; fehlt beim laufenden Zyklus. */
  readonly ende?: string;
  /** Ab welchem Tag (einschliesslich) Entnahmen zu diesem Zyklus zählen. */
  readonly entnahmenAb?: string;
  readonly ziel?: Cent;
  readonly fristMonate?: number;
  /** Die freien Raten; leer bei einem Zyklus mit Ziel. */
  readonly raten: readonly Ruecklagenrate[];
  /** Die Ausbuchung, die ihn abgeschlossen hat. */
  readonly abschlussId?: string;
  /**
   * Die Buchung, mit der er vor der Umstellung ausgebucht wurde. Ist sie gesetzt, rechnet
   * der Zyklus nach der alten Regel (`altabschlussKosten`) — Teil B des Entwurfs, Abschnitt 2.
   */
  readonly istbuchungId?: string;
}

const monatVon = (iso: string): string => iso.slice(0, 7);
const monatVerschoben = (monat: string, n: number): string =>
  monatVon(toIso(addMonate(parseIso(`${monat}-01`), n)));
const tagDanach = (iso: string): string => toIso(addTage(parseIso(iso), 1));
const spaeter = (a: string, b: string): string => (a > b ? a : b);

function zyklusHatZiel(z: Pick<Zyklus, "ziel" | "fristMonate">): boolean {
  return (z.ziel ?? 0) > 0 && (z.fristMonate ?? 0) > 0;
}

/**
 * Die freien Raten des LAUFENDEN Zyklus. Solange die Reihe leer ist — bis die freie Rate
 * aus `rate` überführt ist —, gilt `rate` ab dem Monat von `beginn`. Genau das rechnet
 * heute `sollRuecklage`, und die Äquivalenz in den Tests hängt an dieser Rückfalllinie.
 */
function laufendeRaten(r: Ruecklage): readonly Ruecklagenrate[] {
  if (zyklusHatZiel({ ziel: r.ziel, fristMonate: r.fristMonate })) return [];
  if (r.raten && r.raten.length > 0) return r.raten;
  return (r.rate ?? 0) > 0 ? [{ abMonat: monatVon(r.beginn), betrag: r.rate as Cent }] : [];
}

/**
 * Die Zyklen einer Rücklage, ältester zuerst: einer je Abschluss und, solange sie nicht
 * beendet ist, der laufende.
 *
 * Ein abgeschlossener Zyklus nimmt Ziel, Frist und Rate aus dem, was der Abschluss
 * festgehalten hat (`Ruecklagenzyklus`). Fehlt dort die Rate bei einem freien Zyklus,
 * kommt sie aus der Reihe der Rücklage — die schreibt keine Änderung rückwirkend um, und
 * deshalb braucht ein künftiger Abschluss sie nicht mehr festzuhalten.
 *
 * Beispiel: Ziel 1200 in 12 Monaten ab 01.01., abgeschlossen am 15.07. → Zyklus 1 mit
 * Raten Januar bis Juni; Zyklus 2 ab 15.07., offen.
 */
export function zyklen(r: Ruecklage, abschluesse: readonly Ruecklagenzyklus[]): Zyklus[] {
  const art = ruecklagenart(r);
  const eigene = abschluesse
    .filter((a) => a.ruecklageId === r.id)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.id.localeCompare(b.id));

  const raus: Zyklus[] = [];
  let letztesEnde: string | undefined;
  for (const a of eigene) {
    raus.push(abgeschlossenerZyklus(a, art, r.raten ?? [], letztesEnde));
    letztesEnde = a.datum;
  }

  if (!r.beendetAm) {
    const mitZiel = zyklusHatZiel({ ziel: r.ziel, fristMonate: r.fristMonate });
    raus.push({
      ruecklageId: r.id,
      art,
      beginn: r.beginn,
      entnahmenAb: letztesEnde ? spaeter(r.beginn, tagDanach(letztesEnde)) : r.beginn,
      ziel: mitZiel ? r.ziel : undefined,
      fristMonate: mitZiel ? r.fristMonate : undefined,
      raten: laufendeRaten(r),
    });
  }
  return raus;
}

/**
 * Ein abgeschlossener Zyklus aus dem, was sein Abschluss festgehalten hat. `reihe` ist die
 * Ratenreihe der Rücklage — sie gilt, wo der Abschluss bei einem freien Zyklus keine Rate
 * festgehalten hat; `letztesEnde` der Abschluss davor, ab dessen Folgetag entnommen wird.
 */
export function abgeschlossenerZyklus(
  a: Ruecklagenzyklus,
  art: Ruecklagenart = "abschliessend",
  reihe: readonly Ruecklagenrate[] = [],
  letztesEnde?: string,
): Zyklus {
  const bekannt = hatGeschichte(a);
  const mitZiel = zyklusHatZiel({ ziel: a.zyklusZiel, fristMonate: a.zyklusFrist });
  const raten: readonly Ruecklagenrate[] =
    !bekannt || mitZiel
      ? []
      : a.zyklusRate != null
        ? [{ abMonat: monatVon(a.zyklusBeginn as string), betrag: a.zyklusRate }]
        : reihe;
  return {
    ruecklageId: a.ruecklageId,
    art,
    beginn: bekannt ? a.zyklusBeginn : undefined,
    ende: a.datum,
    entnahmenAb: bekannt
      ? letztesEnde ? spaeter(a.zyklusBeginn as string, tagDanach(letztesEnde)) : a.zyklusBeginn
      : undefined,
    ziel: mitZiel ? a.zyklusZiel : undefined,
    fristMonate: mitZiel ? a.zyklusFrist : undefined,
    raten,
    abschlussId: a.id,
    istbuchungId: a.istbuchungId,
  };
}

/** Der letzte Monat, dessen Rate der Zyklus trägt — beim laufenden keiner. */
function letzterRatenmonat(z: Zyklus): string | undefined {
  return z.ende ? monatVerschoben(monatVon(z.ende), -1) : undefined;
}

/**
 * Der Betrag der Reihe in `monat`: die jüngste Rate, die nicht später gilt; davor 0 —
 * dieselbe Regel wie `betragImMonat` beim Budget.
 */
export function rateDerReihe(raten: readonly Ruecklagenrate[], monat: string): Cent {
  let treffer = 0;
  for (const v of raten) {
    if (v.abMonat > monat) break;
    treffer = v.betrag;
  }
  return treffer;
}

/**
 * Was der Zyklus bis einschliesslich `monat` (`YYYY-MM`) zurückgelegt hat — der laufende
 * Monat zählt mit, wie heute `budgetRahmen`.
 *
 * Mit Ziel anteilig AUS DEM ZIEL und auf das Ziel gedeckelt, wie `sollRuecklage`: als
 * gerundete Rate mal Monate fehlte am Ende der Frist ein Rest. Frei aufsummiert über die
 * Reihe, nicht multipliziert, wie `budgetRahmen`: sonst rechnete eine geänderte Rate
 * rückwirkend in jeden Monat davor.
 *
 * Beispiel: 1200 in 12 Monaten ab Januar, Stand Juni → 600.
 */
export function ratenBis(z: Zyklus, monat: string): Cent {
  if (!z.beginn) return 0;
  const letzter = letzterRatenmonat(z);
  const bis = letzter && letzter < monat ? letzter : monat;
  const erster = monatVon(z.beginn);
  if (bis < erster) return 0;
  if (zyklusHatZiel(z)) {
    const ziel = z.ziel as Cent;
    const n = Math.max(0, monatsAbstand(erster, bis) + 1);
    return Math.min(Math.round((ziel * n) / (z.fristMonate as number)), ziel);
  }
  let summe = 0;
  for (let m = erster; m <= bis; m = monatVerschoben(m, 1)) summe += rateDerReihe(z.raten, m);
  return summe;
}

function monatsAbstand(von: string, bis: string): number {
  const [vj, vm] = von.split("-").map(Number);
  const [bj, bm] = bis.split("-").map(Number);
  return bj * 12 + bm - (vj * 12 + vm);
}

/**
 * Die Rate des Zyklus in `monat`. Mit Ziel der Zuwachs des Gedeckelten — ist das Ziel
 * erreicht, ist sie 0. Beispiel: 1200 in 12 Monaten, März → 100.
 */
export function rateIm(z: Zyklus, monat: string): Cent {
  return ratenBis(z, monat) - ratenBis(z, monatVerschoben(monat, -1));
}

/**
 * Die Rate, mit der eine Rücklage einen Monat PLANT: bei einer freien Rate der Betrag der
 * Reihe in diesem Monat — auch vor dem Beginn, wie `betragImMonat` beim aufbauenden Budget,
 * dessen Planzeile im Monatsausblick sie übernommen hat —, mit Ziel die Rate des laufenden
 * Zyklus.
 */
export function planrateIm(r: Ruecklage, monat: string): Cent {
  const z = zyklen(r, []).find((x) => !x.ende);
  if (!z) return 0;
  return z.raten.length > 0 ? rateDerReihe(z.raten, monat) : rateIm(z, monat);
}

/** Liegt der Tag im Entnahmefenster des Zyklus (und vor `bisAusschliesslich`)? */
function imFenster(z: Zyklus, datum: string, bisAusschliesslich?: string): boolean {
  if (!z.entnahmenAb || datum < z.entnahmenAb) return false;
  if (z.ende && datum > z.ende) return false;
  return !bisAusschliesslich || datum < bisAusschliesslich;
}

/** Was der Zyklus vor `bisAusschliesslich` getragen hat, POSITIV (eine Erstattung senkt es). */
function entnommen(z: Zyklus, entnahmen: readonly Ruecklagenentnahme[], bisAusschliesslich?: string): Cent {
  return -entnahmen.filter((e) => imFenster(z, e.datum, bisAusschliesslich)).reduce((s, e) => s + e.betrag, 0) || 0;
}

const ersterTag = (monat: string) => `${monat}-01`;

/**
 * Was der Zyklus in `monat` KOSTET, positiv — die Regel des aufbauenden Budgets
 * (bis Paket 3 `topfKosten`), je Zyklus:
 *
 *     Kosten bis M = max(Raten bis M, Entnahmen bis Ende M)
 *
 * und der Monat kostet die Differenz zum Vormonat. Reicht der Zyklus, kostet der Monat die
 * Rate; wird er überzogen, die Rate plus das Ungedeckte; solange er danach im Minus
 * steht, nichts — das Loch war schon Kosten.
 *
 * Ein abgeschlossener Zyklus kostet nach seinem Ende nichts mehr: seine Raten wachsen
 * nicht weiter, und Entnahmen nach dem Abschlusstag gehören dem nächsten. Ist seine
 * Geschichte unbekannt, kostet er nie etwas.
 *
 * Beispiel, frei 100 je Monat ab Januar, Entnahmen 250 im Mai und 400 im Juli: der Juli
 * kostet max(700, 650) − max(600, 250) = 100.
 */
export function zyklusKosten(z: Zyklus, entnahmen: readonly Ruecklagenentnahme[], monat: string): Cent {
  if (!z.beginn) return 0;
  const vormonat = monatVerschoben(monat, -1);
  const kostenBis = (m: string) => Math.max(ratenBis(z, m), entnommen(z, entnahmen, ersterTag(monatVerschoben(m, 1))));
  return kostenBis(monat) - kostenBis(vormonat) || 0;
}

/**
 * Was ein Zyklus kostet, der VOR der Umstellung mit einer verknüpften Buchung ausgebucht
 * wurde — die Regel, die bis Paket 3 inline in `ergebnis.ts` stand, unverändert:
 *
 *   • jeder Monat seine Rate (`rateIm`),
 *   • dazu im Monat des KAUFS, was der Kauf über dem Angesparten am Abschlusstag liegt:
 *     max(0, Kauf − Raten bis Abschlussmonat − 1).
 *
 * Gemessen am Abschlusstag, gezählt im Kaufmonat — auch wenn der Kauf vor oder nach dem
 * Abschlussmonat liegt. Die max-Regel verschöbe das Ungedeckte in andere Monate, sobald
 * beides auseinanderliegt, und einen Kauf NACH dem Abschluss sogar in den neuen Zyklus.
 * Deshalb gilt sie für diese Zyklen nicht.
 *
 * `kauf` ist die verknüpfte Buchung, wenn die Einordnung sie als Entnahme führt — sonst
 * fehlt sie, und es bleibt bei den Raten. Eine Rückbuchung deckt nichts auf. Ohne
 * Geschichte kostet der Zyklus 0, und der Kauf gilt als gedeckt.
 */
export function altabschlussKosten(z: Zyklus, kauf: Ruecklagenentnahme | undefined, monat: string): Cent {
  if (!z.beginn) return 0;
  const rate = rateIm(z, monat);
  if (!kauf || monatVon(kauf.datum) !== monat || !z.ende) return rate;
  return rate + (altabschlussUngedeckt(z, -kauf.betrag) ?? 0);
}

/**
 * Was von einer Ausgabe (POSITIV) über dem lag, was der Zyklus am Abschlusstag angespart
 * hatte — die Regel, die die Geschichte als „ungedeckt" zeigt und die
 * `altabschlussKosten` im Kaufmonat kostet. EINE Stelle für beide: bis Paket 3 stand
 * sie zweimal da (`zyklusUngedeckt` und inline in `ergebnis.ts`).
 *
 * `null` ohne Geschichte — „weiss man nicht", und der Kauf gilt als gedeckt. Eine
 * Rückbuchung deckt nichts auf.
 */
export function altabschlussUngedeckt(z: Zyklus, ausgabe: Cent): Cent | null {
  if (!z.beginn || !z.ende) return null;
  const angespart = ratenBis(z, monatVerschoben(monatVon(z.ende), -1));
  return Math.max(0, Math.max(0, ausgabe) - angespart);
}

/** Was ein Zyklus in `monat` getragen hat, vorzeichenbehaftet — fehlt, wenn nichts. */
export function entnahmeIm(z: Zyklus, entnahmen: readonly Ruecklagenentnahme[], monat: string): Cent | undefined {
  const eigene = entnahmen.filter((e) => monatVon(e.datum) === monat && imFenster(z, e.datum));
  return eigene.length === 0 ? undefined : eigene.reduce((s, e) => s + e.betrag, 0) || 0;
}

/** Ein Zyklus und was er in einem Monat kostet — ein Posten der Ergebnisrechnung. */
export interface Zyklusposten {
  readonly zyklus: Zyklus;
  /** Die Rate des Monats, positiv. */
  readonly rate: Cent;
  /** Was der Monat kostet, positiv (nach der Regel, die für den Zyklus gilt). */
  readonly kosten: Cent;
}

/**
 * Rate und Kosten je Zyklus — die Posten, aus denen die Ergebnisrechnung ihre Zeile
 * „Rücklagen" baut. Je Zyklus EINE der beiden Regeln (siehe `ruecklagenKostenIm`).
 */
export function zyklenpostenIm(
  r: Ruecklage,
  abschluesse: readonly Ruecklagenzyklus[],
  entnahmen: readonly Ruecklagenentnahme[],
  monat: string,
  altkaeufe: ReadonlyMap<string, Ruecklagenentnahme> = new Map(),
): Zyklusposten[] {
  return zyklen(r, abschluesse).map((z) => ({
    zyklus: z,
    rate: rateIm(z, monat),
    kosten: z.istbuchungId ? altabschlussKosten(z, altkaeufe.get(z.istbuchungId), monat) : zyklusKosten(z, entnahmen, monat),
  }));
}

/**
 * Rate und Kosten einer Rücklage in `monat`, über alle ihre Zyklen.
 *
 * Je Zyklus EINE der beiden Regeln: hat ihn eine Ausbuchung mit verknüpfter Buchung
 * abgeschlossen, die alte (`altabschlussKosten`, der Kauf aus `altkaeufe`); sonst die
 * max-Regel (`zyklusKosten`) über `entnahmen`. Beides trifft nie im selben Zyklus
 * zusammen: alte Verknüpfungen gibt es nur in Zyklen, die vor der Umstellung
 * abgeschlossen waren.
 *
 * `entnahmen` sind die Ausgaben, die `zustaendigkeit` dieser Rücklage gibt; `altkaeufe`
 * die verknüpften Buchungen je Buchungs-ID, soweit die Einordnung sie als Entnahme führt.
 */
export function ruecklagenKostenIm(
  r: Ruecklage,
  abschluesse: readonly Ruecklagenzyklus[],
  entnahmen: readonly Ruecklagenentnahme[],
  monat: string,
  altkaeufe: ReadonlyMap<string, Ruecklagenentnahme> = new Map(),
): { readonly rate: Cent; readonly kosten: Cent } {
  let rate = 0;
  let kosten = 0;
  for (const p of zyklenpostenIm(r, abschluesse, entnahmen, monat, altkaeufe)) {
    rate += p.rate;
    kosten += p.kosten;
  }
  return { rate, kosten };
}

/**
 * Der Zyklus, in dem der Tag liegt — am Abschlusstag schon der neue.
 *
 * Liegt der Tag vor dem Beginn, aber im selben MONAT, gilt der Zyklus trotzdem: Raten
 * sind Monatsgrössen, und ein aufbauendes Budget mit Start am 17. hat heute am 1. schon
 * die Rate des Monats (`budgetStand`). Die Entnahmen begrenzt `entnahmenAb` weiter auf
 * den Tag.
 */
function zyklusAm(zs: readonly Zyklus[], am: string): Zyklus | undefined {
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    if (z.beginn && z.beginn <= am && (!z.ende || am <= z.ende)) return z;
  }
  return zs.find((z) => z.beginn && monatVon(z.beginn) === monatVon(am) && (!z.ende || am <= z.ende));
}

export interface Ruecklagenstand {
  /** Was im Zyklus bis dahin zurückgelegt wurde. */
  readonly raten: Cent;
  /** Was er bis dahin getragen hat, positiv. */
  readonly entnahmen: Cent;
  /** `raten − entnahmen`; darf negativ sein. */
  readonly stand: Cent;
}

/**
 * Der Stand einer Rücklage am Tag `am`, im Zyklus, in dem der Tag liegt. Er darf negativ
 * sein — wird mehr gebraucht, als da war, läuft sie ins Minus.
 *
 * **Je Sorte wie heute** (Teil B des Entwurfs, Abschnitt 5), und das ist der Grund für
 * die zwei Zweige:
 *
 *   • `fortlaufend` wie heute das aufbauende Budget (`budgetStand`): die Rate des
 *     laufenden Monats zählt mit, und Entnahmen bis zum Ende dieses Monats.
 *   • `abschliessend` wie heute die Rücklage von Hand (`sollRuecklage`): Raten erst ab
 *     dem Folgemonat, Entnahmen bis einschliesslich `am`.
 *
 * Die Ergebnisrechnung berührt das nicht — beide belasten den Monat mit seiner Rate.
 *
 * Beispiel, frei 100 je Monat ab Januar, Entnahmen 250 im Mai und 400 im Juli, am 20.07.:
 * fortlaufend Raten 700, Entnahmen 650, Stand 50; abschliessend Raten 600, Stand −50.
 */
export function ruecklagenstand(
  r: Ruecklage,
  abschluesse: readonly Ruecklagenzyklus[],
  entnahmen: readonly Ruecklagenentnahme[],
  am: string,
): Ruecklagenstand {
  const z = zyklusAm(zyklen(r, abschluesse), am);
  if (!z) return { raten: 0, entnahmen: 0, stand: 0 };
  const monat = monatVon(am);
  const fortlaufend = z.art === "fortlaufend";
  const raten = ratenBis(z, fortlaufend ? monat : monatVerschoben(monat, -1));
  const weg = entnommen(z, entnahmen, fortlaufend ? ersterTag(monatVerschoben(monat, 1)) : tagDanach(am));
  return { raten, entnahmen: weg, stand: raten - weg };
}

/**
 * Eine Rücklage Monat für Monat: Übertrag aus dem Vormonat, plus was in diesem Monat
 * zurückgelegt wurde, minus was sie getragen hat, ergibt den Rest — die Fortschreibung,
 * die bis Migration 81 das aufbauende Budget hatte (`budgetFortschreibung`), jetzt für
 * JEDE Rücklage und in derselben Form (`Budgetmonat`).
 *
 * Der Rest am Ende eines Monats ist der Stand am letzten Tag (`ruecklagenstand`), je
 * Sorte wie dort: bei einer abschliessenden kommt die Rate eines Monats erst im Folgemonat
 * dazu. Was „in diesem Monat zurückgelegt" heisst, ist deshalb der Zuwachs dieses Stands
 * und nicht stur die Rate des Monats — sonst ginge der Rest nicht auf den Stand auf, der
 * daneben in der Liste steht.
 *
 * Beginnt in einem Monat ein neuer Zyklus (nach einem Ausbuchen), fängt die Reihe dort
 * bei null an; was der alte in diesem Monat noch getragen hat, steht in seiner Ausbuchung.
 * Vor dem ersten Beginn gibt es keine Monate — wie beim aufbauenden Budget vor seinem Start.
 */
export function ruecklagenFortschreibung(
  r: Ruecklage,
  abschluesse: readonly Ruecklagenzyklus[],
  entnahmen: readonly Ruecklagenentnahme[],
  vonMonat: string,
  bisMonat: string,
): Budgetmonat[] {
  const zs = zyklen(r, abschluesse);
  const erster = zs.find((z) => z.beginn)?.beginn;
  if (!erster) return [];
  const fortlaufend = ruecklagenart(r) === "fortlaufend";
  const amEnde = (m: string) => {
    const naechster = ersterTag(monatVerschoben(m, 1));
    const z = zyklusAm(zs, toIso(addTage(parseIso(naechster), -1)));
    if (!z) return { z, raten: 0, weg: 0 };
    return { z, raten: ratenBis(z, fortlaufend ? m : monatVerschoben(m, -1)), weg: entnommen(z, entnahmen, naechster) };
  };

  const start = monatVon(erster) > vonMonat ? monatVon(erster) : vonMonat;
  const raus: Budgetmonat[] = [];
  let vorher = amEnde(monatVerschoben(start, -1));
  let letzteZufuehrung: Cent | undefined;
  for (let m = start; m <= bisMonat; m = monatVerschoben(m, 1)) {
    const jetzt = amEnde(m);
    const weiter = !!jetzt.z && vorher.z === jetzt.z;
    const uebertrag = weiter ? vorher.raten - vorher.weg : 0;
    const zufuehrung = weiter ? jetzt.raten - vorher.raten : jetzt.raten;
    const verbraucht = weiter ? jetzt.weg - vorher.weg : jetzt.weg;
    const verfuegbar = uebertrag + zufuehrung;
    raus.push({
      monat: m,
      // Im Monat, in dem der Zyklus beginnt, zählt erst ab seinem Beginn — dasselbe
      // Fenster, über das `verbraucht` hier zählt.
      von: jetzt.z?.beginn && monatVon(jetzt.z.beginn) === m ? jetzt.z.beginn : ersterTag(m),
      bis: ersterTag(monatVerschoben(m, 1)),
      uebertrag,
      zufuehrung,
      verfuegbar,
      verbraucht,
      rest: verfuegbar - verbraucht,
      ...(weiter && letzteZufuehrung != null && letzteZufuehrung !== zufuehrung ? { zufuehrungVorher: letzteZufuehrung } : {}),
    });
    letzteZufuehrung = zufuehrung;
    vorher = jetzt;
  }
  return raus;
}

export interface Abschluss {
  /** Was festzuhalten ist — ohne ID, die vergibt der Aufrufer (der Kern würfelt nicht). */
  readonly abschluss: Omit<Ruecklagenzyklus, "id" | "bezeichnung" | "kategorieId" | "istbuchungId">;
  /** Die Rücklage danach: neu begonnen oder beendet. */
  readonly ruecklage: Ruecklage;
  readonly raten: Cent;
  readonly entnahmen: Cent;
  /** Was übrig war, über null. */
  readonly rest: Cent;
  /**
   * Was auf dem Konto frei wird — derselbe Betrag wie `rest`, mit anderer Frage: der
   * Anspruch der Rücklage fällt um ihn. NUR zur Anzeige; die Ergebnisrechnung bekommt
   * dafür keinen Posten (Teil B, Abschnitt 1: ein Rest verbessert keinen Monat).
   */
  readonly frei: Cent;
  /** Was mehr gebraucht wurde, als da war. Hat seinen Monat schon gekostet. */
  readonly ungedeckt: Cent;
}

/**
 * Schliesst den laufenden Zyklus am Tag `am` ab.
 *
 * Gerechnet wird der Stand am Abschlusstag nach der Regel der abschliessenden Rücklage:
 * Raten bis zum Vormonat (die des Abschlussmonats gehört dem neuen Zyklus), Entnahmen bis
 * einschliesslich `am`. Was übrig ist, wird frei; ein Minus hat seinen Monat schon
 * gekostet, und beim Abschliessen passiert damit nichts weiter.
 *
 * `folge` entscheidet der Nutzer: `neu` beginnt am Abschlusstag von vorn (mit Ziel auf
 * Wunsch mit neuem Ziel), `ende` beendet die Rücklage. Ob eine `fortlaufend`e überhaupt
 * abgeschlossen werden darf, entscheidet der Use-Case, nicht diese Rechnung.
 *
 * Die festgehaltene Rate (`zyklusRate`) steht nur da, solange die Reihe leer ist: mit
 * einer Reihe kommt die Rate eines abgeschlossenen Zyklus von dort (`zyklen`).
 *
 * Beispiel, frei 100 je Monat ab Januar, Entnahmen 450, abgeschlossen am 20.07.: Raten
 * Januar bis Juni 600, Rest 150 — frei. Mit Entnahmen 950 am 20.08.: Raten 700,
 * ungedeckt 250.
 */
export function abschliessen(
  r: Ruecklage,
  abschluesse: readonly Ruecklagenzyklus[],
  entnahmen: readonly Ruecklagenentnahme[],
  am: string,
  folge: "neu" | "ende",
  neuesZiel?: Cent,
): Abschluss {
  const laufend = zyklen(r, abschluesse).find((z) => !z.ende);
  const raten = laufend ? ratenBis(laufend, monatVerschoben(monatVon(am), -1)) : 0;
  const weg = laufend ? entnommen(laufend, entnahmen, tagDanach(am)) : 0;
  const stand = raten - weg;
  const mitReihe = (r.raten?.length ?? 0) > 0;
  return {
    abschluss: {
      ruecklageId: r.id,
      datum: am,
      zyklusBeginn: r.beginn,
      zyklusZiel: r.ziel,
      zyklusFrist: r.fristMonate,
      zyklusRate: mitReihe ? undefined : r.rate,
    },
    ruecklage: folge === "neu" ? { ...r, beginn: am, ziel: neuesZiel ?? r.ziel } : { ...r, beendetAm: am },
    raten,
    entnahmen: weg,
    rest: Math.max(0, stand),
    frei: Math.max(0, stand),
    ungedeckt: Math.max(0, -stand),
  };
}
