// Kategorie-Vorschlag (rein) für einen RohUmsatz — die Kette, die entscheidet, mit
// welcher Kategorie eine importierte Zahlung ankommt.
//
// Die Reihenfolge ist die Rangfolge, und sie geht von „festgelegt" zu „geraten":
//
//   1. **Umbuchung** — die Quelle hat es markiert. Umschichtung, OHNE konkrete Kategorie:
//      eigenes Geld, das das Konto wechselt, gehört in keine Ausgabenkategorie.
//   2. **Festlegung** — jemand hat ausdrücklich gesagt „immer bei diesem Empfänger".
//      Steht VOR dem Vertrag, weil sie das Jüngere und Speziellere ist: wer sie eintippt,
//      hat den konkreten Fall vor Augen; die Kategorie am Vertrag ist eine Angabe von
//      damals, oft nur beim Anlegen mitgelaufen.
//   3. **Vertrag** — die Zahlung passt auf die Erkennungsregel eines Vertrags, und der
//      trägt eine Kategorie. Das ist keine Schätzung, sondern eine Zuordnung, die jemand
//      beim Erfassen des Vertrags getroffen hat.
//   4. **Modell** — der trainierte Klassifikator. Er legt sich immer fest; auf echten
//      Daten trifft er in rund 89 % der Fälle.
// Trifft nichts, bleibt der Umsatz unkategorisiert und landet in der Review-Inbox.
//
// Eine fünfte Stufe gab es bis 2026-08-29: das Remapping der Kategorie, die Finanzguru
// mitgeliefert hatte. Sie trug den Kaltstart, solange nichts trainiert war — und mit
// einem mitgelieferten Modell gibt es keinen Kaltstart mehr. Sie stand hinter dem
// Modell, wurde also ohnehin nur erreicht, wenn dieses nichts fand; zugleich lief der
// `kategorieHinweis` des Hanseatic-Abrufs still durch eine Finanzguru-Tabelle und
// konnte dort nur zufällig treffen. Der `kategorieHinweis` bleibt am BELEG (er ist,
// was die Quelle lieferte) — ausgewertet wird er nicht mehr.
//
// Rein: alles, was die Kette braucht, kommt als Kontext herein. Der lädt sich in
// `application/kategorisierungsquellen`.

import {
  festlegungFuer,
  herkunftVon,
  klassifizieren,
  merkmalsbefund,
  vertragFuer,
  type Beitrag,
  type Kategorie,
  type Kategoriefestlegung,
  type Merkmalskonfiguration,
  type Modell,
  type Vertragserkennung,
  type Zahlungsspur,
} from "../../core";
import type { Kategorisierungsvorschlag } from "./umsatz";

/**
 * Was die Kette über eine Zahlung wissen muss.
 *
 * Bewusst schmaler als `RohUmsatz` (den es strukturell erfüllt): dieselbe Rechnung wird
 * auch für einen bereits übernommenen `Umsatz` gebraucht — in der Review-Inbox, wo die
 * Frage „warum diese Kategorie?" gestellt wird. Der trägt kein `istUmbuchung` mehr;
 * es ist beim Import verbraucht und hier optional.
 */
export interface Vorschlagseingabe {
  readonly buchungstag: string;
  readonly betrag: number;
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  readonly glaeubigerId?: string;
  readonly istUmbuchung?: boolean;
}

/** Alles, woraus ein Vorschlag entstehen kann. Jeder Teil ist optional. */
export interface Vorschlagskontext {
  /** Kategorien nach Id — liefert den Charakter zur gewählten Kategorie. */
  readonly kategorieNachId: ReadonlyMap<string, Kategorie>;
  /** Ausdrückliche Festlegungen „immer bei diesem Empfänger". */
  readonly festlegungen?: readonly Kategoriefestlegung[];
  /** Erkennungsregeln aller Verträge. */
  readonly erkennungen?: readonly Vertragserkennung[];
  /** Vertrag → Kategorie. Verträge ohne Kategorie fehlen hier und greifen nicht. */
  readonly vertragsKategorie?: ReadonlyMap<string, string>;
  readonly modell?: Modell;
  readonly merkmale?: Merkmalskonfiguration;
}

/** Ein Vorschlag samt der Belege, aus denen er entstand. */
export interface Vorschlagsbefund {
  readonly vorschlag?: Kategorisierungsvorschlag;
  /**
   * Warum diese Kategorie. Beim Modell die Beitragszerlegung, sonst leer — eine
   * Vertragszuordnung begründet sich über den Vertrag, nicht über einzelne Wörter.
   */
  readonly beitraege?: readonly Beitrag[];
  /** Name des Vertrags, wenn er den Vorschlag getragen hat. */
  readonly vertragId?: string;
  /** Das Muster der Festlegung, wenn sie den Vorschlag getragen hat. */
  readonly festlegung?: string;
  /** Sicherheit des Modells (0…1), sofern es entschieden hat. */
  readonly sicherheit?: number;
}

/**
 * Baut die Pseudo-Spur, mit der die Vertragserkennung arbeitet.
 *
 * Beim Import gibt es noch keine Ist-Buchung — also keine Id und keinen Charakter. Die
 * Id bleibt leer (die Regel prüft sie nicht), der Charakter wird aus dem Vorzeichen
 * abgeleitet. Das genügt, weil `passtZu` ihn nur benutzt, um Umschichtungen
 * auszuschließen, und die sind an dieser Stelle längst abgefangen.
 */
function alsSpur(roh: Vorschlagseingabe, zahlungskontoId?: string): Zahlungsspur {
  return {
    id: "",
    datum: roh.buchungstag,
    betrag: roh.betrag,
    gegenpartei: roh.gegenpartei,
    verwendungszweck: roh.verwendungszweck,
    glaeubigerId: roh.glaeubigerId,
    kontoId: zahlungskontoId,
    charakter: roh.betrag < 0 ? "Aufwand" : "Ertrag",
  };
}

/** Ein Vorschlag auf eine Kategorie-Id, mit dem Charakter aus dem Katalog. */
function auf(
  kategorieId: string,
  quelle: Kategorisierungsvorschlag["quelle"],
  kontext: Vorschlagskontext,
): Kategorisierungsvorschlag | undefined {
  const kat = kontext.kategorieNachId.get(kategorieId);
  // Eine Kategorie, die es nicht (mehr) gibt, ist kein Vorschlag — sonst trüge die
  // Buchung eine Id ins Leere und fiele in keiner Auswertung mehr auf.
  if (!kat) return undefined;
  return { kategorieId: kat.id, charakter: kat.defaultCharakter, quelle };
}

/** Die volle Kette mit Begründung. */
export function vorschlagsbefundFuer(
  roh: Vorschlagseingabe,
  kontext: Vorschlagskontext,
  zahlungskontoId?: string,
): Vorschlagsbefund {
  if (roh.istUmbuchung) {
    return { vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" } };
  }

  // 1. Festlegung — die ausdrücklichste Aussage, die es hier gibt.
  if (kontext.festlegungen?.length) {
    const f = festlegungFuer(kontext.festlegungen, roh.gegenpartei);
    if (f) {
      const vorschlag = auf(f.kategorieId, "festlegung", kontext);
      if (vorschlag) return { vorschlag, festlegung: f.muster };
    }
  }

  // 2. Vertrag — eine getroffene Zuordnung schlägt jede Schätzung.
  if (kontext.erkennungen?.length && kontext.vertragsKategorie?.size) {
    const vertragId = vertragFuer(kontext.erkennungen, alsSpur(roh, zahlungskontoId));
    const kategorieId = vertragId ? kontext.vertragsKategorie.get(vertragId) : undefined;
    if (vertragId && kategorieId) {
      const vorschlag = auf(kategorieId, "regel", kontext);
      if (vorschlag) return { vorschlag, vertragId };
    }
  }

  // 3. Modell.
  if (kontext.modell) {
    const befund = merkmalsbefund(
      {
        gegenpartei: roh.gegenpartei,
        verwendungszweck: roh.verwendungszweck,
        glaeubigerId: roh.glaeubigerId,
        betrag: roh.betrag,
      },
      kontext.merkmale,
    );
    // Ein Vektor, in dem nur das Vorzeichen steht, trägt keine Entscheidung — dann käme
    // für jede textlose Zahlung dieselbe Kategorie heraus.
    const inhalt = befund.merkmale.filter((m) => herkunftVon(m) !== "vz");
    if (inhalt.length > 0) {
      const k = klassifizieren(kontext.modell, befund.merkmale);
      if (k) {
        const vorschlag = auf(k.kategorieId, "ki", kontext);
        if (vorschlag) return { vorschlag, beitraege: k.beitraege, sicherheit: k.sicherheit };
      }
    }
  }

  return {};
}

/** Nur der Vorschlag — der Weg, den der Import geht. */
export function vorschlagFuer(
  roh: Vorschlagseingabe,
  kontext: Vorschlagskontext,
  zahlungskontoId?: string,
): Kategorisierungsvorschlag | undefined {
  return vorschlagsbefundFuer(roh, kontext, zahlungskontoId).vorschlag;
}

/** Hilfsindex: Kategorien nach Id. */
export function katalogNachId(kategorien: readonly Kategorie[]): Map<string, Kategorie> {
  return new Map(kategorien.map((k) => [k.id, k]));
}
