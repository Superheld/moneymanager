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
// ## Warum die Bank gefragt wird und nicht das Gedaechtnis
//
// An seiner Stelle steht die Faehigkeit: kann die Bank `HKCAZ`, wird CAMT geholt, sonst
// MT940. Das ist eine Auskunft statt eines Ausprobierens, und sie steht ohnehin schon im
// Bankfaehigkeitsprofil.
//
// Das frueher mitgefuehrte Gedaechtnis (`zuletzt`) entscheidet ausdruecklich NICHT mehr
// mit, und das ist wichtiger als es klingt: es steht bei jedem Konto auf „MT940", das
// den alten Fehler hatte — genau bei denen also, die der Fork gerade repariert. Wuerde
// es die Wahl tragen, blieben sie fuer immer auf MT940 und bekaemen die Felder nie zu
// sehen, wegen derer aktualisiert wurde. Das Feld wird weiter FORTGESCHRIEBEN; es ist
// jetzt eine Aufzeichnung, was getragen hat, und keine Eingabe mehr.

import type { Formatvorgabe } from "../../application/fints/abrufPort";

/**
 * Das Format fuer diesen Abruf.
 *
 * `wahl` ist eine FESTLEGUNG des Nutzers und schlaegt alles: wer ein Format waehlt, will
 * dessen Ergebnis sehen — auch das leere. Ohne Festlegung entscheidet, was die Bank kann.
 */
export function formatWaehlen(vorgabe: Formatvorgabe | undefined, kannCamt: boolean): "CAMT" | "MT940" {
  const wahl = vorgabe?.wahl ?? "automatisch";
  if (wahl === "CAMT") return "CAMT";
  if (wahl === "MT940") return "MT940";
  return kannCamt ? "CAMT" : "MT940";
}
