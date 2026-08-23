// Übersetzung: was die eingebettete Bibliothek liefert → `RohUmsatz`.
//
// Reine Funktionen, kein Netz, kein Zustand — hier laufen die Tests. Zwei der Fallen aus
// dem FinTS-Weg gibt es hier NICHT, und das ist erwähnenswert, damit niemand vorsorglich
// dagegen anbaut: die Bibliothek liefert Datumsangaben bereits als ISO-Zeichenkette (die
// Zeitzonen-Falle ist dort schon gelöst), und `amount` trägt sein Vorzeichen selbst.
//
// Was bleibt, ist die eine, die immer bleibt: **`amount` ist Euro als Fliesskomma**, hier
// gilt Integer Cent.
//
// Warum die Umrechnung nicht aus `../fints/uebersetzung` importiert wird, obwohl sie dort
// fast gleich steht: das hier ist ein Experiment, und es darf den tragenden Bankweg nicht
// anfassen — auch nicht durch eine Abhängigkeit, die bei seinem nächsten Umbau bricht.
// Der gemeinsame Teil liegt ohnehin im Kern (`majorZuMinor`), und der wird geteilt.

import { istCent, majorZuMinor, waehrungNachCode, type Cent } from "../../core";
import type { ImportErgebnis, RohUmsatz } from "../../application/import";
import type { Account, Transaction } from "../../vendor/hanseatic-bank/types.js";

export const HANSEATIC_QUELLE = "hanseatic";

/**
 * Bank-Betrag (Euro als Fliesskomma) → Minor Units.
 *
 * `majorZuMinor` aus dem Kern kennt die Skala der Währung und rundet kaufmännisch; hier
 * kommt nur der Wächter dazu. `-12.34 * 100` ist in IEEE 754 nicht exakt, und was danach
 * kein sicherer Integer ist, darf gar nicht erst in die App — ein lauter Fehler ist
 * besser als ein stiller Zahlendreher im Geld.
 */
export function betragZuCent(betrag: number, waehrungCode = "EUR"): Cent {
  if (!Number.isFinite(betrag)) throw new Error(`Betrag ist keine Zahl: ${betrag}`);
  const cent = majorZuMinor(betrag, waehrungNachCode(waehrungCode));
  if (!istCent(cent)) throw new Error(`Betrag ergibt keinen gültigen Wert in Minor Units: ${betrag}`);
  return cent;
}

/**
 * Wer war die Gegenseite?
 *
 * Bei Kartenumsätzen nennt die Bank den Händler getrennt — das ist die Gegenpartei. Bei
 * Lastschriften und Überweisungen gibt es kein Händlerfeld, und der Name steckt im
 * Beschreibungstext. Ihn dort zu lassen und die Gegenpartei leer zu melden wäre die
 * schlechtere Wahl: die Kategorie-Erkennung arbeitet auf der Gegenpartei, und ein leeres
 * Feld nimmt ihr genau bei den wiederkehrenden Buchungen die Grundlage.
 */
function gegenpartei(t: Transaction): string {
  return (t.merchant?.name ?? "").trim() || t.description.trim();
}

/**
 * Eine Buchung der Bank → eine Zeile für den Import.
 *
 * `bookingDate` wird zum Buchungstag, `purchaseDate` zur Valuta. Fachlich ist die Valuta
 * die Wertstellung und nicht der Kauftag — aber von den beiden Daten, die diese Bank
 * liefert, steht der Kauftag ihr am nächsten, und beide zu verlieren wäre schlimmer:
 * sie liegen mehrere Tage auseinander und fallen über Monatsgrenzen.
 */
export function zuRohUmsatz(t: Transaction, konto?: Account): RohUmsatz {
  return {
    buchungstag: t.bookingDate,
    valuta: t.purchaseDate || undefined,
    betrag: betragZuCent(t.amount, t.currency || "EUR"),
    waehrung: t.currency || "EUR",
    gegenpartei: gegenpartei(t),
    verwendungszweck: t.description.trim(),
    kontoIban: konto?.iban || undefined,
    kontoName: konto?.productLabel || undefined,
    // Die Sprache der Quelle, absichtlich nicht in ein eigenes Vokabular übersetzt.
    umsatzart: t.type,
    // Nur Kartenumsätze tragen eine Kennung; bei den übrigen ist das Feld leer. Ein
    // leerer String sähe aus wie ein Wert und wäre bei JEDER solchen Buchung derselbe —
    // als Dedup-Schlüssel wäre das verheerend.
    nativeId: t.id?.trim() || undefined,
    kategorieHinweis: t.merchant?.category?.trim() || undefined,
    // Diese Bank kennt keine eigenen Gegenkonten und markiert deshalb nichts als
    // Umbuchung. Die Tilgung per Lastschrift IST fachlich eine — sie kommt aber vom
    // Girokonto einer anderen Bank, und ob es unseres ist, entscheidet der Abgleich
    // später, nicht diese Übersetzung.
    istUmbuchung: false,
    quelle: HANSEATIC_QUELLE,
  };
}

/**
 * Alle Buchungen eines Abrufs → das kanonische Import-Ergebnis.
 *
 * **Vormerkungen fliegen raus.** Eine nicht gebuchte Zeile kann noch kippen, und beim
 * Buchen vergibt die Bank eine andere Kennung — importiert man sie, steht dieselbe
 * Zahlung nach dem nächsten Abruf zweimal da, ohne dass die Dublettenerkennung sie
 * verbinden könnte. Sie verschwinden nicht stillschweigend: ihre Anzahl steht in den
 * Warnungen, damit der Unterschied zwischen „nichts da" und „noch nicht gebucht"
 * sichtbar bleibt.
 *
 * Einzelne kaputte Zeilen brechen den Lauf nicht ab, sondern werden gemeldet — dieselbe
 * Regel wie bei den Datei-Importen: der Nutzer soll das Gesamtbild sehen.
 */
export function zuImportErgebnis(
  buchungen: readonly Transaction[],
  konto?: Account,
  heuteIso?: string,
): ImportErgebnis {
  const umsaetze: RohUmsatz[] = [];
  const warnungen: string[] = [];
  let vorgemerkt = 0;
  let zukuenftig = 0;

  for (const t of buchungen) {
    if (!t.booked) {
      vorgemerkt++;
      continue;
    }
    // Diese Bank vergibt Buchungsdaten, die in der Zukunft liegen — eine heute
    // veranlasste Ueberweisung traegt den Buchungstag von morgen. Sie wird UEBERNOMMEN,
    // denn die Bank hat sie bereits im Saldo; wer sie weglaesst, erzeugt eine Differenz,
    // die niemand erklaeren kann. Gezaehlt wird sie trotzdem: eine Buchung, die noch
    // nicht stattgefunden hat, soll man sehen, bevor man sich ueber sie wundert.
    if (heuteIso && t.bookingDate > heuteIso) zukuenftig++;
    try {
      umsaetze.push(zuRohUmsatz(t, konto));
    } catch (e) {
      warnungen.push(
        `Zeile vom ${t.bookingDate} übersprungen: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (zukuenftig > 0) {
    warnungen.push(
      zukuenftig === 1
        ? "Eine Buchung trägt ein Buchungsdatum in der Zukunft — die Bank führt sie bereits im Saldo."
        : `${zukuenftig} Buchungen tragen ein Buchungsdatum in der Zukunft — die Bank führt sie bereits im Saldo.`,
    );
  }

  if (vorgemerkt > 0) {
    warnungen.push(
      vorgemerkt === 1
        ? "Eine Vormerkung wurde nicht übernommen — sie ist noch nicht gebucht."
        : `${vorgemerkt} Vormerkungen wurden nicht übernommen — sie sind noch nicht gebucht.`,
    );
  }

  return { quelle: HANSEATIC_QUELLE, umsaetze, warnungen };
}
