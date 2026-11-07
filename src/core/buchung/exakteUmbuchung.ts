// Welche zwei Buchungen sind nachweislich dieselbe Umbuchung?
//
// Die Automatik macht dasselbe, was man von Hand mit „paaren" tut — und nur dann, wenn
// nichts daran geraten ist. Ein gleicher Betrag genügt deshalb NIE: 50 raus auf dem einen
// Konto und 50 rein auf dem anderen kann auch eine Ausgabe und eine fremde Erstattung
// sein. Was ein Paar zum Paar macht, sind ABSENDER und ZIEL:
//
//   • Betrag exakt entgegengesetzt, zwei verschiedene Konten, im Zeitfenster.
//   • Mindestens ein Bein NENNT das andere Konto (seine Gegen-IBAN gehört dorthin). Sein
//     eigenes Konto ist der Absender bzw. das Ziel, die Gegen-IBAN die andere Seite — ein
//     einziges Bein trägt also schon beide Enden.
//   • Keines der beiden nennt ein ANDERES Konto. Fehlt die Angabe, widerspricht sie auch
//     nicht: nicht jede Quelle liefert eine Gegen-IBAN.
//
// Vorgemerkt wird nichts: **ein einzelnes Bein bleibt, was es ist**, bis das zweite da
// ist. Ein Treffer braucht beide Seiten im Bestand.
//
// Ist die Wahl nicht eindeutig, passiert nichts. Eine fehlende Paarung lässt sich von Hand
// nachholen und fällt in der Liste auf; eine falsche sieht richtig aus.

import { tageBis } from "../basis/datum";
import { normalisiereIban, type Zahlungskonto } from "../konten/konto";
import type { IstBuchung } from "./istbuchung";

/**
 * Darf die Automatik diese Buchung überhaupt anfassen?
 *
 * Die Ausschlüsse sind alle dieselbe Regel: was jemand entschieden hat, bleibt.
 *
 *  • `quelle: "import"` — nur ein Bankbeleg sagt etwas über die Gegenseite.
 *  • Keine `transferId` — schon verbunden.
 *  • Nicht `Umschichtung` — ein Bein OHNE Partner mit diesem Charakter entsteht nur durch
 *    „Paarung lösen". Das ist ein Nein von Hand, und ohne diesen Ausschluss käme die
 *    gelöste Paarung beim nächsten Abruf zurück.
 *  • Keine Handkategorie — wer die Zeile selbst einsortiert hat, sah etwas anderes in ihr
 *    als eine Umbuchung. `alsBein` würde die Kategorie entfernen.
 *  • Nicht aufgeteilt — die Teile tragen eigene Kategorien; eine Umschichtung hat keine.
 */
function frei(b: IstBuchung): boolean {
  return (
    b.quelle === "import" &&
    b.transferId == null &&
    b.charakter !== "Umschichtung" &&
    b.kategorieHerkunft !== "manuell" &&
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

  /** Was sagt der Beleg von `von` über das Konto von `an`? */
  const aussage = (von: IstBuchung, an: IstBuchung): "keine" | "nennt" | "widerspricht" => {
    const iban = gegenIbanNachBuchung.get(von.id);
    if (!iban) return "keine";
    return kontoNachIban.get(normalisiereIban(iban)) === an.kontoId ? "nennt" : "widerspricht";
  };

  const passt = (a: IstBuchung, b: IstBuchung): boolean => {
    if (a.id === b.id || a.betrag === 0 || a.betrag !== -b.betrag || a.kontoId === b.kontoId) {
      return false;
    }
    if (Math.abs(tageBis(a.datum, b.datum)) > maxTage) return false;
    const hin = aussage(a, b);
    const zurueck = aussage(b, a);
    if (hin === "widerspricht" || zurueck === "widerspricht") return false;
    return hin === "nennt" || zurueck === "nennt";
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
