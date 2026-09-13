// Ein Konto wegbekommen — die beiden Wege und was sie unterscheidet.
//
// **Der Anlass.** Ein Konto, in das je importiert wurde, war über die Oberfläche nie wieder
// löschbar. Drei Fremdschlüssel auf `zahlungskonto` stehen auf NO ACTION, und einer davon
// ist der, an den niemand denkt: `umsatz_verarbeitung.zahlungskonto_id` hängt an JEDER
// importierten Zahlung — auch an den verbuchten und den verworfenen. Die Buchungen zu
// löschen befreit das Konto nicht (der Verweis darauf steht auf SET NULL), und einen Weg,
// eine Importzeile zu löschen, gab es im ganzen Programm nicht. Was ankam, war
// „FOREIGN KEY constraint failed".
//
// **Zwei Wege, und der harmlose ist der vorgegebene.** Wer ein Konto nicht mehr führt, legt
// es STILL: es behält alle seine Buchungen und verschwindet nur aus der Gegenwart. Das ist
// in fast allen Fällen das Gemeinte. Der zweite Weg nimmt wirklich alles mit und steht
// deshalb nur an einem stillgelegten Konto — nicht als Vorsichtsmaßnahme, sondern damit
// niemand ihn wählt, weil er der einzige sichtbare war.
//
// **Und hier verschwindet erstmals ein Beleg auf Wunsch.** `umsatz_roh` ist seit dem
// 06.09.2026 ausnahmslos unveränderlich; das bleibt es — dies ist ein LÖSCHEN, kein
// Ändern. Trotzdem ist es die Stelle, an der die Unveränderbarkeit ihre Grenze hat, und
// sie gehört benannt statt beiläufig überschritten. Was bleibt, ist das `buchung_journal`:
// es trägt keinen Fremdschlüssel auf `ist_buchung` und überlebt die Löschung, also steht
// dort hinterher noch, was die Buchungen enthielten.

import { FachlicherFehler, istAktiv } from "../../core";
import type { ZahlungskontoRepository } from "../ports";

/**
 * Was an einem Konto hängt — GEZÄHLT, nicht geraten.
 *
 * Die Trennung in den beiden Hälften ist der Punkt dieser Form: die ersten drei SPERREN das
 * Löschen (an ihnen scheitert der Fremdschlüssel), die übrigen verlieren nur einen Verweis.
 * Beides in einen Topf zu werfen liesse die Rückfrage behaupten, ein Budget hindere das
 * Löschen — und wer es dann wegräumt, hat umsonst gearbeitet.
 */
export interface Kontoloeschung {
  // ── Sperren ────────────────────────────────────────────────────────────────────────
  /** Buchungen auf diesem Konto. */
  readonly buchungen: number;
  /** Zahlungen mit Beleg, die diesem Konto zugeordnet sind — Inbox und Verworfenes mit. */
  readonly belege: number;
  /** Eine Zuordnung zu einem Bankkonto. */
  readonly bankverbindung: boolean;

  // ── Folgen ─────────────────────────────────────────────────────────────────────────
  /**
   * Umbuchungs-Beine auf ANDEREN Konten, deren Partner hier liegt.
   *
   * Sie bleiben, ihre Paarung wird gelöst. Das Gegenbein mitzulöschen wäre der andere
   * denkbare Weg und ist der falsche: es liegt auf einem Konto, das jemand weiterführt,
   * und eine Zahlung dort ist eine Tatsache, die mit diesem Konto nichts zu tun hat.
   */
  readonly umbuchungspaare: number;
  /** Budgets, die auf dieses Konto eingeschränkt sind — sie gelten danach für alle. */
  readonly budgets: number;
  /** Rücklagen, deren Deckung auf diesem Konto liegt. */
  readonly ruecklagen: number;
  /** Zahlungsregeln mit diesem Konto als Konto oder als Gegenkonto. */
  readonly regeln: number;
  /** Erkennungsregeln von Verträgen, die auf dieses Konto eingeschränkt sind. */
  readonly erkennungsregeln: number;
}

/**
 * Lässt der Fremdschlüssel das Konto gehen?
 *
 * Eine Auskunft über EINE Zählung, keine Auswahl — deshalb darf sie die Oberfläche direkt
 * benutzen. Sie ersetzt dort die bisherige Vermutung „ein Konto mit Buchungen lässt sich
 * nicht löschen", die in zwei Richtungen falsch war: gesperrt wird auch ohne eine einzige
 * Buchung, und was ohne sie mitgeht, ist mehr als „nur das Konto selbst".
 */
export function istLoeschbar(l: Kontoloeschung): boolean {
  return l.buchungen === 0 && l.belege === 0 && !l.bankverbindung;
}

/**
 * Der Port auf das Löschen. Eigener Port, weil die Operation über sechs Tabellen geht und
 * an KEINES der bestehenden Repositories gehört — sie ist keine Konto-, Ledger- oder
 * Umsatzsache, sondern genau die Naht zwischen ihnen.
 */
export interface KontoentfernenPort {
  /** Zählt, was an dem Konto hängt. */
  zaehlen(kontoId: string): Promise<Kontoloeschung>;
  /**
   * Löscht das Konto samt Buchungen, Belegen und Bankverbindung — in EINER Transaktion.
   *
   * Schreibt für jede gelöschte Buchung einen Journaleintrag und löst die Paarung der
   * Gegenbeine auf überlebenden Konten. Bricht etwas ab, ist nichts davon geschehen.
   */
  vollstaendig(kontoId: string): Promise<void>;
}

export interface KontoentfernenDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly port: KontoentfernenPort;
}

/** Was an dem Konto hängt — für die Rückfrage und für die Meldung, wenn es nicht geht. */
export function kontoloeschungPruefen(
  port: KontoentfernenPort,
  kontoId: string,
): Promise<Kontoloeschung> {
  return port.zaehlen(kontoId);
}

/**
 * Löscht ein Konto mit allem, was daran hängt.
 *
 * **Nur ein STILLGELEGTES Konto**, und diese Bedingung ist der Kern des Entwurfs, keine
 * Schikane: sie macht das Stilllegen zur vorgegebenen Antwort und das Zerstörende zu einer
 * zweiten, eigenen Handlung. Ohne sie stünden beide Wege gleichberechtigt am selben
 * Mülleimer, und der kürzere gewinnt — auch dann, wenn der andere gemeint war.
 *
 * Durchgesetzt wird sie hier und nicht im Schema: SQLite könnte „löschbar nur wenn
 * aktiv = 0" nur mit einem Trigger ausdrücken, und ein Trigger, der ein DELETE verweigert,
 * meldet es als Datenbankfehler — genau die Sorte Meldung, gegen die dieser ganze Weg
 * gebaut ist.
 */
export async function kontoVollstaendigLoeschen(
  deps: KontoentfernenDeps,
  kontoId: string,
): Promise<void> {
  const konto = (await deps.kontoRepo.alle()).find((k) => k.id === kontoId);
  if (!konto) throw new FachlicherFehler("konto.fehlt");
  if (istAktiv(konto)) throw new FachlicherFehler("konto.nichtStillgelegt");
  await deps.port.vollstaendig(kontoId);
}
