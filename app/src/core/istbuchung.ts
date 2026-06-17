// Ist-Buchung — die provisorische „Published Language" des Ist-Schritts (ADR-0002).
// Hält FAKTEN (was tatsächlich geflossen ist), getrennt von der Plan-/Szenario-Schicht.
// Bewusst NICHT das volle A5-Buchungsformat: minimal, vorläufig, später per ACL auf
// das echte Buchungspackage gemappt. Betrag vorzeichenbehaftet (negativ = Abfluss).

import type { Cent } from "./geld";
import type { Charakter } from "./zahlungsregel";
import type { Zahlungskonto } from "./konto";

/**
 * Herkunft einer Ist-Buchung:
 *  • „bezahlt-markiert" — aus einem Plan-Posten 1:1 bestätigt (trägt planRef).
 *  • „manuell"         — frei erfasst. Bei Bar die Dauerquelle (kein Import möglich);
 *                        bei Bankkonten vorläufig, bis der Import sie abgleicht (ADR-0002).
 *  • „import"          — aus einem Bankimport (später).
 */
export type IstQuelle = "bezahlt-markiert" | "manuell" | "import";

/**
 * Verweis auf den geplanten Posten, aus dem die Ist-Buchung entstand (1:1-Matching).
 * `quelleId` = Zahlungsregel-ID, `faelligkeit` = die projizierte Fälligkeit (ISO).
 */
export interface PlanRef {
  readonly quelleId: string;
  readonly faelligkeit: string; // ISO
}

export interface IstBuchung {
  readonly id: string;
  /** Tatsächliches Buchungsdatum (ISO). */
  readonly datum: string;
  /** Betrag in Cent, vorzeichenbehaftet (negativ = Abfluss). */
  readonly betrag: Cent;
  /** Konto, über das tatsächlich geflossen ist. */
  readonly kontoId: string;
  readonly kategorieId?: string;
  readonly charakter: Charakter;
  readonly quelle: IstQuelle;
  /** Freitext-Beschreibung (v. a. bei manuellen Buchungen). */
  readonly notiz?: string;
  /** Verknüpft die beiden Beine einer Umbuchung (− auf Quelle, + auf Ziel). */
  readonly transferId?: string;
  /** Das andere Konto bei einer Umbuchung (zur Anzeige der Richtung). */
  readonly gegenkontoId?: string;
  /** Gesetzt bei „bezahlt-markiert"; ermöglicht 1:1-Abgleich mit dem Plan. */
  readonly planRef?: PlanRef;
  /** Roh-Hash der Importzeile (Dedup gegen Bankimport, später). */
  readonly rohHash?: string;
}

/** Stabiler Schlüssel eines Plan-Postens (Quelle + Fälligkeit) für 1:1-Matching. */
export function planRefKey(quelleId: string, faelligkeit: string): string {
  return `${quelleId}@${faelligkeit}`;
}

/** Menge aller bereits per Ist belegten Plan-Posten (als Schlüssel). */
export function bezahlteSchluessel(buchungen: IstBuchung[]): Set<string> {
  const s = new Set<string>();
  for (const b of buchungen) {
    if (b.planRef) s.add(planRefKey(b.planRef.quelleId, b.planRef.faelligkeit));
  }
  return s;
}

/** Findet die Ist-Buchung zu einem Plan-Posten, falls vorhanden. */
export function findeIstZuPlan(
  buchungen: IstBuchung[],
  quelleId: string,
  faelligkeit: string,
): IstBuchung | undefined {
  return buchungen.find(
    (b) => b.planRef && b.planRef.quelleId === quelleId && b.planRef.faelligkeit === faelligkeit,
  );
}

/** Summe der Ist-Buchungen eines Kontos (vorzeichenbehaftet). */
export function istSummeKonto(buchungen: IstBuchung[], kontoId: string): Cent {
  return buchungen.reduce((s, b) => (b.kontoId === kontoId ? s + b.betrag : s), 0);
}

/**
 * Realer Kontostand (Reconciliation light, ADR-0002 §6): der manuell gepflegte
 * `saldo` ist der ANFANGSBESTAND; die seither bestätigten Ist-Buchungen bewegen ihn.
 * realerStand = Anfangsbestand + Σ Ist (Ist trägt das Vorzeichen, Abflüsse senken).
 */
export function realerKontostand(konto: Zahlungskonto, buchungen: IstBuchung[]): Cent {
  return konto.saldo + istSummeKonto(buchungen, konto.id);
}

/** Liquide Mittel real über alle Konten — Startpunkt der Projektion mit Ist. */
export function liquideMittelReal(konten: Zahlungskonto[], buchungen: IstBuchung[]): Cent {
  return konten.reduce((s, k) => s + realerKontostand(k, buchungen), 0);
}
