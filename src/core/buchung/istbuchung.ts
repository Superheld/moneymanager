// Ist-Buchung — hält FAKTEN (was tatsächlich geflossen ist), getrennt von der
// Plan-Schicht. Betrag vorzeichenbehaftet (negativ = Abfluss).
//
// **Zum Stand dieses Typs, weil der Kommentar hier lange etwas anderes sagte.** Er
// bezeichnete sich als „provisorische Published Language" (ADR-0002), die „später per
// ACL auf das echte Buchungspackage" gemappt wird — ein volles A5-Buchungsformat.
//
// Im Repo gibt es davon nichts: kein Buchungspackage, keinen ACL, keine Stelle, die
// darauf hinarbeitet. Die Begriffe kommen ausser hier nirgends vor. `IstBuchung` ist
// seit Monaten der einzige und gelebte Buchungstyp — alles, was mit Geldbewegungen
// rechnet, rechnet mit ihm.
//
// Das ist keine Entscheidung GEGEN das Format, sondern eine Feststellung: wer es baut,
// baut es von vorn, und dieser Typ ist dann sein Ausgangspunkt und nicht sein Platzhalter.
// Solange das nicht passiert, gilt er als das, was er ist. Der Unterschied ist praktisch
// — an einem Provisorium baut man anders als an einem Fundament, und was hier fehlt
// (Empfänger, Verwendungszweck: siehe `core/buchung/zahlungsspur`), fehlt einem
// Fundament zu Unrecht.

import type { Cent } from "../basis/geld";
import type { Charakter } from "../basis/zahlungsregel";
import { istLiquide, type Zahlungskonto } from "../konten/konto";

/**
 * Herkunft einer Ist-Buchung:
 *  • „manuell" — frei erfasst. Bei Bar die Dauerquelle (kein Import möglich);
 *                bei Bankkonten vorläufig, bis der Import sie abgleicht (ADR-0002).
 *  • „import"  — aus einem Bankimport.
 *
 * Ein dritter Wert `bezahlt-markiert` stand hier bis 2026-08-29, für eine Buchung, die
 * einen Plan-Posten per Häkchen bestätigt. Diesen Weg gab es in der Oberfläche nie: kein
 * Use-Case hat den Wert je geschrieben, und keine Buchung im Bestand trug ihn. Was von
 * ihm blieb, war eine Rangstufe im Monatsausblick, die nie griff, und ein Feld, das jede
 * Auswertung mitprüfen musste. Wer das Häkchen baut, baut beides zusammen — sonst
 * entsteht wieder ein Halbteil, das aussieht, als sei es angeschlossen.
 */
export type IstQuelle = "manuell" | "import";

/**
 * Wer die KATEGORIE dieser Buchung gesetzt hat — und damit, wer sie ändern darf.
 *
 * Nicht zu verwechseln mit `IstQuelle`: die sagt, woher die BUCHUNG stammt. Eine
 * importierte Buchung, deren Kategorie jemand von Hand korrigiert hat, ist
 * `quelle: "import"` UND `kategorieHerkunft: "manuell"` — beides zugleich, und genau
 * diese Kombination ist der Fall, für den das Feld existiert.
 *
 * Dieselbe Bauweise wie `Zuordnungsherkunft` bei Vertrag ↔ Buchung: `automatisch`
 * schreibt die Automatik und darf sie jederzeit überschreiben, `manuell` rührt sie nie
 * an. Ohne diese Unterscheidung könnte ein rückwirkender Lauf eine Handentscheidung
 * nicht von seinem eigenen früheren Treffer unterscheiden.
 *
 * **An einer Stelle sind die beiden aber NICHT dieselbe Bauweise, und das ist Absicht.**
 * Beim Vertrag trägt die Herkunft eine dritte Aussage: gesetzt bei leerer `vertrag_id`
 * heisst „gehört AUSDRÜCKLICH zu keinem Vertrag" — eine Handentscheidung, die bleiben
 * muss, sonst käme ein korrigierter Fehlgriff beim nächsten Abgleich zurück.
 *
 * Für die Kategorie gibt es diese dritte Aussage nicht, und sie fehlt nicht: „gehört zu
 * keiner Kategorie" ist keine Entscheidung, die jemand trifft, sondern der Zustand vor
 * jeder Entscheidung — die Zeile liegt dann in der Review-Inbox und wartet. Beim Vertrag
 * ist das anders, weil die meisten Zahlungen zu Recht zu keinem gehören: ohne die dritte
 * Aussage liesse sich „schon geprüft, gehört zu keinem" nicht von „noch nie angesehen"
 * unterscheiden, und die Automatik liefe ewig über dieselben Zeilen.
 *
 * Wer die beiden angleichen will, muss zuerst diese Frage beantworten — nicht die nach
 * dem Feld.
 */
export type Kategorieherkunft = "automatisch" | "manuell";

/**
 * Verweis auf einen geplanten Posten: `quelleId` = Zahlungsregel-ID, `faelligkeit` = die
 * projizierte Fälligkeit (ISO).
 *
 * Er identifiziert eine PROJIZIERTE Zeile (Kontoregister, kontoübergreifende Vorschau) —
 * nicht mehr eine Ist-Buchung, die einen Plan-Posten belegt. Siehe `IstQuelle`.
 */
export interface PlanRef {
  readonly quelleId: string;
  readonly faelligkeit: string; // ISO
}


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

/**
 * Ist die Kategoriezuordnung dieser Buchung eine Handentscheidung — also für jede
 * Automatik tabu?
 *
 * Zwei Fälle, und der zweite ist der Grund, warum das eine Funktion ist und kein
 * Feldvergleich:
 *
 *   1. `kategorieHerkunft === "manuell"` — jemand hat die Kategorie gesetzt oder
 *      korrigiert. Fehlendes Feld zählt als `automatisch`; so bleiben Bestandsdaten und
 *      neu gebaute Objekte ohne das Feld für die Automatik offen.
 *   2. Die Buchung ist AUFGETEILT. Ein Split entsteht nur von Hand, trägt mehrere
 *      Kategorien und hat gar kein Feld, in das ein Vorschlag passen würde. Was eine
 *      Automatik damit tun sollte, ist nicht definiert — also fasst sie ihn nicht an.
 *
 * Beides an einer Stelle, damit nicht jeder Aufrufer die zweite Hälfte vergisst.
 */
export function kategorieIstHandverlesen(b: IstBuchung): boolean {
  return b.kategorieHerkunft === "manuell" || istGeteilt(b);
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
  /**
   * Wer die Kategorie gesetzt hat. Fehlend zählt als `automatisch` — prüfen deshalb
   * immer über `kategorieIstHandverlesen`, nie direkt auf den Wert.
   */
  readonly kategorieHerkunft?: Kategorieherkunft;
  readonly charakter: Charakter;
  readonly quelle: IstQuelle;
  /** Freitext-Beschreibung (v. a. bei manuellen Buchungen). */
  readonly notiz?: string;
  /** Verknüpft die beiden Beine einer Umbuchung (− auf Quelle, + auf Ziel). */
  readonly transferId?: string;
  /** Das andere Konto bei einer Umbuchung (zur Anzeige der Richtung). */
  readonly gegenkontoId?: string;
  /**
   * Aufteilung auf mehrere Kategorien (S-7). Gesetzt ⇒ `kategorieId` ist leer und die
   * Teile sind die Wahrheit; Σ Teile = `betrag`. Der Ledger-Betrag bleibt unberührt —
   * Saldo, Register und Netto-Null rechnen weiter mit der EINEN Zeile.
   */
  readonly aufteilungen?: readonly Aufteilung[];
  /**
   * Roh-Hash der Importzeile — der quellenagnostische Dedup-Schlüssel.
   *
   * Er trägt die gesamte Dublettenerkennung (Datei wie Bankabruf) und ist ausserdem der
   * Weg zurück zum Beleg. Der Kommentar hier sagte bis 2026-08-29 „später"; das war seit
   * dem Bankabruf überholt und las sich wie eine unfertige Stelle.
   */
  readonly rohHash?: string;
  /**
   * „Das hier sollte ich mir ansehen."
   *
   * Anders als alles andere an dieser Buchung beschreibt der Marker keine TATSACHE über
   * die Zahlung, sondern eine Beziehung zwischen ihr und dem Nutzer: noch nicht
   * angeschaut. Deshalb setzt ihn niemand aus den Daten ab und niemand rechnet mit ihm —
   * er wird gesetzt und wieder weggenommen, und beides darf von Hand geschehen.
   *
   * Gesetzt wird er, wo eine Zeile UNGESEHEN im Saldo landet: beim Bankabruf, der direkt
   * bucht. Was durch die Import-Inbox lief, hat jemand einzeln übernommen und damit
   * angesehen.
   *
   * Fehlend zählt als „nicht vorgemerkt" — der Bestand vor der Einführung ist gesehen.
   */
  readonly zuPruefen?: boolean;
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

/**
 * Liquide Mittel real — Startpunkt der Projektion mit Ist.
 *
 * Wie `liquideMittel`, nur mit den Buchungen verrechnet: nicht verfügbare Konten bleiben
 * mit Saldo UND Bewegungen draußen. Beide Seiten zusammen, sonst entsteht ein Stand, den
 * es nie gab.
 */
export function liquideMittelReal(konten: Zahlungskonto[], buchungen: IstBuchung[]): Cent {
  return konten.filter(istLiquide).reduce((s, k) => s + realerKontostand(k, buchungen), 0);
}
