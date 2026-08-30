// Wächter über die Formen, die im öffentlichen Repo nichts zu suchen haben.
//
// Das Repo ist öffentlich. Was hier hineingerät, ist draußen — auch wenn es später
// gelöscht wird, denn geklont und indiziert ist es dann längst.
//
// **Bis 2026-08-30 stand hier ein zweiter Wächter, und der ist absichtlich weg.** Er las
// den ECHTEN Bestand zur Laufzeit und suchte dessen Werte im Arbeitsbaum; der
// `pre-push`-Hook tat dasselbe mit den ausgehenden Commit-Texten. Er hat gefunden, wofür
// er gebaut war — eine IBAN in zwei Import-Tests, Kontostände in Kommentaren, eine mit der
// eigenen Miete begründete Toleranz. Was er gekostet hat, wog am Ende schwerer:
//
//  • Seit der Bestand verschlüsselt ist, kam er nur noch über den **Datenschlüssel** an
//    seine Werte — als Wiederherstellungscode im Klartext neben der Datenbank. Ein
//    Wächter, der einen Generalschlüssel verlangt, nimmt der Verschlüsselung genau das,
//    wofür sie gebaut wurde.
//  • Fehlte die Datei, war `npm test` rot und **jeder** Push blockiert. Das traf nicht nur
//    den frischen Klon, sondern auch den Rechner, auf dem die Verschlüsselung eingeführt
//    wurde — dort in dem Moment, in dem sie griff, und still: ein Push, der nicht
//    stattfindet, sieht aus wie ein Tag ohne Push.
//  • Seine Voraussetzung ist entfallen: es liegen keine Echtdaten im Rohformat mehr in der
//    Entwicklung, und der Spielstand (`npm run seed`) ist eine eigene Umgebung mit
//    erfundenen Daten.
//
// **Was damit NICHT mehr geprüft wird, und das gehört hier hin statt in eine Fußnote:**
// alles, was keiner Form folgt — ein Empfängername, ein Verwendungszweck, eine
// Buchungszahl, ein Kontostand in Prosa. Der Muster-Guard (`scripts/privacy-guard.mjs`)
// kennt Formen, nicht Werte. Was er nicht sieht, ist ab jetzt **Handarbeit** und gehört,
// soweit es sich benennen lässt, in `.privacy-terms` (git-ignoriert, Vorlage:
// `.privacy-terms.example`) — dort greift der Muster-Guard es wieder auf.
//
// **Ersetzen reicht dabei nicht — es muss ANONYMISIEREN.** Ein erfundener Name, der die
// Branche durchscheinen lässt, verrät dasselbe wie der echte: wer einen Streamingdienst
// durch einen Fantasienamen ersetzt, dem man den Streamingdienst ansieht, hat den Namen
// getauscht und die Aussage behalten. Dasselbe gilt für die Kategorie daneben. Erfundene
// Werte sind deshalb SEKTORNEUTRAL: „Kesselmann", „Vibora", „Ohlert" lassen keinen
// Rückschluss zu, weder für sich noch in Kombination mit ihrer Kategorie. Und sie gelten
// je TESTFALL: derselbe Fantasiename in siebenundzwanzig Tests wird selbst zum Muster,
// das Fälle verbindet, die nichts miteinander zu tun haben. Gebraucht wird Gleichheit nur
// innerhalb eines Falls. Das prüft hier nichts nach, und es hat das auch vorher nicht —
// der alte Wächter fand nur den Originalwert.
//
// Was bleibt, ist die Regel, die kein Urteil braucht und keinen Schlüssel: eine IBAN im
// Repo darf zu keinem Konto der Welt gehören können.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZEL = join(import.meta.dirname, "..");

function versionierteDateien(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/**
 * Fremde Datenbestände, die ohnehin öffentlich sind.
 *
 * Die Bankenliste der Deutschen Kreditwirtschaft enthält ALLE Institute mit Name und BLZ —
 * darunter zwangsläufig auch die eigene Bank. Dass sie dort steht, sagt über niemanden
 * etwas aus; ohne diese Ausnahme wäre der Wächter dauerhaft rot und damit wertlos.
 */
const FREMDE_BESTAENDE = ["public/bankenliste.json"];

/** Inhalt aller versionierten Textdateien — einmal gelesen, dann durchsucht. */
function textbestand(): { datei: string; inhalt: string }[] {
  return versionierteDateien().flatMap((datei) => {
    if (FREMDE_BESTAENDE.includes(datei)) return [];
    const pfad = join(WURZEL, datei);
    try {
      if (statSync(pfad).size > 2_000_000) return []; // Icons und Ähnliches: kein Fließtext
      return [{ datei, inhalt: readFileSync(pfad, "utf8") }];
    } catch {
      return [];
    }
  });
}

describe("Daten aus dem echten Bestand", () => {
  it("verwendet nur Bankleitzahlen, die es nicht gibt", () => {
    // Die schärfere Regel, und sie braucht kein Urteil: eine IBAN mit einer BLZ, die in
    // der Liste der Deutschen Kreditwirtschaft NICHT vorkommt, kann zu keinem Konto der
    // Welt gehören. Eine mit einer echten BLZ kann es — und ob die Kontonummer dahinter
    // vergeben ist, weiß hier niemand.
    //
    // Vorher stand hier eine Freigabeliste aus Annahmen („das ist doch die
    // Beispiel-IBAN"). Sie hat genau das durchgelassen, wovor sie schützen sollte: vier
    // der sechs eingetragenen IBANs trugen die BLZ einer echten Bank — Commerzbank, DKB,
    // ING-DiBa —, darunter die, die am 2026-08-19 schon einmal als echte Kontoverbindung
    // aus `bankenliste.test.ts` entfernt worden war und in fünf anderen Testdateien
    // stehen geblieben ist.
    //
    // Wer eine Test-IBAN braucht: BLZ aus dem 999999xx-Bereich nehmen und die Prüfziffer
    // rechnen. Dann ist sie strukturell gültig und gehört trotzdem niemandem.
    //
    // **Dieser Fall ist seit dem Ausbau des Wert-Abgleichs der einzige hier — und der
    // einzige, der ohne den Datenschlüssel auskommt.** Er braucht keine Datenbank,
    // sondern eine Liste, die ohnehin im Repo liegt. Genau deshalb hat er überlebt.
    const banken = JSON.parse(readFileSync(join(WURZEL, "public/bankenliste.json"), "utf8"));
    const echteBlz = new Set<string>(
      (Object.values(banken).find(Array.isArray) as { blz: string }[]).map((b) => String(b.blz)),
    );

    const muster = /\bDE\d{2}[ ]?(?:\d{4}[ ]?){4}\d{2}\b/g;
    const funde: string[] = [];
    for (const { datei, inhalt } of textbestand()) {
      if (datei.endsWith("privatsphaere.test.ts")) continue;
      for (const treffer of inhalt.match(muster) ?? []) {
        const blz = treffer.replace(/ /g, "").slice(4, 12);
        if (echteBlz.has(blz)) funde.push(`${datei}: BLZ ${blz}`);
      }
    }

    expect(
      funde,
      `IBANs mit der Bankleitzahl einer ECHTEN Bank:\n  ${[...new Set(funde)].join("\n  ")}\n` +
        "Nimm eine BLZ, die es nicht gibt (999999xx), und rechne die Prüfziffer neu.",
    ).toEqual([]);
  });
});
