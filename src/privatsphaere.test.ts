// Wächter: Aus dem echten Bestand darf NICHTS in einer versionierten Datei stehen.
//
// Das Repo ist öffentlich. Was hier hineingerät, ist draußen — auch wenn es später
// gelöscht wird, denn geklont und indiziert ist es dann längst. Es ist zweimal passiert:
// eine echte IBAN lag monatelang in zwei Import-Tests, ein Personenname in einer Fixture.
// Beim Aufräumen am 2026-08-20 kam heraus, dass es nicht bei Tests blieb — Kontostände,
// Budgetbeträge und Buchungszahlen des Haushalts standen in Kommentaren, in CLAUDE.md und
// im Changelog, weil „am echten Bestand gemessen" die überzeugendste Begründung ist.
//
// **Die Idee dieses Tests ist dieselbe wie bei `produktId.test.ts`: er kennt die Daten
// nicht, sondern liest sie zur Laufzeit aus der echten Datenbank.** Damit steht das, wovor
// er schützt, nirgends im Repo — der Wächter selbst wäre sonst das Leck. Ohne Datenbank
// (frischer Klon, CI, anderer Rechner) hat er nichts zu prüfen und ist still zufrieden.
// Er ersetzt deshalb kein Nachdenken; er fängt das ab, woran man nicht gedacht hat.
//
// **Ersetzen reicht nicht — es muss ANONYMISIEREN.** Ein erfundener Name, der die Branche
// durchscheinen lässt, verrät dasselbe wie der echte: wer einen Streamingdienst durch
// einen Fantasienamen ersetzt, dem man den Streamingdienst ansieht, hat den Namen
// getauscht und die Aussage behalten. Dasselbe gilt für die Kategorie daneben. Erfundene Werte sind deshalb
// SEKTORNEUTRAL: „Kesselmann", „Vibora", „Ohlert" lassen keinen Rückschluss zu, weder für
// sich noch in Kombination mit ihrer Kategorie. Und sie gelten je TESTFALL: derselbe
// Fantasiename in siebenundzwanzig Tests wird selbst zum Muster, das Fälle verbindet, die
// nichts miteinander zu tun haben. Gebraucht wird Gleichheit nur innerhalb eines Falls.
// Dieser Wächter kann beides nicht prüfen — er findet nur den Originalwert. Der Rest ist
// Handarbeit.
//
// **Die Beträge EINZELNER Buchungen sind seit 2026-08-24 dabei**, und das war vorher
// ausdrücklich anders begründet: „12,50 steht in jeder zweiten Fixture, und ein Wächter,
// der ständig grundlos anschlägt, wird abgeschaltet." Das stimmte — nur lag es nicht an
// den Beträgen, sondern an der SCHREIBWEISE, in der man nach ihnen sucht.
//
// Nachgemessen: alle drei Formen über den ganzen Baum ergaben Treffer in fünfzig Dateien,
// darunter `Cargo.lock` und `package-lock.json`. Unbrauchbar. Nur die Cent-Rohform allein
// war für über achtzig Prozent davon verantwortlich: eine vierstellige Zahl ohne
// Trennzeichen ist in einer Codebasis kein Betrag, sondern ein FinTS-Rückmeldungscode,
// eine Token-Laufzeit in Sekunden, eine Portnummer, eine Jahreszahl.
//
// In der Euro-Schreibweise blieb ein Bruchteil übrig — und darunter ein echter Fund, der
// zwei Monate im öffentlichen Repo stand: die Toleranz im Monatsausblick war mit der
// eigenen Miete begründet, Planbetrag und gebuchter Betrag im Klartext, und dieselben
// Zahlen lagen als Testdaten daneben. Genau der Fall, für den es diesen Wächter gibt.
//
// Daraus die Regel unten: die Euro-Schreibweisen immer, die Cent-Rohform erst ab dreistellig
// (100 EUR). Was darunter liegt, findet die Euro-Form ohnehin, sobald es als Betrag
// GESCHRIEBEN wird — und nur dann ist es ein Beleg.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZEL = join(import.meta.dirname, "..");

/**
 * Die Merkmale des echten Bestands — aus `scripts/bestandsmerkmale.mjs`.
 *
 * Die Abfragen stehen dort und nicht hier, weil `.githooks/pre-push` DIESELBEN braucht:
 * dieser Test prüft den Arbeitsbaum, der Hook die ausgehenden Commit-Texte. Zwei Listen
 * für dieselbe Sache driften, und sie haben es getan — als `budget.betrag_pro_monat`
 * einer Reihe wich, zog der Test mit und der Hook nicht.
 *
 * Aufgerufen wird das Skript als KOMMANDO und nicht als Import: `scripts/` liegt
 * ausserhalb von `tsconfig.include`, und `scripts/privacy-guard.test.ts` macht es
 * nebenan genauso. Ein Merkmal je Zeile.
 */
function merkmale(): string[] {
  const skript = join(WURZEL, "scripts/bestandsmerkmale.mjs");
  try {
    return execFileSync("node", [skript], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    // Das Skript gibt eine leere Liste zurück, wenn es nichts zu prüfen GIBT (kein
    // Datenbestand, frischer Klon, CI). Bricht es dagegen ab, hat es etwas gefunden, das
    // es nicht lesen konnte — und dann darf hier nichts stillschweigend grün werden.
    const meldung = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
    throw new Error(`Die Merkmale liessen sich nicht ermitteln:\n${meldung.slice(0, 400)}`);
  }
}

function versionierteDateien(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/**
 * Fremde Datenbestände, die ohnehin öffentlich sind.
 *
 * Die Bankenliste der Deutschen Kreditwirtschaft enthält ALLE 1735 Institute mit Name und
 * BLZ — darunter zwangsläufig auch die eigene Bank. Dass sie dort steht, sagt über
 * niemanden etwas aus; ohne diese Ausnahme wäre der Wächter dauerhaft rot und damit wertlos.
 */
const FREMDE_BESTAENDE = ["public/bankenliste.json"];

/**
 * Begründete Einzelausnahmen — für Werte, die im Repo stehen MÜSSEN.
 *
 * Es gibt sie: sobald das Repo irgendwo spezifisch wird, kann ein Wort unvermeidlich
 * werden, das auch im eigenen Bestand steht. Ein Institutsname ist der Regelfall — er
 * benennt kein Konto und keinen Betrag, steht aber als Gegenpartei in den Umsätzen, und
 * wer die Anbindung an genau dieses Institut baut, kann ihn nicht umgehen. Für Institute
 * aus der DK-Liste erledigt das der `bankNamen`-Filter oben; für alle anderen gab es
 * bisher keinen Weg.
 *
 * Ohne einen solchen Weg bliebe der Wächter dauerhaft rot — und ein dauerhaft roter
 * Wächter wird mit `--no-verify` umgangen. Danach prüft er GAR nichts mehr. Diese Liste
 * ist der schmale Ausweg, der ihn am Leben hält, und sie ist absichtlich unbequem.
 *
 * Drei Dinge halten sie schmal, alle drei ausführbar geprüft:
 *
 *  • **Ein Grund ist Pflicht.** Kein Feld zum Leerlassen — ein Eintrag ohne tragende
 *    Begründung lässt den Test fehlschlagen. Wer den Grund nicht formulieren kann, hat
 *    keine Ausnahme, sondern ein Leck.
 *  • **Sie gilt nur, wo sie muss.** `nurIn` nennt die Pfade; global gibt es nicht.
 *    Derselbe Wert in einem Screen-Test schlägt weiterhin an.
 *  • **Sie stirbt, wenn sie nichts mehr tut.** Eine Ausnahme, die nirgends mehr greift,
 *    lässt den Test fehlschlagen — dasselbe Prinzip wie die ALTLAST in
 *    `architektur.test.ts`. Sonst sammelt sich hier über Jahre eine Liste blinder
 *    Flecken, die niemand mehr nachprüft.
 */
interface Ausnahme {
  /** Der Wert, der trotz Vorkommen im echten Bestand im Repo stehen darf. */
  readonly wert: string;
  /** Pfad-Präfixe, für die die Freigabe gilt. Nie leer — es gibt keine globale Ausnahme. */
  readonly nurIn: readonly string[];
  /** Warum das kein Bestandsdatum ist. Ein Satz, der vor dem nächsten Leser trägt. */
  readonly grund: string;
}

const AUSNAHMEN: readonly Ausnahme[] = [
  {
    wert: "Hanseatic Bank",
    // Zuerst standen hier einzelne Dateien, und die Liste wuchs mit jedem Schritt:
    // Sprachdatei, Doku, Notizen, Adapter. Vier Eintraege fuer dieselbe Sache sind kein
    // enger Geltungsbereich mehr, sondern eine Liste, die niemand mehr liest. Jetzt sind
    // es die beiden Verzeichnisse, die zusammen DIE ANBINDUNG an dieses Institut sind —
    // dort ist sein Name unvermeidlich. Ueberall sonst schlaegt er weiter an, und genau
    // das ist der Zweck: in einem Screen-Test hat er nichts zu suchen.
    nurIn: [
      "src/i18n/i18n.ts",
      "src/adapters/hanseatic/",
      "src/vendor/hanseatic-bank/",
    ],
    grund:
      "Institutsname, kein Bestandsdatum — er benennt weder ein Konto noch einen Betrag. " +
      "Er steht zugleich als Gegenpartei in den eigenen Umsaetzen und unvermeidlich in der " +
      "Beschriftung des Schalters, im Adapter und in der eingebetteten Doku. " +
      "Fuer Institute aus der DK-Liste erledigt das der bankNamen-Filter oben; diese Bank " +
      "bietet kein FinTS an und steht deshalb nicht darin.",
  },
];

/** Ist dieser Fund an dieser Stelle bewusst freigegeben? */
function freigegeben(
  datei: string,
  wert: string,
  liste: readonly Ausnahme[] = AUSNAHMEN,
): boolean {
  return liste.some(
    (a) => a.wert === wert && a.nurIn.length > 0 && a.nurIn.some((p) => datei.startsWith(p)),
  );
}

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
  it("stehen in keiner versionierten Datei", () => {
    const gesucht = merkmale();
    if (gesucht.length === 0) return; // keine Datenbank — nichts zu schützen

    const bestand = textbestand();
    const funde: string[] = [];
    for (const { datei, inhalt } of bestand) {
      // Der Wächter selbst darf die Merkmale natürlich zur Laufzeit halten.
      if (datei.endsWith("privatsphaere.test.ts")) continue;
      for (const wert of gesucht) {
        // Reine Zahlen nur an der Wortgrenze: „15000" steckt sonst in „150000", und ein
        // Wächter mit Fehlalarmen wird umgangen statt gelesen.
        const trifft = /^[\d.,]+$/.test(wert)
          ? new RegExp(`(^|[^\\d])${wert.replace(/[.]/g, "\\.")}([^\\d]|$)`).test(inhalt)
          : inhalt.includes(wert);
        if (trifft && !freigegeben(datei, wert)) funde.push(`${datei}: „${wert}"`);
      }
    }

    expect(
      funde,
      `Aus dem echten Bestand steht etwas im Repo:\n  ${funde.join("\n  ")}\n` +
        "Ersetze es durch eine Beschreibung ohne Zahl — die Begründung trägt auch ohne Beleg.",
    ).toEqual([]);
  });

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

describe("Begründete Ausnahmen", () => {
  it("tragen alle einen Geltungsbereich und einen Grund", () => {
    for (const a of AUSNAHMEN) {
      expect(
        a.nurIn.length,
        `Die Ausnahme „${a.wert}" gilt nirgends: „nurIn" ist leer. Eine Ausnahme ohne ` +
          "Geltungsbereich wäre eine globale — die gibt es hier bewusst nicht.",
      ).toBeGreaterThan(0);
      expect(
        a.grund.trim().length,
        `Die Ausnahme „${a.wert}" trägt keinen Grund. Wer nicht in einem Satz sagen kann, ` +
          "warum dieser Wert kein Bestandsdatum ist, hat keine Ausnahme, sondern ein Leck.",
      ).toBeGreaterThanOrEqual(30);
    }
  });

  it("greifen nur dort, wo sie angemeldet sind", () => {
    const probe: Ausnahme[] = [
      {
        wert: "Beispielwert",
        nurIn: ["src/vendor/beispiel/"],
        grund: "Nur für diesen Test — prüft, dass der Geltungsbereich wirklich begrenzt.",
      },
    ];
    expect(freigegeben("src/vendor/beispiel/README.md", "Beispielwert", probe)).toBe(true);
    // Derselbe Wert, andere Stelle: schlägt weiterhin an. Das ist der Punkt.
    expect(freigegeben("src/adapters/ui/Irgendein.test.tsx", "Beispielwert", probe)).toBe(false);
    expect(freigegeben("src/vendor/beispiel/README.md", "AndererWert", probe)).toBe(false);
    // Ohne Geltungsbereich gibt es keine Freigabe, auch nicht versehentlich.
    const ohne: Ausnahme[] = [{ wert: "X", nurIn: [], grund: "leer" }];
    expect(freigegeben("src/beliebig.ts", "X", ohne)).toBe(false);
  });

  it("sterben, wenn sie nichts mehr freigeben", () => {
    if (AUSNAHMEN.length === 0) return; // noch keine — nichts zu prüfen
    const gesucht = new Set(merkmale());
    if (gesucht.size === 0) return; // keine Datenbank, siehe oben
    const bestand = textbestand();

    const tot = AUSNAHMEN.filter(
      (a) =>
        !gesucht.has(a.wert) ||
        !bestand.some(({ datei, inhalt }) => freigegeben(datei, a.wert) && inhalt.includes(a.wert)),
    ).map((a) => a.wert);

    expect(
      tot,
      `Diese Ausnahmen geben nichts mehr frei:\n  ${tot.join("\n  ")}\n` +
        "Lösch sie. Eine Ausnahme, die nichts mehr tut, ist nur noch ein blinder Fleck.",
    ).toEqual([]);
  });
});
