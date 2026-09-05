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
// An seiner Stelle steht die Faehigkeit: ist `HKCAZ` fuer DIESES KONTO freigegeben, wird
// CAMT geholt, sonst MT940. Das ist eine Auskunft statt eines Ausprobierens, und sie
// steht ohnehin schon im Bankfaehigkeitsprofil. Warum je Konto und nicht je Bank, steht
// bei `kontoKannCamt` — es ist der Unterschied zwischen einem richtigen und einem
// falschen Etikett am Lauf.
//
// Das frueher mitgefuehrte Gedaechtnis (`zuletzt`) entscheidet ausdruecklich NICHT mehr
// mit, und das ist wichtiger als es klingt: es steht bei jedem Konto auf „MT940", das
// den alten Fehler hatte — genau bei denen also, die der Fork gerade repariert. Wuerde
// es die Wahl tragen, blieben sie fuer immer auf MT940 und bekaemen die Felder nie zu
// sehen, wegen derer aktualisiert wurde. Das Feld wird weiter FORTGESCHRIEBEN; es ist
// jetzt eine Aufzeichnung, was getragen hat, und keine Eingabe mehr.

import type { Bankprofil, Formatvorgabe } from "../../application/fints/abrufPort";

/**
 * Ob fuer DIESES Konto CAMT herausgegeben wird.
 *
 * ## Die Faehigkeit haengt am KONTO, nicht an der Bank
 *
 * Bis 2026-09-05 wurde `profil.vorfaelle` gefragt — die Vorfaelle, die das INSTITUT
 * kennt. Das ist eine andere Aussage: eine Bank kann `HKCAZ` beherrschen und es trotzdem
 * nur fuer einen Teil ihrer Konten freigeben. Bei einem Tagesgeld- oder
 * Verrechnungskonto im selben Zugang ist genau das der Fall.
 *
 * Der Schaden daran war nicht der falsche Abruf, denn `getAccountStatements` prueft
 * seinerseits das Konto und holt dann eben MT940. Der Schaden war das ETIKETT: wir
 * schrieben „CAMT" an den Lauf, waehrend MT940 durchlief — und `umsatzart` und
 * `buchungsschluessel` tragen je nach Format verschiedene Vokabulare, deutbar allein
 * ueber diese Angabe. Ein falsches Etikett macht sie unlesbar, ohne dass irgendwo ein
 * Fehler auftaucht: im Bestand stehen Zeilen mit dem numerischen Geschaeftsvorfallcode
 * aus MT940 unter einem CAMT-Lauf.
 *
 * Gespiegelt wird deshalb genau die Bedingung der Bibliothek
 * (`isAccountTransactionSupported`: steht `HKCAZ` in den freigegebenen Vorfaellen DIESES
 * Kontos). Dass zwei Seiten dieselbe Frage verschieden beantworten, ist der Fehler —
 * nicht die Antwort der einen.
 */
export function kontoKannCamt(profil: Bankprofil, kontoSchluessel: string): boolean {
  return (profil.kontoVorfaelle[kontoSchluessel] ?? []).includes("HKCAZ");
}

/**
 * Das Format fuer diesen Abruf.
 *
 * `wahl` ist eine FESTLEGUNG des Nutzers und schlaegt alles: wer ein Format waehlt, will
 * dessen Ergebnis sehen — auch das leere. Ohne Festlegung entscheidet, was das KONTO
 * kann (`kontoKannCamt`).
 */
export function formatWaehlen(vorgabe: Formatvorgabe | undefined, kannCamt: boolean): "CAMT" | "MT940" {
  const wahl = vorgabe?.wahl ?? "automatisch";
  if (wahl === "CAMT") return "CAMT";
  if (wahl === "MT940") return "MT940";
  return kannCamt ? "CAMT" : "MT940";
}
