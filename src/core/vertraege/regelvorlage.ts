// Was eine erkannte Zahlungsreihe über ihre REGEL sagt.
//
// Die Vorschlagserkennung (`vertragErkennung`) misst an einer Gruppe von Zahlungen weit
// mehr, als am Ende in der Erkennungsregel landet: die Termine, die tatsächlich
// vorgekommenen Beträge, den Takt. Beim Anlegen eines Vertrags fiel das bis hierher
// weg — `standardErkennung` bekam den Anbieternamen und den Median-Betrag und rechnete
// aus dem Median eine Spanne, als hätte nie jemand hingesehen. Wer die Lupe am Vorschlag
// geöffnet hatte, sah dort Angaben, die im entstehenden Vertrag nicht wieder auftauchten.
//
// Diese Datei ist die Übersetzung dazwischen: aus BEOBACHTUNGEN werden die Felder einer
// Regel. Sie steht getrennt von `vertragZuordnung`, weil die Richtung eine andere ist —
// dort wird eine Regel auf eine Zahlung angewandt, hier wird aus Zahlungen eine Regel.
//
// **Was hier NICHT entsteht, ist ein Merkmal.** Takt und Regelmäßigkeit sind Aussagen
// über die REIHE, nicht über die einzelne Zahlung; `passtZu` prüft aber genau eine.
// Was sich übersetzen lässt, ist der TERMIN: aus „diese Reihe wird immer zum Monatsanfang
// fällig" wird ein Fälligkeitsfenster, und das ist an jeder einzelnen Zahlung prüfbar.

import type { Cent } from "../basis/geld";
import type { Rhythmus } from "../basis/zahlungsregel";

/**
 * Die Felder einer `Vertragserkennung`, die sich aus Beobachtungen ergeben.
 *
 * Bewusst eine Teilmenge und kein eigener Begriff: was hier steht, wird in
 * `standardErkennung` eins zu eins in die Regel übernommen. Ein Feld fehlt, wenn die
 * Beobachtung dazu nichts hergibt — nicht, wenn sie „egal" bedeutet.
 */
export interface Regelvorlage {
  readonly betragVon?: Cent;
  readonly betragBis?: Cent;
  readonly monatVon?: number;
  readonly monatBis?: number;
  readonly tagVon?: number;
  readonly tagBis?: number;
}

/**
 * Luft nach oben auf den größten beobachteten Betrag.
 *
 * Dieselbe Zahl wie in `spannenVorschlag`, und aus demselben Grund: Preise steigen und
 * fallen selten, eine Spanne, die exakt am höchsten bisherigen Wert endet, lässt die
 * nächste Erhöhung durchfallen. Nach unten braucht es die Luft nicht — der kleinste
 * beobachtete Wert IST der kleinste.
 */
export const SPANNEN_AUFSCHLAG = 1.15;

/**
 * Wie viele Tage das Tagesfenster über die beobachteten Tage hinaus reicht.
 *
 * Eine Abbuchung, die immer auf den 1. fällt, wandert an einem Wochenende auf den 3.,
 * mit Feiertag auf den 4. Ohne Puffer wäre ein aus drei Terminen abgeleitetes Fenster
 * enger als die Wirklichkeit — und die Zahlung, die es wegschneidet, fehlte STILL: der
 * Vertrag sähe aus, als hätte er ausgesetzt.
 */
export const TAGES_PUFFER = 4;

/**
 * Wie viele Monate das Monatsfenster über die beobachteten Monate hinaus reicht.
 *
 * Einer genügt: ein Jahresbeitrag wandert um Tage, nicht um Monate — aber er kann über
 * eine Monatsgrenze wandern, und bei drei Beobachtungen hat man das noch nicht gesehen.
 */
export const MONATS_PUFFER = 1;

/**
 * Ab welchem Anteil des Kreises ein Fenster nichts mehr einschränkt.
 *
 * Ein Tagesfenster über 20 von 31 Tagen trifft fast jede Zahlung; es stünde in der Maske,
 * sähe aus wie eine Einstellung und wäre keine. Was nichts einschränkt, wird deshalb gar
 * nicht erst angelegt — die Hälfte ist die Grenze, an der die Aussage kippt.
 */
export const MAX_FENSTERANTEIL = 0.5;

/** Tage im Monat, über die das Tagesfenster läuft. */
const TAGE_IM_KREIS = 31;
/** Monate im Jahr. */
const MONATE_IM_KREIS = 12;

/** Einen 1-basierten Wert in den Kreis zurückholen (0 → kreis, kreis+1 → 1). */
function umlauf(wert: number, kreis: number): number {
  return ((wert - 1) % kreis + kreis) % kreis + 1;
}

/** Breite eines Kreisintervalls, beide Grenzen einschließlich. */
function breite(von: number, bis: number, kreis: number): number {
  return ((bis - von + kreis) % kreis) + 1;
}

/**
 * Das ENGSTE Fenster, das alle Werte umfasst — auf einem Kreis, nicht auf einer Geraden.
 *
 * Der Unterschied ist der ganze Punkt. Ein Vertrag, der am Monatsletzten abbucht, trägt
 * Tage wie 28, 30, 31 und 1 — als Spanne von Kleinstem zu Größtem wäre das „1 bis 31",
 * also alles. Auf dem Kreis ist es „28 bis 1", ein Fenster von fünf Tagen. Gefunden wird
 * es über die größte LÜCKE: das Fenster beginnt dahinter und endet davor.
 *
 * `undefined`, wenn es leer ausginge oder wenn das Ergebnis samt Puffer mehr als die
 * Hälfte des Kreises umfasst — dann ist es keine Einschränkung mehr (siehe
 * `MAX_FENSTERANTEIL`).
 */
export function kreisfenster(
  werte: readonly number[],
  kreis: number,
  puffer: number,
): readonly [number, number] | undefined {
  const eindeutig = [...new Set(werte.filter((w) => Number.isInteger(w) && w >= 1 && w <= kreis))]
    .sort((a, b) => a - b);
  if (eindeutig.length === 0) return undefined;

  let von = eindeutig[0];
  let bis = eindeutig[eindeutig.length - 1];
  if (eindeutig.length > 1) {
    let groessteLuecke = -1;
    for (let i = 0; i < eindeutig.length; i++) {
      const naechster = eindeutig[(i + 1) % eindeutig.length];
      const luecke = ((naechster - eindeutig[i] + kreis) % kreis) || kreis;
      if (luecke > groessteLuecke) {
        groessteLuecke = luecke;
        von = naechster;
        bis = eindeutig[i];
      }
    }
  }

  const gepuffertVon = umlauf(von - puffer, kreis);
  const gepuffertBis = umlauf(bis + puffer, kreis);
  // Der Puffer kann den Kreis schließen — dann ist es kein Fenster mehr, sondern alles.
  if (breite(von, bis, kreis) + 2 * puffer >= kreis) return undefined;
  if (breite(gepuffertVon, gepuffertBis, kreis) > kreis * MAX_FENSTERANTEIL) return undefined;
  return [gepuffertVon, gepuffertBis];
}

/**
 * Das Fälligkeitsfenster aus den beobachteten Terminen.
 *
 * **Der Tag gilt für jeden Takt**, der Monat nur für den JÄHRLICHEN — und das ist keine
 * Vorsicht, sondern eine Formfrage. Das Fenster ist EIN zusammenhängender Zeitraum; die
 * vier Termine eines quartalsweisen Vertrags liegen aber über das Jahr verstreut, und das
 * engste Fenster, das sie alle fasst, umspannte zehn Monate. Es stünde da und schränkte
 * nichts ein. Bei einem Jahresbeitrag dagegen ist der Monat die schärfste Angabe, die es
 * gibt — und genau der Fall, für den das Fenster gebaut wurde.
 */
export function faelligkeitsfenster(
  termine: readonly string[],
  rhythmus: Rhythmus,
): Pick<Regelvorlage, "monatVon" | "monatBis" | "tagVon" | "tagBis"> {
  const tage = kreisfenster(
    termine.map((d) => Number(d.slice(8, 10))),
    TAGE_IM_KREIS,
    TAGES_PUFFER,
  );
  const monate =
    rhythmus === "jaehrlich"
      ? kreisfenster(termine.map((d) => Number(d.slice(5, 7))), MONATE_IM_KREIS, MONATS_PUFFER)
      : undefined;
  return {
    tagVon: tage?.[0],
    tagBis: tage?.[1],
    monatVon: monate?.[0],
    monatBis: monate?.[1],
  };
}

/**
 * Die roh beobachteten Betragsgrenzen — kleinster Wert unverändert, größter mit Luft.
 *
 * `undefined`, wenn nichts Brauchbares beobachtet wurde; dann gibt es zu weiten nichts.
 */
export function beobachteteSpanne(
  betraege: readonly Cent[],
): { von: Cent; bis: Cent } | undefined {
  const hoehen = betraege.map((b) => Math.abs(b)).filter((b) => b > 0);
  if (hoehen.length === 0) return undefined;
  return {
    von: Math.min(...hoehen),
    bis: Math.round(Math.max(...hoehen) * SPANNEN_AUFSCHLAG),
  };
}

/**
 * Eine abgeleitete Spanne um das WEITEN, was wirklich vorkam — und nur um das.
 *
 * Die Richtung ist eine Entscheidung und kein Rechenschritt. Die abgeleitete Spanne
 * (`standardErkennung`: 0,6× bis 1,8× vom Median) hat einen Zweck, der ohne die Messung
 * auskommt: fremde Zahlungen an denselben Empfänger draußen halten. Ihn preiszugeben,
 * weil eine Gruppe zufällig eng streute, wäre ein Rückschritt — und eine zu ENGE Spanne
 * ist der teurere der beiden Fehler: was sie wegschneidet, fehlt still, während eine zu
 * weite Spanne eine fremde Zahlung in die Trefferliste des Dialogs holt, wo man sie sieht.
 *
 * Was die Messung beiträgt, ist deshalb nur der Fall, in dem die Wirklichkeit WEITER war
 * als die Annahme: die Stromrechnung mit Nachzahlung, das Abo mit wechselndem Umfang. Die
 * fielen aus der abgeleiteten Spanne heraus, obwohl sie im Bestand sichtbar dazugehören.
 */
export function spanneWeiten(
  abgeleitet: { von?: Cent; bis?: Cent },
  beobachtet: { von?: Cent; bis?: Cent } | undefined,
): Pick<Regelvorlage, "betragVon" | "betragBis"> {
  const von = [abgeleitet.von, beobachtet?.von].filter((w): w is Cent => w !== undefined);
  const bis = [abgeleitet.bis, beobachtet?.bis].filter((w): w is Cent => w !== undefined);
  return {
    betragVon: von.length > 0 ? Math.min(...von) : undefined,
    betragBis: bis.length > 0 ? Math.max(...bis) : undefined,
  };
}

/**
 * Alles, was eine beobachtete Zahlungsreihe über ihre Regel sagt.
 *
 * Die Betragsspanne steht hier als das, was BEOBACHTET wurde — ohne die abgeleitete
 * Spanne, die es an dieser Stelle noch gar nicht gibt. Zusammengeführt wird in
 * `standardErkennung`, wo der Vertragsbetrag bekannt ist, über `spanneWeiten`.
 */
export function regelvorlageAus(
  termine: readonly string[],
  betraege: readonly Cent[],
  rhythmus: Rhythmus,
): Regelvorlage {
  const spanne = beobachteteSpanne(betraege);
  return {
    ...faelligkeitsfenster(termine, rhythmus),
    betragVon: spanne?.von,
    betragBis: spanne?.bis,
  };
}
