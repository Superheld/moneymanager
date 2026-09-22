// Bestands-Adapter — liest eine Datei `bestand-….json` dieser App wieder ein.
//
// **Ein Bestandsimport ist kein eigener Weg, sondern eine QUELLE.** Das ist die ganze
// Entscheidung hinter dieser Datei. Der Import hat bereits alles, was ein Wiedereinlesen
// braucht: Kontozuordnung, Dublettenprüfung, Inbox, Verbuchen. Ein zweiter Weg daneben —
// „Bestand wiederherstellen" — hätte jede dieser Fragen ein zweites Mal beantworten
// müssen, und zwei Antworten auf „steht das schon drin?" sind eine zu viel.
//
// Was daraus folgt, gehört benannt, weil es beim ersten Einlesen überrascht:
//
// - **Die Zeilen landen in der Inbox, nicht im Ledger.** Sie werden durchgesehen und
//   verbucht wie eine Bankdatei. Genau das ist die Zusicherung: nichts erscheint im Konto,
//   ohne dass jemand hingesehen hat.
// - **Die AUFTEILUNG einer Buchung kommt nicht mit.** Die Inbox kennt eine Zahlung, nicht
//   ihre Teile; eine geteilte Buchung käme als Gesamtbetrag herein, und die Teile wären
//   stillschweigend weg. Sie wird deshalb gezählt und gemeldet.
// - **Ein Umbuchungspaar kommt als zwei EINZELNE Zeilen.** Die Paarung (`transferId`)
//   entsteht beim Umbuchen und nicht beim Import; beide Beine stehen danach da und lassen
//   sich von Hand paaren. Auch das wird gemeldet.
//
// **Die Kategorie kommt als NAME herein** (`ExportBuchung.kategorie`, seit Fassung 5) und
// geht als `kategorieVorschlag` weiter — derselbe Weg, den Finanzgurus Vokabular nimmt.
// Die Id daneben bleibt ungenutzt: sie gilt nur in dem Bestand, aus dem die Datei stammt.

import type { Bestandsexport, ExportBuchung, ExportKonto } from "../../application";
import {
  adapterRegistrieren,
  type ImportErgebnis,
  type Quellenadapter,
  type RohUmsatz,
} from "../../application/import";

const ID = "bestand";

/**
 * Die Fassung, bis zu der diese App eine Datei deuten kann.
 *
 * Bewusst eine EIGENE Zahl und nicht `BESTANDSEXPORT_FASSUNG`: die eine sagt, was wir
 * schreiben, die andere, was wir lesen können. Sie sind heute gleich und dürfen
 * auseinanderlaufen — eine ältere Datei bleibt lesbar, eine neuere nicht.
 */
const HOECHSTE_FASSUNG = 5;

/** Wie viel vom Kopf der Datei angesehen wird, um sie zu erkennen. */
const KOPFLAENGE = 2048;

function text(datei: Uint8Array, laenge = datei.length): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(datei.subarray(0, laenge));
}

/**
 * Eine Zahl aus der Datei, oder `undefined`.
 *
 * `null` ist in dieser Datei die ausdrückliche Aussage „gibt es nicht" (siehe `leer()` im
 * Export) und muss deshalb dasselbe ergeben wie ein fehlendes Feld — nicht `0`.
 */
function zahl(wert: unknown): number | undefined {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : undefined;
}

/** Eine nicht-leere Zeichenkette, oder `undefined`. */
function wort(wert: unknown): string | undefined {
  return typeof wert === "string" && wert !== "" ? wert : undefined;
}

/**
 * Eine Zeile der Datei als RohUmsatz.
 *
 * Der Beleg ist die Quelle für alles, was die Bank gesagt hat; fehlt er, war die Buchung
 * von Hand erfasst. Dann bleibt die Gegenpartei leer und die Notiz wird zum
 * Verwendungszweck — eine von Hand erfasste Zahlung hat keinen anderen Text, und ihn
 * wegzulassen hiesse, eine Zeile ohne jede Beschreibung anzulegen.
 */
function alsRohUmsatz(b: ExportBuchung, konto: ExportKonto | undefined): RohUmsatz {
  const beleg = b.beleg;
  return {
    buchungstag: b.datum,
    valuta: wort(beleg?.valuta),
    betrag: b.betrag,
    waehrung: beleg?.waehrung ?? "EUR",
    gegenpartei: beleg?.gegenpartei ?? "",
    gegenparteiIban: wort(beleg?.gegenparteiIban),
    verwendungszweck: beleg?.verwendungszweck ?? b.notiz ?? "",
    kontoIban: wort(konto?.iban),
    kontoName: konto?.bezeichnung,
    glaeubigerId: wort(beleg?.glaeubigerId),
    mandatsreferenz: wort(beleg?.mandatsreferenz),
    umsatzart: wort(beleg?.umsatzart),
    buchungsschluessel: wort(beleg?.buchungsschluessel),
    zweckCode: wort(beleg?.zweckCode),
    endempfaenger: wort(beleg?.endempfaenger),
    bankBuchungscode: wort(beleg?.bankBuchungscode),
    strukturierteReferenz: wort(beleg?.strukturierteReferenz),
    sammelposten:
      beleg?.sammelposten && beleg.sammelposten.length > 0
        ? beleg.sammelposten.map((p) => ({
            betrag: zahl(p.betrag),
            gegenpartei: wort(p.gegenpartei),
            gegenparteiIban: wort(p.gegenparteiIban),
            endempfaenger: wort(p.endempfaenger),
            verwendungszweck: wort(p.verwendungszweck),
            zweckCode: wort(p.zweckCode),
            glaeubigerId: wort(p.glaeubigerId),
            mandatsreferenz: wort(p.mandatsreferenz),
            strukturierteReferenz: wort(p.strukturierteReferenz),
          }))
        : undefined,
    buchungsstand: wort(beleg?.buchungsstand),
    istStorno: beleg?.istStorno ?? undefined,
    originalBetrag: zahl(beleg?.originalBetrag),
    originalWaehrung: wort(beleg?.originalWaehrung),
    wechselkurs: zahl(beleg?.wechselkurs),
    gebuehrBetrag: zahl(beleg?.gebuehrBetrag),
    gebuehrWaehrung: wort(beleg?.gebuehrWaehrung),
    ruecklaufCode: wort(beleg?.ruecklaufCode),
    ruecklaufText: wort(beleg?.ruecklaufText),
    istUmbuchung: b.charakter === "Umschichtung",
    quelle: ID,
    // **Die Id der Buchung ist hier die native Id**, und sie taugt dafür: sie ist in der
    // Datei stabil und über alle ihre Zeilen eindeutig. Dieselbe Datei zweimal einzulesen
    // ist damit erkennbar, ohne dass irgendetwas geraten werden muss.
    nativeId: b.id,
    kategorieVorschlag: wort(b.kategorie),
  };
}

export const bestandsAdapter: Quellenadapter = {
  id: ID,
  name: "Bestandsexport dieser App (JSON)",

  /**
   * **Am Kopf erkannt, nicht am ganzen Inhalt.** Der Port verlangt eine billige Heuristik,
   * und sie ist hier verlässlich, weil wir die Datei selbst schreiben: `JSON.stringify`
   * behält die Reihenfolge der Felder, `fassung` und `personen` stehen also in den ersten
   * hundert Zeichen.
   *
   * `personen` ist dabei das entscheidende Wort. Eine Konfigurationsdatei trägt ebenfalls
   * `fassung` und `erzeugt` — wer nur danach sucht, hält sie für einen Bestand und liest
   * anschliessend null Zeilen aus einer Datei, die voll ist.
   */
  erkennt(datei: Uint8Array): boolean {
    const kopf = text(datei, KOPFLAENGE).trimStart();
    return kopf.startsWith("{") && kopf.includes('"fassung"') && kopf.includes('"personen"');
  },

  lies(datei: Uint8Array): ImportErgebnis {
    const warnungen: string[] = [];
    let roh: unknown;
    try {
      roh = JSON.parse(text(datei));
    } catch {
      return { quelle: ID, umsaetze: [], warnungen: ["Die Datei ist kein gültiges JSON."] };
    }

    const inhalt = roh as Partial<Bestandsexport>;
    if (typeof inhalt.fassung !== "number" || !Array.isArray(inhalt.buchungen)) {
      return {
        quelle: ID,
        umsaetze: [],
        warnungen: ["Das ist keine Bestandsdatei dieser App."],
      };
    }
    if (inhalt.fassung > HOECHSTE_FASSUNG) {
      return {
        quelle: ID,
        umsaetze: [],
        warnungen: [
          `Diese Datei hat Fassung ${inhalt.fassung}; gelesen werden bis zu ${HOECHSTE_FASSUNG}. ` +
            "Was darin steht, lässt sich hier nicht sicher deuten.",
        ],
      };
    }

    const konten = new Map((inhalt.konten ?? []).map((k) => [k.id, k]));
    const umsaetze: RohUmsatz[] = [];
    let ohneKonto = 0;
    let geteilt = 0;
    let gepaart = 0;
    let unbrauchbar = 0;

    for (const b of inhalt.buchungen) {
      // Datum und Betrag sind das Einzige, ohne das eine Zeile keine Zahlung mehr ist.
      // Eine kaputte Zeile lässt die Datei nicht scheitern — sie wird gezählt.
      if (typeof b?.datum !== "string" || typeof b?.betrag !== "number") {
        unbrauchbar++;
        continue;
      }
      const konto = konten.get(b.kontoId);
      if (!konto) ohneKonto++;
      if (b.aufteilungen && b.aufteilungen.length > 0) geteilt++;
      if (b.transferId) gepaart++;
      umsaetze.push(alsRohUmsatz(b, konto));
    }

    if (unbrauchbar > 0) {
      warnungen.push(`${unbrauchbar} Zeile(n) ohne Datum oder Betrag übersprungen.`);
    }
    if (ohneKonto > 0) {
      warnungen.push(
        `${ohneKonto} Zeile(n) zeigen auf ein Konto, das nicht in der Datei steht — ` +
          "ihr Zielkonto musst du selbst wählen.",
      );
    }
    if (geteilt > 0) {
      warnungen.push(
        `${geteilt} Buchung(en) sind aufgeteilt. Sie kommen mit ihrem GESAMTBETRAG herein; ` +
          "die Aufteilung musst du neu anlegen.",
      );
    }
    if (gepaart > 0) {
      warnungen.push(
        `${gepaart} Buchung(en) gehören zu einer Umbuchung. Beide Beine kommen einzeln ` +
          "herein und sind danach nicht mehr gepaart.",
      );
    }

    return { quelle: ID, umsaetze, warnungen };
  },
};

// Selbst-Registrierung: Import dieses Moduls macht den Adapter bekannt.
adapterRegistrieren(bestandsAdapter);
