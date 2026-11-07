// Welche zwei Buchungen sind dieselbe Umbuchung?
//
// Die Automatik tut, was man von Hand mit „paaren" tut, und prüft dasselbe wie die Liste
// dort (`paarungsKandidaten`): exakter Gegenbetrag, zwei verschiedene Konten, im
// Zeitfenster, beide noch frei. Absender und Ziel sind damit die beiden eigenen Konten.
//
// Was sie zusätzlich verlangt, kommt aus den Belegen, denn anders als der Mensch vor der
// Liste sieht sie nicht, worum es bei einer Zeile ging:
//
//   • **Nennt ein Beleg eine ANDERE Gegenseite, ist es kein Treffer.** Das ist der eine
//     Satz, der die meisten Fehlgriffe ausschliesst: eine Erstattung vom Händler trägt
//     dessen IBAN, nicht die des eigenen Kontos.
//   • **Zwei Bankzeilen müssen sich ausweisen:** mindestens eine nennt per Gegen-IBAN das
//     andere Konto. Sonst stünde eine Kartenzahlung ohne IBAN neben einer Gutschrift
//     gleicher Höhe, und nichts außer dem Betrag spräche dafür.
//   • **Eine Handbuchung kann das nicht** — sie hat keinen Beleg, und wer sie anlegt, hat
//     nur Konto, Tag und Betrag angegeben. Ist eine dabei, genügt deshalb, was auch die
//     Liste beim Paaren von Hand verlangt.
//
// Vorgemerkt wird nichts: **ein einzelnes Bein bleibt, was es ist**, bis das zweite da
// ist. Ist die Wahl nicht eindeutig, passiert nichts. Eine fehlende Paarung lässt sich von
// Hand nachholen, eine falsche sieht richtig aus.

import { tageBis } from "../basis/datum";
import { normalisiereIban, type Zahlungskonto } from "../konten/konto";
import type { IstBuchung } from "./istbuchung";

/**
 * Darf die Automatik diese Buchung überhaupt anfassen?
 *
 * Alle Ausschlüsse sind dieselbe Regel: was jemand entschieden hat, bleibt.
 *
 *  • Keine `transferId` — schon verbunden.
 *  • Keine `Umschichtung` OHNE Kategorie — das entsteht nur durch „Paarung lösen"
 *    (`alsBein` nimmt die Kategorie, `paarungLoesen` lässt den Charakter stehen). Es ist
 *    ein Nein von Hand, und ohne diesen Ausschluss käme die gelöste Paarung zurück. MIT
 *    Kategorie ist es dagegen eine eingetragene Sparbuchung, die auf ihr Gegenstück wartet.
 *  • Keine Bankzeile, die jemand von Hand einsortiert hat — wer sie korrigiert, sah etwas
 *    anderes in ihr als eine Umbuchung. Bei einer HANDBUCHUNG gilt das nicht: dort gehört
 *    die Kategorie zum Erfassen und ist keine Antwort auf eine Frage.
 *  • Nicht aufgeteilt — die Teile tragen eigene Kategorien; eine Umschichtung hat keine.
 */
function frei(b: IstBuchung): boolean {
  return (
    b.transferId == null &&
    !(b.charakter === "Umschichtung" && !b.kategorieId) &&
    !(b.quelle === "import" && b.kategorieHerkunft === "manuell") &&
    !b.aufteilungen?.length
  );
}

/**
 * IBAN (normalisiert) → Konto.
 *
 * Tragen zwei Konten dieselbe IBAN, fällt sie heraus: welches gemeint ist, stünde dann
 * nicht fest, und genau das soll ein Treffer belegen.
 */
export function kontenNachIban(konten: readonly Zahlungskonto[]): ReadonlyMap<string, string> {
  const treffer = new Map<string, string>();
  const doppelt = new Set<string>();
  for (const k of konten) {
    if (!k.iban) continue;
    const iban = normalisiereIban(k.iban);
    if (treffer.has(iban)) doppelt.add(iban);
    treffer.set(iban, k.id);
  }
  for (const iban of doppelt) treffer.delete(iban);
  return treffer;
}

export interface Umbuchungssuche {
  /** Die gerade hereingekommenen Buchungen. Nur von ihnen geht die Suche aus. */
  readonly neueIds: ReadonlySet<string>;
  readonly buchungen: readonly IstBuchung[];
  /** Buchung → Gegen-IBAN ihres Belegs, soweit die Quelle eine geliefert hat. */
  readonly gegenIbanNachBuchung: ReadonlyMap<string, string>;
  readonly kontoNachIban: ReadonlyMap<string, string>;
  /** Größter Abstand der beiden Buchungstage in Tagen. */
  readonly maxTage: number;
}

/**
 * Die nachweislichen Paare, Abgang zuerst.
 *
 * **Die Suche geht nur von neuen Buchungen aus**, nicht über den ganzen Bestand — auch das
 * schützt Entscheidungen: was jemand in Ruhe gelassen hat, wird nicht bei jedem Abruf neu
 * aufgerollt. Der Altbestand wäre ein eigener Schritt, mit Liste zum Bestätigen.
 *
 * Gepaart wird nur **gegenseitig Nächstes**: `b` ist der eindeutig nächste Treffer von `a`
 * UND umgekehrt. Damit hängt das Ergebnis nicht von der Reihenfolge ab, und bei zwei
 * gleich weit entfernten Treffern bleibt die Buchung stehen, statt dass einer gewinnt.
 */
export function exakteUmbuchungen(suche: Umbuchungssuche): [IstBuchung, IstBuchung][] {
  const { neueIds, buchungen, gegenIbanNachBuchung, kontoNachIban, maxTage } = suche;
  const kandidaten = buchungen.filter(frei);
  const kontenMitIban = new Set(kontoNachIban.values());

  /**
   * Was sagt der Beleg von `von` über das Konto von `an`?
   *
   * Eine IBAN, die keines unserer Konten kennt, widerspricht nur, wenn `an` selbst eine
   * trägt. Ohne hinterlegte IBAN lässt sich nicht sagen, dass sie nicht die seine ist.
   */
  const aussage = (von: IstBuchung, an: IstBuchung): "keine" | "nennt" | "widerspricht" => {
    const iban = gegenIbanNachBuchung.get(von.id);
    if (!iban) return "keine";
    const konto = kontoNachIban.get(normalisiereIban(iban));
    if (konto) return konto === an.kontoId ? "nennt" : "widerspricht";
    return kontenMitIban.has(an.kontoId) ? "widerspricht" : "keine";
  };

  const passt = (a: IstBuchung, b: IstBuchung): boolean => {
    if (a.id === b.id || a.betrag === 0 || a.betrag !== -b.betrag || a.kontoId === b.kontoId) {
      return false;
    }
    if (Math.abs(tageBis(a.datum, b.datum)) > maxTage) return false;
    const hin = aussage(a, b);
    const zurueck = aussage(b, a);
    if (hin === "widerspricht" || zurueck === "widerspricht") return false;
    return hin === "nennt" || zurueck === "nennt" || a.quelle === "manuell" || b.quelle === "manuell";
  };

  /** Der eindeutig nächste Treffer; bei Gleichstand keiner. */
  const naechster = (a: IstBuchung): IstBuchung | undefined => {
    const treffer = kandidaten
      .filter((b) => passt(a, b))
      .sort((x, y) => Math.abs(tageBis(a.datum, x.datum)) - Math.abs(tageBis(a.datum, y.datum)));
    if (treffer.length < 2) return treffer[0];
    const abstand = (b: IstBuchung) => Math.abs(tageBis(a.datum, b.datum));
    return abstand(treffer[0]) === abstand(treffer[1]) ? undefined : treffer[0];
  };

  const paare: [IstBuchung, IstBuchung][] = [];
  const vergeben = new Set<string>();
  for (const a of kandidaten) {
    if (!neueIds.has(a.id) || vergeben.has(a.id)) continue;
    const b = naechster(a);
    if (!b || naechster(b)?.id !== a.id) continue;
    vergeben.add(a.id);
    vergeben.add(b.id);
    paare.push(a.betrag < 0 ? [a, b] : [b, a]);
  }
  return paare;
}
