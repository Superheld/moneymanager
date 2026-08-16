// Vertragszuordnung — welche gebuchte Zahlung zu welchem Vertrag gehört.
//
// Bis hierher gab es diese Verbindung NICHT. Wer wissen wollte, ob eine Buchung zu einem
// Vertrag gehört, leitete es jedes Mal neu aus dem Empfängernamen ab
// (`vertragZuGegenpartei`). Das reicht, um eine Pille an die Buchung zu hängen, und es
// reicht für nichts, was rechnet: zwei Verträge beim selben Anbieter sind nicht
// unterscheidbar, „Amazon Prime" und eine Amazon-Bestellung sehen gleich aus, und eine
// Korrektur von Hand hat nirgends Platz.
//
// Deshalb zwei getrennte Dinge:
//
//   • **Erkennung** (`Vertragserkennung`) — die REGEL eines Vertrags: woran seine
//     Zahlungen zu erkennen sind. Gehört zum Vertrag wie die Zahlungsregel, liegt aber
//     wie diese in einem eigenen Kontext: der Vertrag beschreibt Konditionen, die
//     Erkennung beschreibt Zuordnungspolitik. Sie ist einsehbar und änderbar — Beträge
//     steigen, ein Anbietername ändert sich, ein Zeitraum grenzt einen Vorgänger ab.
//
//   • **Zuordnung** (`Vertragszuordnung`) — das ERGEBNIS je Buchung, mit Herkunft.
//     `automatisch` schreibt der Abgleich und darf er jederzeit überschreiben;
//     `manuell` schreibt der Mensch und rührt der Abgleich nie an. Das ist die ganze
//     Reversibilität: eine manuelle Zuordnung löschen heißt „entscheide du wieder".
//
// Reine Funktionen, kein IO. Was daraus gespeichert wird, entscheidet die
// Anwendungsschicht (`application/vertragszuordnung`).

import { anbieterSchluessel, type Zahlungsspur } from "./vertragErkennung";
import type { Cent } from "./geld";

/**
 * Woran die Zahlungen EINES Vertrags zu erkennen sind.
 *
 * Alle Felder außer `schluessel` sind Einschränkungen: nicht gesetzt heißt „egal".
 * Der Schlüssel allein ist bewusst NICHT genug — deshalb belegt `standardErkennung`
 * eine Betragsspanne vor. Ohne sie zöge ein Vertrag „Amazon Prime" jede Amazon-Bestellung
 * mit sich, und der Fehler fiele erst auf, wenn ein Budget nicht mehr stimmt.
 */
export interface Vertragserkennung {
  readonly vertragId: string;
  /**
   * Gläubiger-IDs und/oder normalisierte Anbieternamen (`anbieterSchluessel`).
   * ODER-verknüpft: ein Treffer genügt. Mehrere, weil ein Anbieter über die Zeit
   * verschiedene Namen im Auszug trägt und die Gläubiger-ID nur bei Lastschrift dabei ist.
   */
  readonly schluessel: readonly string[];
  /** Betragshöhe (positiv, ohne Vorzeichen), Untergrenze einschließlich. */
  readonly betragVon?: Cent;
  /** Betragshöhe (positiv, ohne Vorzeichen), Obergrenze einschließlich. */
  readonly betragBis?: Cent;
  /** Nur Buchungen ab diesem Tag (ISO, einschließlich). */
  readonly gueltigAb?: string;
  /** Nur Buchungen bis zu diesem Tag (ISO, einschließlich). */
  readonly gueltigBis?: string;
  /** Nur Buchungen über dieses Zahlungskonto. */
  readonly kontoId?: string;
}

/** Wer die Zuordnung gesetzt hat — und damit, wer sie ändern darf. */
export type Zuordnungsherkunft = "automatisch" | "manuell";

/**
 * Was für EINE Buchung gilt. `vertragId === null` ist kein fehlender Wert, sondern eine
 * Aussage: „diese Buchung gehört ausdrücklich zu keinem Vertrag". Nur so lässt sich ein
 * Fehlgriff der Automatik dauerhaft korrigieren — ohne die Aussage käme er beim nächsten
 * Abgleich zurück.
 */
export interface Vertragszuordnung {
  readonly istbuchungId: string;
  readonly vertragId: string | null;
  readonly herkunft: Zuordnungsherkunft;
}

/**
 * Die Standardregel zu einem frisch erfassten Vertrag: Anbietername (normalisiert) und —
 * falls bekannt — die Gläubiger-ID als Schlüssel, dazu eine großzügige Betragsspanne um
 * den Vertragsbetrag.
 *
 * Die Spanne ist absichtlich weit und unsymmetrisch: nach oben mehr Luft als nach unten,
 * weil Preise steigen und selten fallen. Sie soll nicht die Zahlungen dieses Vertrags
 * aussortieren, sondern FREMDE Zahlungen an denselben Empfänger draußen halten.
 * `betrag` ist die Betragshöhe (positiv); 0 oder negativ ⇒ keine Spanne.
 */
export function standardErkennung(
  vertragId: string,
  anbieter: string,
  betrag: Cent,
  glaeubigerId?: string,
): Vertragserkennung {
  const schluessel = new Set<string>();
  const name = anbieterSchluessel(anbieter.trim());
  if (name) schluessel.add(name);
  const id = glaeubigerId?.trim();
  if (id) schluessel.add(id);
  const hoehe = Math.abs(betrag);
  return {
    vertragId,
    schluessel: [...schluessel],
    betragVon: hoehe > 0 ? Math.round(hoehe * 0.6) : undefined,
    betragBis: hoehe > 0 ? Math.round(hoehe * 1.8) : undefined,
  };
}

/** Trifft die Erkennungsregel auf diese Zahlung zu? */
export function passtZu(e: Vertragserkennung, s: Zahlungsspur): boolean {
  // Eine Umschichtung ist nie eine Vertragszahlung — sie wechselt nur das eigene Konto.
  if (s.charakter === "Umschichtung") return false;

  const id = s.glaeubigerId?.trim();
  const name = anbieterSchluessel(s.gegenpartei.trim());
  const trifft = e.schluessel.some((k) => (id && k === id) || (name && k === name));
  if (!trifft) return false;

  const hoehe = Math.abs(s.betrag);
  if (e.betragVon !== undefined && hoehe < e.betragVon) return false;
  if (e.betragBis !== undefined && hoehe > e.betragBis) return false;
  // String-Vergleich reicht: ISO-Daten sind in dieser Form sortierbar (siehe core/datum).
  if (e.gueltigAb && s.datum < e.gueltigAb) return false;
  if (e.gueltigBis && s.datum > e.gueltigBis) return false;
  if (e.kontoId && s.kontoId !== e.kontoId) return false;
  return true;
}

/**
 * Welcher Vertrag gewinnt, wenn mehrere Regeln auf dieselbe Zahlung passen?
 *
 * Der Fall ist real: zwei Handyverträge beim selben Anbieter, oder eine noch weite
 * Standardspanne neben einer von Hand verengten. Die Reihenfolge ist bewusst
 * DETERMINISTISCH und nicht „irgendeiner", damit ein Abgleich zweimal dasselbe Ergebnis
 * liefert und nicht bei jedem Lauf Zuordnungen umspringen:
 *
 *   1. Treffer über die Gläubiger-ID schlägt Treffer über den Namen — die ID
 *      identifiziert den Einzieher, der Name ist eine Normalisierung mit Unschärfe.
 *   2. Danach die engere Betragsspanne — wer sich festgelegt hat, meint es genauer.
 *   3. Zuletzt die Vertrags-Id, rein damit das Ergebnis stabil ist.
 */
function besser(a: Vertragserkennung, b: Vertragserkennung, s: Zahlungsspur): boolean {
  const id = s.glaeubigerId?.trim();
  const ueberId = (e: Vertragserkennung) => !!id && e.schluessel.includes(id);
  if (ueberId(a) !== ueberId(b)) return ueberId(a);

  const breite = (e: Vertragserkennung) =>
    e.betragVon !== undefined && e.betragBis !== undefined ? e.betragBis - e.betragVon : Infinity;
  if (breite(a) !== breite(b)) return breite(a) < breite(b);

  return a.vertragId < b.vertragId;
}

/** Der Vertrag, dem diese Zahlung nach den Regeln gehört — oder null. */
export function vertragFuer(
  erkennungen: readonly Vertragserkennung[],
  s: Zahlungsspur,
): string | null {
  let gewinner: Vertragserkennung | undefined;
  for (const e of erkennungen) {
    if (!passtZu(e, s)) continue;
    if (!gewinner || besser(e, gewinner, s)) gewinner = e;
  }
  return gewinner?.vertragId ?? null;
}

/** Was ein Abgleich an der gespeicherten Zuordnung ändern will. */
export interface Zuordnungsabgleich {
  /** Zuordnungen, die neu geschrieben oder überschrieben werden. */
  readonly setzen: readonly Vertragszuordnung[];
  /** Buchungen, deren automatische Zuordnung wegfällt (Regel trifft nicht mehr). */
  readonly entfernen: readonly string[];
}

/**
 * Rechnet die automatischen Zuordnungen neu und vergleicht sie mit dem Bestand.
 *
 * Zwei Zusagen, an denen die Reversibilität hängt:
 *
 *   • **Manuelles bleibt.** Jede Buchung mit einer Zuordnung der Herkunft `manuell` wird
 *     übersprungen — auch die mit `vertragId: null` („gehört zu keinem Vertrag").
 *   • **Nur Deltas.** Was sich nicht ändert, steht nicht im Ergebnis. Ein Abgleich über
 *     5000 Buchungen soll nicht 5000 Schreibvorgänge auslösen, und ein zweiter Lauf
 *     direkt danach muss leer ausgehen — sonst ist er nicht idempotent.
 */
export function zuordnungAbgleich(
  erkennungen: readonly Vertragserkennung[],
  spuren: readonly Zahlungsspur[],
  bestand: readonly Vertragszuordnung[],
): Zuordnungsabgleich {
  const bisher = new Map(bestand.map((z) => [z.istbuchungId, z]));
  const setzen: Vertragszuordnung[] = [];
  const entfernen: string[] = [];

  for (const s of spuren) {
    const alt = bisher.get(s.id);
    if (alt?.herkunft === "manuell") continue;

    const vertragId = vertragFuer(erkennungen, s);
    if (vertragId === null) {
      if (alt) entfernen.push(s.id);
      continue;
    }
    if (alt?.vertragId === vertragId) continue;
    setzen.push({ istbuchungId: s.id, vertragId, herkunft: "automatisch" });
  }

  return { setzen, entfernen };
}
