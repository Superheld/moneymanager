// Roh-Hash + die Speichergrenze des Imports.
//
// Der Hash ist quellen-AGNOSTISCH: derselbe Schlüssel entsteht aus Konto + Datum + Betrag
// + normalisiertem Zweck, egal aus welcher Quelle. Kein kryptografischer Hash
// (Webview-kompatibel, kein `node:crypto`): ein normalisierter Verbund-Schlüssel reicht
// und bleibt nebenbei lesbar.
//
// **Wofür er seit dem 06.09.2026 NICHT mehr da ist: Zeilen wegzuwerfen.** Ob zwei Zeilen
// dieselbe Zahlung meinen, entscheidet der Dublettenfinder (`dublette.ts`) — der kann
// Unschärfe, der Hash kann nur Gleichheit. Was hier bleibt, ist die Frage, ob ein Beleg
// überhaupt etwas NEUES trägt und deshalb gespeichert gehört.

import { normalisiereIban } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

function normZweck(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function rohHash(
  u: Pick<RohUmsatz, "kontoIban" | "buchungstag" | "betrag" | "verwendungszweck" | "gegenpartei">,
  /**
   * Fällt ein, wenn die Quelle keine Konto-IBAN liefert.
   *
   * Ohne ihn beginnt der Schlüssel mit einem LEEREN Kontofeld, und dann tragen zwei
   * Zeilen verschiedener Konten denselben Hash — die Kontogrenze, die überall sonst hart
   * ist, fällt ausgerechnet hier weg. Nachgereicht statt eingesetzt, damit bestehende
   * Hashes sich nicht ändern: eine Zeile MIT IBAN behält ihren.
   */
  zahlungskontoId?: string,
): string {
  const konto = u.kontoIban ? normalisiereIban(u.kontoIban) : (zahlungskontoId ?? "");
  // Die Gegenpartei gehört in den Schlüssel: bei Kartenzahlungen ist der Verwendungszweck
  // regelmäßig leer, dann unterscheiden Konto+Tag+Betrag zwei verschiedene Händler nicht
  // mehr — und die zweite Buchung würde als Dublette verworfen. Am echten Bestand traf
  // das mehrere Hash-Gruppen.
  //
  // JSON statt "|"-Verkettung, damit die Feldgrenzen eindeutig bleiben: ein "|" im
  // Referenzkonto konnte vorher einen Schlüssel nachbauen, der zu einer anderen Buchung
  // gehört.
  return JSON.stringify([
    konto,
    u.buchungstag,
    u.betrag,
    normZweck(u.gegenpartei),
    normZweck(u.verwendungszweck),
  ]);
}

/** Was schon dasteht — je Beleg ein Schlüssel aus `belegSchluessel`. */
export interface Belegbestand {
  readonly belegSchluessel: Iterable<string>;
}

/**
 * Der Schlüssel eines Belegs: QUELLE und Kennung.
 *
 * Die Quelle gehört hinein, und das ist der ganze Unterschied zu vorher. Derselbe Inhalt
 * aus einer ANDEREN Quelle ist neu und gehört gespeichert — genau der Fall, um den es
 * geht: die Bankfassung einer Zahlung, die schon aus einer Fremdsoftware im Bestand
 * liegt. Derselbe Inhalt aus DERSELBEN Quelle lehrt nichts.
 *
 * Als Kennung dient die native Id, wo es eine gibt, sonst der Roh-Hash. Der Unterschied
 * ist nicht kosmetisch: zwei echte Zahlungen derselben Quelle am selben Tag, an denselben
 * Empfänger, über denselben Betrag und ohne Verwendungszweck (zweimal derselbe Kaffee)
 * tragen denselben Hash. Wo die Quelle Ids vergibt, sind sie zu unterscheiden; wo nicht,
 * fallen sie zusammen — das war vorher so und ist die Grenze des Verfahrens.
 *
 * `\u0000` als Trenner, weil es in keinem der beiden Teile vorkommen kann.
 */
export function belegSchluessel(quelle: string, kennung: string): string {
  return `${quelle}\u0000${kennung}`;
}

export interface Belegbefund<T> {
  /** Trägt etwas Neues — gehört gespeichert. */
  readonly neu: T[];
  /** Steht in dieser Form schon da. */
  readonly bekannt: T[];
}

/**
 * Welche Belege etwas Neues tragen — gegen den Bestand UND innerhalb des Stapels.
 *
 * Der Stapel zählt mit: eine Datei kann dieselbe Zeile zweimal enthalten, und ein Abruf
 * überlappt bewusst mit dem vorigen. Ohne das Mitwachsen entstünden aus einem Lauf zwei
 * identische Belege.
 */
export function neueBelege<T extends { rohHash: string; nativeId?: string }>(
  kandidaten: readonly T[],
  quelle: string,
  bestand: Belegbestand,
): Belegbefund<T> {
  const gesehen = new Set(bestand.belegSchluessel);
  const neu: T[] = [];
  const bekannt: T[] = [];
  for (const k of kandidaten) {
    const schluessel = belegSchluessel(quelle, k.nativeId ?? k.rohHash);
    if (gesehen.has(schluessel)) {
      bekannt.push(k);
      continue;
    }
    gesehen.add(schluessel);
    neu.push(k);
  }
  return { neu, bekannt };
}
