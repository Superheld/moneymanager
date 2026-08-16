// Ist-Buchung — die provisorische „Published Language" des Ist-Schritts (ADR-0002).
// Hält FAKTEN (was tatsächlich geflossen ist), getrennt von der Plan-Schicht.
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

/**
 * Verwendung — das explizit benannte Gegenkonto/Buchungsziel einer Ist-Buchung
 * jenseits der Kostenart (ADR-0003). Macht die Zuordnung eindeutig statt aus der
 * Kategorie geraten: derselbe Kategorienbaum kann Budget, Vertrag und Topf tragen,
 * erst das Gegenkonto trennt sie. Der Charakter folgt aus dem Gegenkonto-Typ.
 *
 * Aktuell nur `topf` (Passivkonto, Rücklage/Rückstellung): aus der Kostenart nicht
 * ableitbar, daher explizit. „Budget/Kostenart" bleibt implizit über `kategorieId`
 * × Periode; die Plan-Posten-Verknüpfung (Vertrag/Regel) läuft weiter über `planRef`.
 * Das n:m-/Teilbetrags-Zielbild (Zuordnung-Aggregat) kommt mit dem Bankimport.
 */
export type Verwendung = { readonly art: "topf"; readonly topfId: string };

/**
 * Ein Teil einer aufgeteilten Buchung (S-7): der Wocheneinkauf, der zu 40 € Lebensmittel
 * und 12 € Drogerie gehört.
 *
 * Value Object IM Aggregat IstBuchung, kein eigenes Aggregat: eine Aufteilung hat keine
 * Existenz ohne ihre Buchung, und die Invariante „Σ Teile = Betrag" ist genau die Art
 * Konsistenzregel, für die es Aggregatgrenzen gibt. Deshalb hängen die Teile an der
 * Buchung und werden mit ihr geladen — nicht als zweite Liste durch die Auswertungen
 * gereicht.
 *
 * Betrag vorzeichenbehaftet wie die Buchung selbst (Aufwand negativ).
 */
export interface Aufteilung {
  /** Pflicht — ein Teil ohne Kategorie hätte keinen Zweck; dafür bleibt die Buchung ungeteilt. */
  readonly kategorieId: string;
  readonly betrag: Cent;
  readonly notiz?: string;
}

/** Kategorie-Zuordnung mit Betrag — für Auswertungen die einzige Sicht, die zählt. */
export interface KategorieAnteil {
  readonly kategorieId?: string;
  readonly betrag: Cent;
}

/**
 * Wie eine Buchung auf Kategorien wirkt — EIN Anteil bei einer normalen Buchung, sonst
 * ihre Teile. Jede kategorie-basierte Auswertung (Budget, Historie) läuft hierüber statt
 * direkt über `b.kategorieId`; sonst zählt ein Split entweder gar nicht oder mit vollem
 * Betrag mehrfach.
 */
export function kategorieAnteile(b: IstBuchung): KategorieAnteil[] {
  return b.aufteilungen?.length ? [...b.aufteilungen] : [{ kategorieId: b.kategorieId, betrag: b.betrag }];
}

/** Summe der Teilbeträge — muss den Betrag der Buchung exakt treffen. */
export function aufteilungsSumme(teile: readonly Aufteilung[]): Cent {
  return teile.reduce((s, a) => s + a.betrag, 0);
}

/** Trägt die Buchung eine Aufteilung? */
export function istGeteilt(b: IstBuchung): boolean {
  return (b.aufteilungen?.length ?? 0) > 0;
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
  /** Explizit benanntes Gegenkonto/Buchungsziel (ADR-0003), z. B. eine Topf-Entnahme. */
  readonly verwendung?: Verwendung;
  /**
   * Aufteilung auf mehrere Kategorien (S-7). Gesetzt ⇒ `kategorieId` ist leer und die
   * Teile sind die Wahrheit; Σ Teile = `betrag`. Der Ledger-Betrag bleibt unberührt —
   * Saldo, Register und Netto-Null rechnen weiter mit der EINEN Zeile.
   */
  readonly aufteilungen?: readonly Aufteilung[];
  /** Roh-Hash der Importzeile (Dedup gegen Bankimport, später). */
  readonly rohHash?: string;
}

/** Alle Ist-Buchungen, die auf einen bestimmten Topf gebucht sind (Entnahmen). */
export function topfBuchungen(buchungen: IstBuchung[], topfId: string): IstBuchung[] {
  return buchungen.filter((b) => b.verwendung?.art === "topf" && b.verwendung.topfId === topfId);
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
