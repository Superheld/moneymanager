// Einrichten, Entsperren, Sperren — aus Sicht der Anwendung.
//
// **Die Anwendung kennt den Schlüssel nie.** Sie reicht die Passphrase durch und bekommt
// „ging" oder „ging nicht" zurück; der Datenschlüssel lebt ausschliesslich in Rust. Das
// ist kein Zeremoniell: was nie durch den Webview läuft, kann eine kompromittierte
// Abhängigkeit dort auch nicht abgreifen.

import { passphrasePruefen, type Passphrasebefund } from "../core/zugang/passphrase";

// Weitergereicht, weil die Oberfläche sie braucht und den Kern nicht kennen darf: die
// Mindestlänge steht in jedem Hinweistext, der Befund in jeder Fehlermeldung.
export { MINDESTLAENGE, type Passphrasebefund } from "../core/zugang/passphrase";

export interface Zugangsstand {
  /** Gibt es eine Hülle? Wenn nicht, muss eingerichtet werden. */
  eingerichtet: boolean;
  /** Ist die Datenbank gerade offen? */
  offen: boolean;
  /** Liegt ein unverschlüsselter Altbestand da, der überführt wird? */
  altbestand: boolean;
}

export interface ZugangPort {
  stand(): Promise<Zugangsstand>;
  /** Richtet ein und gibt den Wiederherstellungscode zurück. */
  einrichten(passphrase: string): Promise<string>;
  /** `false` heisst: Passphrase falsch. */
  entsperren(passphrase: string): Promise<boolean>;
  /** `false` heisst: Code unbrauchbar. */
  mitCode(code: string, neuePassphrase: string): Promise<boolean>;
  /** `false` heisst: die alte Passphrase war falsch. */
  passphraseWechseln(alte: string, neue: string): Promise<boolean>;
  /** `null` heisst: Passphrase falsch. */
  codeZeigen(passphrase: string): Promise<string | null>;
  sperren(): Promise<void>;
}

export type Einrichtung =
  | { art: "fertig"; wiederherstellungscode: string }
  | { art: "abgelehnt"; befund: Passphrasebefund };

/**
 * Einrichten — mit der Prüfung davor.
 *
 * Die Prüfung sitzt hier und nicht in der Oberfläche, damit sie an einer Stelle steht:
 * eine zweite Maske (Passphrase wechseln) prüft dieselbe Regel, und zwei Kopien wären
 * zwei Antworten auf dieselbe Frage.
 */
export async function zugangEinrichten(port: ZugangPort, passphrase: string): Promise<Einrichtung> {
  const befund = passphrasePruefen(passphrase);
  if (!befund.taugt) return { art: "abgelehnt", befund };

  return { art: "fertig", wiederherstellungscode: await port.einrichten(passphrase) };
}

export type Wechsel =
  | { art: "fertig" }
  | { art: "alteFalsch" }
  | { art: "abgelehnt"; befund: Passphrasebefund };

export async function passphraseWechseln(
  port: ZugangPort,
  alte: string,
  neue: string,
): Promise<Wechsel> {
  const befund = passphrasePruefen(neue);
  if (!befund.taugt) return { art: "abgelehnt", befund };

  return (await port.passphraseWechseln(alte, neue)) ? { art: "fertig" } : { art: "alteFalsch" };
}

export type Rettung =
  | { art: "fertig" }
  | { art: "codeUnbrauchbar" }
  | { art: "abgelehnt"; befund: Passphrasebefund };

/**
 * Mit dem Wiederherstellungscode hinein — und dabei gleich eine neue Passphrase setzen.
 *
 * Wer den Zettel braucht, hat die Passphrase vergessen. Ihn danach ohne neue stehen zu
 * lassen hiesse, ihn beim nächsten Start wieder danach suchen zu lassen.
 */
export async function mitCodeRetten(
  port: ZugangPort,
  code: string,
  neuePassphrase: string,
): Promise<Rettung> {
  const befund = passphrasePruefen(neuePassphrase);
  if (!befund.taugt) return { art: "abgelehnt", befund };

  return (await port.mitCode(code, neuePassphrase))
    ? { art: "fertig" }
    : { art: "codeUnbrauchbar" };
}
