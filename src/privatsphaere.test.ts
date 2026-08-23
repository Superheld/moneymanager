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
// Geprüft wird ein bewusst KLEINER, dafür eindeutiger Satz von Merkmalen: Kontostände,
// Budgetbeträge, Anker, IBANs, Personennamen und Bankzugänge. Nicht geprüft werden die
// Beträge einzelner Buchungen — „12,50" steht in jeder zweiten Fixture, und ein Wächter,
// der ständig grundlos anschlägt, wird abgeschaltet.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZEL = join(import.meta.dirname, "..");

/**
 * Die echte Datenbank — read-only gelesen, nie geschrieben.
 *
 * Gelesen wird über das `sqlite3`-Kommando, NICHT über sql.js. Der Grund ist derselbe,
 * vor dem CLAUDE.md bei Kopien warnt: die Datenbank läuft im WAL-Modus, und sql.js liest
 * nur die Hauptdatei. Der erste Anlauf dieses Wächters tat genau das — und übersah
 * deshalb die ganze Anker-Tabelle samt der Kontostände darin, die zur selben Stunde in
 * zwei Testdateien standen.
 *
 * Und **nicht** mit `-readonly`: solange die App läuft, hält sie die Datenbank, und ein
 * read-only-Zugriff scheitert dann mit „unable to open database file" — er darf die
 * `-shm`-Datei nicht anlegen, die der WAL-Modus braucht. `PRAGMA query_only=ON` öffnet
 * normal und verbietet trotzdem jedes Schreiben.
 *
 * Beides zusammen ist die eigentliche Lehre: ein Wächter, der die halbe Datenbank nicht
 * sieht oder sie gar nicht aufbekommt, ist schlimmer als keiner — er beruhigt. Deshalb
 * unterscheidet er unten hart zwischen „keine Datenbank da" (nichts zu prüfen) und
 * „Datenbank da, aber nicht lesbar" (Abbruch).
 */
const DB_PFAD = join(
  homedir(),
  "Library/Application Support/de.netmechanics.moneymanager/moneymanager.db",
);

/** Gibt es das `sqlite3`-Kommando überhaupt? Ohne es kann hier nichts geprüft werden. */
function sqliteVorhanden(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function merkmale(): string[] {
  if (!existsSync(DB_PFAD) || !sqliteVorhanden()) return [];
  const werte = new Set<string>();
  const banken = JSON.parse(readFileSync(join(WURZEL, "public/bankenliste.json"), "utf8"));
  const bankNamen = new Set<string>(
    (Object.values(banken).find(Array.isArray) as { name: string }[]).map((b) => b.name),
  );

  function frage(sql: string, mussGehen = false): string[] {
    try {
      return execFileSync("sqlite3", ["-cmd", "PRAGMA query_only=ON", DB_PFAD, sql], {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
    } catch (e) {
      // Eine Tabelle, die es (noch) nicht gibt, ist in Ordnung — eine Datenbank, die sich
      // nicht öffnen lässt, nicht. Sonst liefe der Wächter grün, ohne etwas gesehen zu
      // haben, und das ist der eine Fehler, den er sich nicht leisten darf.
      if (mussGehen) {
        throw new Error(
          `Die Datenbank ist da, lässt sich aber nicht lesen — der Wächter hat NICHTS geprüft.\n${String(e).slice(0, 200)}`,
        );
      }
      return [];
    }
  }

  // Probeabfrage: geht die Datenbank überhaupt auf?
  frage("SELECT count(*) FROM sqlite_master", true);

  // Beträge: als Zahl und in beiden Schreibweisen, in denen sie in Prosa landen.
  for (const roh of [
    ...frage("SELECT kontostand FROM zahlungskonto"),
    ...frage("SELECT betrag_pro_monat FROM budget"),
    ...frage("SELECT betrag FROM kontostand_anker"),
    ...frage("SELECT sum(betrag) FROM ist_buchung GROUP BY konto_id"),
    // Depots: der Gesamtwert und die Werte der einzelnen Positionen. Ergänzt am
    // 2026-08-21, weil genau dieser Weg offen war — ein Depotwert aus dem echten Bestand
    // stand als Erwartung in einem Screen-Test, und der Wächter sah ihn nicht. Ein Wert
    // ist ein Wert, gleich in welcher Tabelle er steht.
    ...frage("SELECT gesamtwert FROM depotwert"),
    ...frage("SELECT wert FROM depotposition"),
  ]) {
    const cent = Number(roh);
    // Kleinbeträge und glatte Zehner sind zu unspezifisch: „0,00", „10,00" oder „100,00"
    // stehen in jeder zweiten Fixture und sagen über niemanden etwas aus.
    if (!Number.isFinite(cent) || Math.abs(cent) < 1000 || cent % 1000 === 0) continue;
    const euro = Math.trunc(Math.abs(cent) / 100);
    const rest = String(Math.abs(cent) % 100).padStart(2, "0");
    werte.add(`${euro},${rest}`); //  1234,56
    werte.add(`${euro.toLocaleString("de-DE")},${rest}`); //  1.234,56
    werte.add(String(cent)); // und die Rohform in Cent, wie sie in Fixtures steht
  }

  // Empfänger, Vertragsanbieter und Gläubiger-IDs — das, was verrät, WO jemand einkauft.
  //
  // Mit Ausnahmeliste, und die ist der Grund, warum diese Gruppe lange gefehlt hat:
  // hunderte Empfängernamen sind Allerweltswörter („Tanken", „Friseur", „Urlaub"), die in
  // jedem zweiten Test stehen. Ein Wächter, der darauf anschlägt, wird abgeschaltet.
  // Deshalb hier: alles meldet sich, ausser was einmal bewusst freigegeben wurde.
  const ALLERWELT = new Set([
    "Abbuchung", "Action", "Baecker", "Bargeld", "Friseur", "Geschenk", "Girokonto",
    "Gutschrift", "Retour", "Tanken", "Tankstelle", "Transact", "Urlaub", "Veranstaltung",
    "Verrechnungskonto", "Tagesgeldkonto", "Kreditkarte",
  ]);
  for (const roh of [
    ...frage("SELECT DISTINCT gegenpartei FROM umsatz WHERE length(gegenpartei) >= 6"),
    ...frage("SELECT DISTINCT anbieter FROM vertrag WHERE length(anbieter) >= 6"),
    ...frage("SELECT DISTINCT glaeubiger_id FROM umsatz WHERE glaeubiger_id IS NOT NULL"),
    ...frage("SELECT DISTINCT mandatsreferenz FROM umsatz WHERE length(mandatsreferenz) >= 8"),
  ]) {
    const wert = String(roh ?? "").trim();
    if (wert.length < 6 || ALLERWELT.has(wert)) continue;
    // Namen echter Banken stehen ohnehin in der öffentlichen DK-Liste im Repo — auch als
    // Bestandteil („Sparkasse" steckt in „Sparkasse Essen").
    if ([...bankNamen].some((n) => n.includes(wert))) continue;
    werte.add(wert);
  }

  // Zeichenketten: alles, was eine Person oder ein Konto benennt.
  for (const roh of [
    ...frage("SELECT iban FROM zahlungskonto WHERE iban IS NOT NULL AND iban <> ''"),
    ...frage("SELECT name FROM person"),
    ...frage("SELECT bezeichnung FROM bankzugang"),
    ...frage("SELECT blz FROM bankzugang"),
    ...frage("SELECT benutzer FROM bankzugang"),
  ]) {
    const wert = String(roh ?? "").trim();
    // Zu kurze Werte („EUR", ein Vorname mit drei Buchstaben) träfen überall.
    if (wert.length >= 5) werte.add(wert);
  }

  // Kam wirklich etwas heraus? Eine leere Merkmalsliste sieht aus wie „alles sauber",
  // heisst aber „nichts geprüft" — genau der Zustand, in dem dieser Wächter zweimal
  // grün lief, während die Daten im Repo standen.
  if (werte.size === 0) {
    throw new Error(
      "Aus der Datenbank kam kein einziges Merkmal — entweder ist sie leer, oder die " +
        "Abfragen passen nicht mehr zum Schema. Der Wächter hat nichts geprüft.",
    );
  }
  return [...werte];
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

const AUSNAHMEN: readonly Ausnahme[] = [];

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
