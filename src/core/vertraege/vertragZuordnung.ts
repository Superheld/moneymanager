// Vertragszuordnung — welche gebuchte Zahlung zu welchem Vertrag gehört.
//
// Bis hierher gab es diese Verbindung NICHT. Wer wissen wollte, ob eine Buchung zu einem
// Vertrag gehört, leitete es jedes Mal neu aus dem Empfängernamen ab
// (über `anbieterSchluessel`). Das reicht, um eine Pille an die Buchung zu hängen, und es
// reicht für nichts, was rechnet: zwei Verträge beim selben Anbieter sind nicht
// unterscheidbar, „Arnholt Plus" und eine Arnholt-Bestellung sehen gleich aus, und eine
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
import { musterTrifft } from "../basis/muster";
import type { Cent } from "../basis/geld";

/**
 * Woran EIN Merkmal ansetzt. Die beiden Arten sind nicht austauschbar und sollen es auch
 * nicht sein: die Gläubiger-ID identifiziert den Einzieher eindeutig, der Empfängername
 * ist Text mit Unschärfe. In einer gemeinsamen Liste war einem Eintrag nicht anzusehen,
 * als was er gemeint war — und die Vorrangregel bei mehreren Treffern hing damit an einer
 * Vermutung statt an einer Angabe.
 */
export type Merkmalsart = "glaeubigerId" | "empfaenger";

/**
 * Ein Erkennungsmerkmal: Art plus Muster.
 *
 * `muster` darf `*` enthalten — beliebig viel Text an dieser Stelle. Das ist der
 * Unterschied zwischen „ich muss den Namen exakt treffen" und „alles von diesem
 * Anbieter": Abbuchungen tragen Vertragsnummern, Rechnungsnummern und Ortsangaben im
 * Empfängerfeld, und ohne Platzhalter bräuchte jede Schreibweise eine eigene Zeile.
 */
export interface Erkennungsmerkmal {
  readonly art: Merkmalsart;
  readonly muster: string;
}

/**
 * Woran die Zahlungen EINES Vertrags zu erkennen sind.
 *
 * Alle Felder außer `merkmale` sind Einschränkungen: nicht gesetzt heißt „egal".
 * Die Merkmale allein sind bewusst NICHT genug — deshalb belegt `standardErkennung`
 * eine Betragsspanne vor. Ohne sie zöge ein Vertrag „Arnholt Plus" jede Arnholt-Bestellung
 * mit sich, und der Fehler fiele erst auf, wenn ein Budget nicht mehr stimmt.
 */
export interface Vertragserkennung {
  readonly vertragId: string;
  /**
   * ODER-verknüpft: ein Treffer genügt. Mehrere, weil ein Anbieter über die Zeit
   * verschiedene Namen im Auszug trägt und die Gläubiger-ID nur bei Lastschrift dabei ist.
   */
  readonly merkmale: readonly Erkennungsmerkmal[];
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
  const merkmale: Erkennungsmerkmal[] = [];
  const name = anbieterSchluessel(anbieter.trim());
  if (name) merkmale.push({ art: "empfaenger", muster: name });
  const id = glaeubigerId?.trim();
  if (id) merkmale.push({ art: "glaeubigerId", muster: id });
  const hoehe = Math.abs(betrag);
  return {
    vertragId,
    merkmale,
    betragVon: hoehe > 0 ? Math.round(hoehe * 0.6) : undefined,
    betragBis: hoehe > 0 ? Math.round(hoehe * 1.8) : undefined,
  };
}

/**
 * Trifft ein Merkmal auf diese Zahlung zu?
 *
 * Der Empfänger wird gegen ZWEI Formen geprüft: den Namen, wie er im Auszug steht, und
 * seine normalisierte Form (klein, ohne Rechtsform und Satzzeichen). Grund: beide Texte
 * begegnen einem an verschiedenen Stellen — im Kontoauszug steht „Vibora GmbH", in der
 * Vorschlagsbegründung „vibora". Wer eine der beiden Formen abtippt, soll einen Treffer
 * bekommen und nicht raten müssen, welche gemeint war.
 */
function merkmalTrifft(m: Erkennungsmerkmal, s: Zahlungsspur): boolean {
  const muster = m.muster.trim();
  if (!muster) return false;
  if (m.art === "glaeubigerId") return musterTrifft(muster, s.glaeubigerId?.trim() ?? "");
  const roh = s.gegenpartei.trim();
  return musterTrifft(muster, roh) || musterTrifft(muster, anbieterSchluessel(roh));
}

/** Trifft die Erkennungsregel auf diese Zahlung zu? */
export function passtZu(e: Vertragserkennung, s: Zahlungsspur): boolean {
  // Eine Umschichtung ist nie eine Vertragszahlung — sie wechselt nur das eigene Konto.
  if (s.charakter === "Umschichtung") return false;

  if (!e.merkmale.some((m) => merkmalTrifft(m, s))) return false;

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
 * Warum trifft die Regel so wenig — oder gar nichts?
 *
 * Der Fall aus der Praxis: jemand tippt `*ard*` als Empfänger-Muster, sieht null Treffer
 * und schliesst daraus, dass Platzhalter nicht funktionieren. Sie tun es; was zuschlägt,
 * ist die Betragsspanne, die `standardErkennung` beim Anlegen mitgibt (0,6× bis 1,8× vom
 * Vertragsbetrag). Die Vorschau zeigte nur das Endergebnis und verschwieg, welcher Filter
 * es weggenommen hat.
 *
 * Diese Funktion legt die Kette offen: wie viele Zahlungen jede Stufe noch übrig lässt.
 * Sie rechnet in DERSELBEN Reihenfolge wie `passtZu`, damit die Zahlen zusammenpassen.
 */
export interface Erkennungsdiagnose {
  /** Zahlungen, die überhaupt in Frage kommen (keine Umschichtungen). */
  readonly grundmenge: number;
  /** … davon von mindestens einem Merkmal getroffen. */
  readonly nachMerkmalen: number;
  /** … davon innerhalb der Betragsspanne. */
  readonly nachBetrag: number;
  /** … davon innerhalb des Zeitraums. */
  readonly nachZeitraum: number;
  /** … davon auf dem geforderten Konto. Das ist zugleich die Trefferzahl. */
  readonly nachKonto: number;
}

export function erkennungsDiagnose(
  e: Vertragserkennung,
  spuren: readonly Zahlungsspur[],
): Erkennungsdiagnose {
  const grund = spuren.filter((s) => s.charakter !== "Umschichtung");
  const nachMerkmalen = grund.filter((s) => e.merkmale.some((m) => merkmalTrifft(m, s)));
  const nachBetrag = nachMerkmalen.filter((s) => {
    const hoehe = Math.abs(s.betrag);
    if (e.betragVon !== undefined && hoehe < e.betragVon) return false;
    if (e.betragBis !== undefined && hoehe > e.betragBis) return false;
    return true;
  });
  const nachZeitraum = nachBetrag.filter((s) => {
    if (e.gueltigAb && s.datum < e.gueltigAb) return false;
    if (e.gueltigBis && s.datum > e.gueltigBis) return false;
    return true;
  });
  const nachKonto = nachZeitraum.filter((s) => !e.kontoId || s.kontoId === e.kontoId);
  return {
    grundmenge: grund.length,
    nachMerkmalen: nachMerkmalen.length,
    nachBetrag: nachBetrag.length,
    nachZeitraum: nachZeitraum.length,
    nachKonto: nachKonto.length,
  };
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
 *      identifiziert den Einzieher, der Name ist Text mit Unschärfe.
 *   2. Danach die engere Betragsspanne — wer sich festgelegt hat, meint es genauer.
 *   3. Zuletzt die Vertrags-Id, rein damit das Ergebnis stabil ist.
 */
function besser(a: Vertragserkennung, b: Vertragserkennung, s: Zahlungsspur): boolean {
  const ueberId = (e: Vertragserkennung) =>
    e.merkmale.some((m) => m.art === "glaeubigerId" && merkmalTrifft(m, s));
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
