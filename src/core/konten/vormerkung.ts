// Eine Vormerkung — was die Bank kennt und noch nicht gebucht hat.
//
// ## Warum sie KEINE Buchung ist
//
// Die Kartenzahlung von gestern Abend, die Lastschrift, die morgen frueh laeuft: die
// Bank weiss davon und meldet sie, aber sie steht noch in keinem Auszug. In ein bis drei
// Tagen wird sie zu einer Buchung — moeglicherweise mit anderem Betrag, moeglicherweise
// gar nicht.
//
// Daraus folgt alles Weitere. Eine Vormerkung ins Ledger zu legen hiesse, dieselbe
// Zahlung zweimal zu fuehren, sobald sie gebucht ist, und der Dublettenfinder haette
// nichts, woran er sie erkennt: sie traegt keine stabile Kennung, ihr Betrag darf sich
// noch aendern, und bei manchen Instituten hat sie nicht einmal ein DATUM. Sie ist
// deshalb eine BEOBACHTUNG — dieselbe Kategorie wie ein Kontostands-Anker oder ein
// Depotwert, und nicht dieselbe wie eine Zahlung.
//
// ## Und warum sie ersetzt statt fortgeschrieben wird
//
// Was die Bank nicht mehr meldet, gibt es nicht mehr. Ein Verlauf alter Vormerkungen
// beantwortet keine Frage, die jemand stellt: wer wissen will, was passiert ist, sieht
// in die Buchungen. Jeder Abruf wirft deshalb die Vormerkungen seines Kontos weg und
// legt die neuen hin — der Bestand ist immer der Stand des letzten Abrufs, und genau
// das ist die einzige Aussage, die er treffen kann.

import type { Cent } from "../basis/geld";

export interface Vormerkung {
  readonly id: string;
  readonly zahlungskontoId: string;
  /**
   * Der Tag, den die Bank nennt — und der FEHLEN darf.
   *
   * Eine noch nicht gebuchte CAMT-Zeile kann ganz ohne Datum kommen (bei comdirect
   * gemessen): kein Buchungstag, keine Valuta, keines an der Zahlung dahinter. Das ist
   * kein Fehler, sondern eine Vormerkung ohne Termin — sie wirkt dann ab sofort, denn
   * was die Bank schon kennt, ist naeher als alles Datierte.
   */
  readonly datum?: string;
  /** Vorzeichenbehaftet wie ueberall: negativ = Abfluss. */
  readonly betrag: Cent;
  readonly waehrung: string;
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  /** `PDNG` (vorgemerkt) oder `INFO` (wird nicht gebucht) — was die Bank dazu sagt. */
  readonly buchungsstand?: string;
  /** Wann wir sie gesehen haben. Die einzige Zeitangabe, die immer dasteht. */
  readonly erfasstAm: string;
}

/**
 * Was die Vormerkungen eines Kontos zusammen ausmachen — die Summe, die vom Stand noch
 * abgeht, und ihre Zahl.
 *
 * **`INFO` zaehlt nicht mit.** Die Bank sagt damit, dass sie diese Zeile NICHT buchen
 * wird; sie mitzurechnen zoege Geld ab, das nie abgeht. Angezeigt wird sie trotzdem —
 * sie erklaert, was man im Online-Banking sieht.
 */
export function vormerkungslast(vormerkungen: readonly Vormerkung[]): { betrag: Cent; anzahl: number } {
  const wirksam = vormerkungen.filter((v) => v.buchungsstand !== "INFO");
  return {
    betrag: wirksam.reduce((s, v) => s + v.betrag, 0),
    anzahl: wirksam.length,
  };
}
