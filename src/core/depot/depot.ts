// Das Depot — Beobachtungen statt Buchungen.
//
// Ein Depot ist ausdrücklich KEIN Zahlungskonto, und deshalb liegt es hier und nicht in
// `konten/`. Ein Zahlungskonto hat einen Anfangsbestand und Buchungen, aus denen sich sein
// Stand ergibt; ändert sich der Stand, ist etwas geflossen. Ein Depot hat nichts davon: es
// hat einen Wert, der sich täglich ändert, ohne dass irgendetwas passiert wäre. Aus einem
// Depotwert lässt sich deshalb weder eine Zahlung ableiten noch ein Budget belasten — und
// er gehört aus demselben Grund nicht in die liquiden Mittel.
//
// Was ein Depot stattdessen hat, sind Stichtage. Jeder Abruf ist eine Beobachtung, und die
// Reihe dieser Beobachtungen ist die einzige Geschichte, die es gibt.

import { majorZuMinor, type Cent } from "../basis/geld";
import type { Waehrung } from "../basis/waehrung";

/** Ein Depot bei einer Bank. Es hat keinen Saldo, nur Stichtage. */
export interface Depot {
  readonly id: string;
  /** Der Bankzugang, über den es abgerufen wird. */
  readonly zugangId: string;
  /** `kontonummer|unterkontomerkmal` — derselbe Schlüssel wie bei der Kontozuordnung. */
  readonly schluessel: string;
  readonly bezeichnung: string;
  readonly waehrung?: string;
}

/** Der Gesamtwert eines Depots zu einem Stichtag — eine Beobachtung. */
export interface Depotwert {
  readonly depotId: string;
  readonly stichtag: string;
  readonly gesamtwert: Cent;
}

/**
 * Eine Position zu einem Stichtag.
 *
 * `stueck`, `kurs` und `einstandKurs` sind bewusst KEIN Geld (siehe `einstandswert`):
 * das eine ist eine Menge, die anderen sind Notierungen. Gerechnet wird mit `wert`.
 */
export interface Depotposition {
  readonly depotId: string;
  readonly stichtag: string;
  /**
   * Was diese Position innerhalb eines Stichtags identifiziert: ISIN, sonst WKN, sonst
   * Name, sonst die laufende Nummer. Gebraucht, weil nicht jede Position eine ISIN trägt
   * und zwei namenlose Positionen sonst ununterscheidbar wären.
   */
  readonly kennung: string;
  readonly isin?: string;
  readonly wkn?: string;
  readonly name?: string;
  readonly stueck?: number;
  readonly kurs?: number;
  readonly wert?: Cent;
  readonly waehrung?: string;
  readonly einstandDatum?: string;
  readonly einstandKurs?: number;
}

/**
 * Die Kennung einer Position bilden — dieselbe Regel überall, damit ein zweiter Abruf
 * desselben Stichtags dieselbe Zeile trifft und nicht eine zweite anlegt.
 */
export function positionsKennung(
  p: { isin?: string; wkn?: string; name?: string },
  laufendeNummer: number,
): string {
  return p.isin?.trim() || p.wkn?.trim() || p.name?.trim() || `#${laufendeNummer}`;
}

/**
 * Was eine Position beim Kauf gekostet hat.
 *
 * Die einzige Stelle im Projekt, an der aus zwei Fließkommazahlen Geld wird — und deshalb
 * die einzige, an der sie steht. Die Bank liefert den Einstands-KURS und die Stückzahl,
 * nie den Einstands-WERT; wer das Ergebnis sehen will, muss multiplizieren.
 *
 * Gerundet wird über `majorZuMinor` wie jeder Bankbetrag, also kaufmännisch und
 * währungsbewusst. Das Ergebnis ist damit auf den Cent genau falsch statt beliebig falsch:
 * bei vier Nachkommastellen im Kurs und einem gebrochenen Fondsbestand kann die Rundung
 * um Cents danebenliegen. Das ist hinnehmbar, solange klar bleibt, dass diese Zahl
 * GERECHNET und nicht gemeldet ist — deshalb heisst sie nirgends „Kaufpreis".
 *
 * `undefined`, wenn eine der beiden Angaben fehlt. Ein fehlender Einstand ist der
 * Normalfall bei Papieren, die von einer anderen Bank übertragen wurden.
 */
export function einstandswert(position: Depotposition, waehrung: Waehrung): Cent | undefined {
  const { stueck, einstandKurs } = position;
  if (stueck == null || einstandKurs == null) return undefined;
  if (!Number.isFinite(stueck) || !Number.isFinite(einstandKurs)) return undefined;
  return majorZuMinor(stueck * einstandKurs, waehrung);
}

/** Was aus einer Position geworden ist. */
export interface Positionsergebnis {
  /** Gerechnet aus Stückzahl und Einstandskurs — siehe `einstandswert`. */
  readonly einstand?: Cent;
  readonly wert?: Cent;
  /** Wert minus Einstand. `undefined`, sobald eine der beiden Zahlen fehlt. */
  readonly veraenderung?: Cent;
  /** Veränderung im Verhältnis zum Einstand, als Faktor (0.12 = plus zwölf Prozent). */
  readonly anteil?: number;
}

export function positionsergebnis(position: Depotposition, waehrung: Waehrung): Positionsergebnis {
  const einstand = einstandswert(position, waehrung);
  const wert = position.wert;
  if (einstand == null || wert == null) return { einstand, wert };
  const veraenderung = wert - einstand;
  return {
    einstand,
    wert,
    veraenderung,
    // Ein Einstand von null ergäbe eine Division durch null — bei geschenkten oder
    // ausgebuchten Papieren kommt das vor.
    anteil: einstand === 0 ? undefined : veraenderung / einstand,
  };
}

/**
 * Der jüngste Wert einer Reihe.
 *
 * Über den Stichtag, nicht über die Reihenfolge in der Liste: die Werte kommen aus der
 * Datenbank und tragen ihre Ordnung im Datum, nicht in der Sortierung, die jemand
 * vergessen könnte.
 */
export function juengsterWert(werte: readonly Depotwert[]): Depotwert | undefined {
  return werte.reduce<Depotwert | undefined>(
    (bisher, w) => (bisher === undefined || w.stichtag > bisher.stichtag ? w : bisher),
    undefined,
  );
}

/**
 * Der letzte Wert, der nicht nach `stichtag` liegt.
 *
 * Für die Frage „wie stand es Ende des Monats": ein Depot wird nicht täglich abgerufen,
 * also gibt es zum gesuchten Tag meist keinen Eintrag. Genommen wird der letzte davor —
 * das ist die jüngste Aussage, die zu diesem Zeitpunkt galt.
 */
export function wertAm(werte: readonly Depotwert[], stichtag: string): Depotwert | undefined {
  return juengsterWert(werte.filter((w) => w.stichtag <= stichtag));
}

/** Die Veränderung des Gesamtwerts zwischen zwei Zeitpunkten. */
export interface Wertentwicklung {
  readonly von?: Depotwert;
  readonly bis?: Depotwert;
  readonly veraenderung?: Cent;
  readonly anteil?: number;
}

/**
 * Wie sich ein Depot über einen Zeitraum entwickelt hat.
 *
 * Das ist eine reine Wertbetrachtung und ausdrücklich keine Rendite: Zukäufe und
 * Entnahmen im Zeitraum stecken mit drin und sind aus den Beständen allein nicht
 * herauszurechnen. Wer eine Rendite will, braucht die Bewegungen des Verrechnungskontos
 * — eine andere Frage, mit einer anderen Datenquelle.
 */
export function wertentwicklung(
  werte: readonly Depotwert[],
  vonIso: string,
  bisIso: string,
): Wertentwicklung {
  const von = wertAm(werte, vonIso);
  const bis = wertAm(werte, bisIso);
  if (!von || !bis) return { von, bis };
  const veraenderung = bis.gesamtwert - von.gesamtwert;
  return {
    von,
    bis,
    veraenderung,
    anteil: von.gesamtwert === 0 ? undefined : veraenderung / von.gesamtwert,
  };
}
