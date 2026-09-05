// Welches Umsatzformat abgerufen wird.
//
// Eigene Datei, weil es die einzige Stelle im Adapter ist, an der wirklich ENTSCHIEDEN
// wird. Der Rest von `fintsAdapter.ts` redet mit der Bank und ist ohne sie nicht pruefbar;
// diese Funktion ist eine reine Abbildung und soll genau deshalb hier liegen, wo ein Test
// sie erreicht.
//
// ## Bis 2026-09-04 waren es ZWEI Versuche, jetzt ist es eine Wahl
//
// Vorher wurde CAMT probiert und bei leerem Ergebnis MT940 nachgeschoben. Das war ein
// Umweg um einen Fehler der Bibliothek: `HKCAZ` nutzt die internationale
// Kontoverbindung, und lib-fints fuellte darin IBAN, BIC UND die nationalen Felder
// zugleich — was mindestens ein Institut mit `3010 Kontonummer ist ungueltig` und einer
// leeren Liste beantwortete. Weil `success` dabei nichts taugt (die Bibliothek setzt es
// auf „hoechster Rueckmeldecode < 9000", und 3010 liegt darunter), blieb als Indikator
// nur „es kam nichts".
//
// Beides ist weg. Der Fork fragt die HISPAS-Parameter der Bank, und seit dem Stand
// 27de365 WIRFT `getAccountStatements` bei einem Parsefehler, statt leer
// zurueckzukommen. Damit ist ein leeres Ergebnis wieder das, was es sein sollte: kein
// Umsatz im Zeitraum. Ein zweiter Versuch darauf haette nichts mehr zu finden.
//
// ## Warum die Faehigkeit gefragt wird und nicht das Gedaechtnis
//
// An seiner Stelle steht die Faehigkeit: was die Bank fuer DIESES KONTO anbietet, sagt
// sie selbst (`getSupportedStatementFormats`). Das ist eine Auskunft statt eines
// Ausprobierens. Warum je Konto und nicht je Bank, steht bei `formatWaehlen` — es ist
// der Unterschied zwischen einem richtigen und einem falschen Etikett am Lauf.
//
// Das frueher mitgefuehrte Gedaechtnis (`zuletzt`) entscheidet ausdruecklich NICHT mehr
// mit, und das ist wichtiger als es klingt: es steht bei jedem Konto auf „MT940", das
// den alten Fehler hatte — genau bei denen also, die der Fork gerade repariert. Wuerde
// es die Wahl tragen, blieben sie fuer immer auf MT940 und bekaemen die Felder nie zu
// sehen, wegen derer aktualisiert wurde. Das Feld wird weiter FORTGESCHRIEBEN; es ist
// jetzt eine Aufzeichnung, was getragen hat, und keine Eingabe mehr.

import type { Formatvorgabe } from "../../application/fints/abrufPort";

/** Die beiden Formate, in denen eine Bank Umsaetze herausgibt. */
export type Umsatzformat = "CAMT" | "MT940";

/**
 * Das Format fuer diesen Abruf — aus dem, was das KONTO anbietet.
 *
 * ## Die Faehigkeit haengt am Konto, nicht an der Bank
 *
 * Bis 2026-09-05 wurde `profil.vorfaelle` gefragt, also die Vorfaelle des INSTITUTS.
 * Eine Bank kann `HKCAZ` beherrschen und es trotzdem nur fuer einen Teil ihrer Konten
 * freigeben; bei einem Tagesgeld- oder Verrechnungskonto im selben Zugang ist genau das
 * der Fall. Die Bibliothek entschied dieselbe Frage am Konto und fiel still auf MT940
 * zurueck — der Abruf lieferte also, was das Konto hergibt, aber an den Lauf wurde
 * „CAMT" geschrieben. `umsatzart` und `buchungsschluessel` tragen je nach Format
 * verschiedene Vokabulare und sind allein ueber dieses Etikett deutbar; ein falsches
 * macht sie unlesbar, ohne dass irgendwo ein Fehler auftaucht.
 *
 * Seit dem Bibliotheks-Stand f943818 ist der stille Rueckfall weg: das Format wird
 * ausdruecklich angefordert, und ein Konto, das es nicht anbietet, fuehrt zu einem Wurf
 * statt zu einem anderen Format. Gefragt wird deshalb, WAS ANGEBOTEN IST
 * (`getSupportedStatementFormats`) — eine Auskunft der Bibliothek statt einer Bedingung,
 * die wir daneben noch einmal nachbauen. Dass zwei Seiten dieselbe Frage verschieden
 * beantworten, war der Fehler.
 *
 * ## Eine Festlegung schlaegt alles — bis auf das, was es nicht gibt
 *
 * `wahl` ist eine Entscheidung des Nutzers: wer ein Format waehlt, will dessen Ergebnis
 * sehen, auch das leere. Ist es fuer dieses Konto aber gar nicht im Angebot, wird hier
 * geworfen und nicht dort — VOR dem Bankverkehr, auf Deutsch, und mit dem Konto im Text.
 * Die Bibliothek wuerfe sonst dasselbe eine Ebene tiefer, wo unser Fehlerpfad daraus ein
 * „liess sich nicht lesen" machte: es liess sich nicht ANFORDERN, und das ist ein
 * anderer Satz.
 */
export function formatWaehlen(
  vorgabe: Formatvorgabe | undefined,
  angeboten: readonly Umsatzformat[],
  kontoBezeichnung?: string,
): Umsatzformat {
  const wahl = vorgabe?.wahl ?? "automatisch";
  const konto = kontoBezeichnung ? ` fuer „${kontoBezeichnung}"` : "";

  if (angeboten.length === 0) {
    throw new Error(`Die Bank gibt${konto} keine Umsaetze heraus — weder als CAMT noch als MT940.`);
  }
  if (wahl !== "automatisch") {
    if (!angeboten.includes(wahl)) {
      throw new Error(
        `Die Bank bietet${konto} nur ${angeboten.join(" und ")} an; ${wahl} ist nicht abrufbar. ` +
          `Die Festlegung steht bei den Bankzugaengen.`,
      );
    }
    return wahl;
  }
  return angeboten.includes("CAMT") ? "CAMT" : "MT940";
}
