// Kategorie-Vorschlag (rein) für einen RohUmsatz — die Kette, die entscheidet, mit
// welcher Kategorie eine importierte Zahlung ankommt.
//
// Die Reihenfolge ist die Rangfolge, und sie geht von „festgelegt" zu „geraten":
//
//   1. **Umbuchung** — die Quelle hat es markiert. Umschichtung, OHNE konkrete Kategorie:
//      eigenes Geld, das das Konto wechselt, gehört in keine Ausgabenkategorie.
//   2. **Vertrag** — die Zahlung passt auf die Erkennungsregel eines Vertrags, und der
//      trägt eine Kategorie. Das ist keine Schätzung, sondern eine Zuordnung, die jemand
//      beim Erfassen des Vertrags getroffen hat.
//   3. **Quelle** — die Importdatei brachte eine Kategorie mit, und ihr Adapter konnte
//      sie übersetzen. Eine Angabe, keine Schätzung: dort steht, wie jemand diese Zahlung
//      einsortiert HAT. Vor dem Modell, weil das sich immer festlegt und diese Stufe
//      dahinter nie zum Zug käme. Innerhalb der Stufe gewinnt die Zuordnung, die beim
//      Import gewählt wurde, über die eingebaute Übersetzung.
//   4. **Modell** — der trainierte Klassifikator. Er legt sich immer fest.
//
// Trifft nichts, bleibt der Umsatz unkategorisiert und landet in der Review-Inbox.
//
// **Zwei Stufen sind am 29.08.2026 weggefallen**, und beide aus demselben Grund: sie
// beantworteten eine Frage, die inzwischen woanders beantwortet wird.
//
//   • Das **Remapping** übersetzte die Kategorie, die Finanzguru mitlieferte, auf unseren
//     Baum. Es trug den Kaltstart, solange nichts trainiert war — und mit einem
//     mitgelieferten Modell gibt es keinen Kaltstart mehr.
//
//     **Seit dem 30.08.2026 gibt es die Übersetzung wieder, aber woanders:** nicht als
//     Stufe mit Finanzguru-Wissen in dieser Datei, sondern beim Adapter, der die Datei
//     liest (`adapters/import/finanzguruKategorien.ts`). Hier steht seitdem nur noch
//     „die Quelle brachte eine Kategorie mit" — welches Vokabular sie sprach, weiss die
//     Kette nicht. Ein WISO-Importeur bringt seine eigene Tabelle mit und braucht dafür
//     keine zweite Stufe. Der `kategorieHinweis` bleibt unverändert am BELEG.
//   • Die **Festlegung** („immer bei diesem Empfänger") stand vor dem Vertrag. Sie war
//     kein Schutz — eine Handkorrektur ist über `kategorieHerkunft` ohnehin sicher —,
//     sondern eine VERALLGEMEINERUNG: sie übertrug eine Korrektur auf andere und künftige
//     Zahlungen desselben Empfängers. Genau das soll das Modell leisten, und zwar über
//     alle Merkmale statt über den Empfänger allein.
//
// Was daran hängt und beim Wiedereinbau bedacht werden muss: eine Korrektur wirkt jetzt
// erst nach dem nächsten Training auf ähnliche Zahlungen. Bleibt das spürbar zu langsam,
// ist die Antwort ein GEWICHT für Handkorrekturen im Training — nicht eine zweite Ebene
// daneben.
//
// Rein: alles, was die Kette braucht, kommt als Kontext herein. Der lädt sich in
// `application/kategorisierungsquellen`.

import {
  herkunftVon,
  klassifizieren,
  merkmalsbefund,
  vertragFuer,
  type Beitrag,
  type Kategorie,
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
  /**
   * Die Kategorie, die die QUELLE mitbrachte — als Name in unserem Vokabular, übersetzt
   * vom Adapter. Fehlt bei allem, was nicht aus einer Datei mit Kategorien kommt.
   */
  readonly kategorieVorschlag?: string;
  /**
   * Dieselbe Stufe, aber als Id — die Zuordnung, die beim Import jemand VOR AUGEN hatte.
   *
   * **Warum eine Id und nicht wieder ein Name.** Die Übersetzung des Adapters muss mit
   * Namen arbeiten: sie kennt den Katalog dieses Bestands nicht, und ein Name ist das
   * Einzige, worauf sie zeigen kann. Bei gleichnamigen Kategorien nimmt die Auflösung
   * dann die erste — hinnehmbar für eine Schätzung, nicht für eine Wahl. Wer im Import
   * eine bestimmte Kategorie angeklickt hat, hat GENAU diese gemeint, auch wenn eine
   * zweite gleich heisst.
   */
  readonly kategorieVorschlagId?: string;
}

/** Alles, woraus ein Vorschlag entstehen kann. Jeder Teil ist optional. */
export interface Vorschlagskontext {
  /** Kategorien nach Id — liefert den Charakter zur gewählten Kategorie. */
  readonly kategorieNachId: ReadonlyMap<string, Kategorie>;
  /**
   * Dieselben Kategorien nach NAME — für den Vorschlag der Quelle, der einen Namen
   * liefert und keine Id. Fehlt die Karte, entfällt die Stufe; sie ist nicht Pflicht,
   * damit Aufrufer ohne Import (die Review-Begründung etwa) sie nicht bauen müssen.
   */
  readonly kategorieNachName?: ReadonlyMap<string, Kategorie>;
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

  // 2. Vertrag — eine getroffene Zuordnung schlägt jede Schätzung.
  if (kontext.erkennungen?.length && kontext.vertragsKategorie?.size) {
    const vertragId = vertragFuer(kontext.erkennungen, alsSpur(roh, zahlungskontoId));
    const kategorieId = vertragId ? kontext.vertragsKategorie.get(vertragId) : undefined;
    if (vertragId && kategorieId) {
      const vorschlag = auf(kategorieId, "regel", kontext);
      if (vorschlag) return { vorschlag, vertragId };
    }
  }

  // 3. Was die Quelle mitbrachte — eine ANGABE, keine Schätzung.
  //
  // **Warum vor dem Modell und nicht danach:** das Modell legt sich immer fest. Stünde
  // diese Stufe dahinter, käme sie nie zum Zug. Und der Rang ist auch fachlich richtig
  // herum — in der Quelldatei steht, wie jemand diese Zahlung einsortiert HAT, im Modell
  // steht, wie es hier üblich WÄRE.
  //
  // **Warum nicht vor dem Vertrag:** ein Vertrag ist eine Zuordnung, die jemand in
  // DIESEM Bestand getroffen hat. Die Kategorie einer fremden App ist eine aus einem
  // anderen Kontext — näher dran als eine Schätzung, weiter weg als die eigene
  // Entscheidung.
  // Zuerst die Wahl des Menschen: die Import-Ansicht zeigt, was die Übersetzung vorhat,
  // und lässt es ändern. Was dort steht, schlägt die eingebaute Tabelle — sie kennt
  // diesen Katalog nicht, er schon.
  if (roh.kategorieVorschlagId) {
    const vorschlag = auf(roh.kategorieVorschlagId, "fremdkategorie", kontext);
    if (vorschlag) return { vorschlag };
  }
  if (roh.kategorieVorschlag && kontext.kategorieNachName?.size) {
    const kat = kontext.kategorieNachName.get(roh.kategorieVorschlag);
    if (kat) {
      const vorschlag = auf(kat.id, "fremdkategorie", kontext);
      if (vorschlag) return { vorschlag };
    }
  }

  // 4. Modell.
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

/**
 * Der Katalog nach NAME — für den Vorschlag, den eine Quelle mitbringt.
 *
 * **Bei gleichem Namen gewinnt der erste.** Namen sind im Katalog nicht eindeutig: nichts
 * hindert daran, unter zwei Gruppen je eine „Sonstiges" anzulegen. Für diese Stufe ist das
 * hinnehmbar — sie liefert einen VORSCHLAG, den die Durchsicht überschreibt, und die
 * Alternative (bei Mehrdeutigkeit gar nichts vorschlagen) wäre für den Nutzer schlechter:
 * er sähe eine leere Kategorie und nicht, warum.
 */
export function katalogNachName(kategorien: readonly Kategorie[]): Map<string, Kategorie> {
  const karte = new Map<string, Kategorie>();
  for (const k of kategorien) if (!karte.has(k.name)) karte.set(k.name, k);
  return karte;
}
