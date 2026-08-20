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
// Geprüft wird ein bewusst KLEINER, dafür eindeutiger Satz von Merkmalen: Kontostände,
// Budgetbeträge, Anker, IBANs, Personennamen und Bankzugänge. Nicht geprüft werden die
// Beträge einzelner Buchungen — „12,50" steht in jeder zweiten Fixture, und ein Wächter,
// der ständig grundlos anschlägt, wird abgeschaltet.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";

const WURZEL = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

/**
 * Die echte Datenbank — read-only gelesen, nie geschrieben.
 *
 * Der WAL-Stand fehlt dabei (sql.js liest nur die Hauptdatei), und das ist hier egal:
 * frisch geschriebene Zeilen können noch nicht in einem versionierten Kommentar stehen.
 */
const DB_PFAD = join(
  homedir(),
  "Library/Application Support/de.netmechanics.moneymanager/moneymanager.db",
);

async function merkmale(): Promise<string[]> {
  if (!existsSync(DB_PFAD)) return [];
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  const db = new SQL.Database(readFileSync(DB_PFAD));
  const werte = new Set<string>();

  function frage(sql: string): unknown[] {
    try {
      const r = db.exec(sql);
      return r.length ? r[0].values.flat() : [];
    } catch {
      return []; // Tabelle oder Spalte gibt es (noch) nicht — dann eben nichts zu prüfen.
    }
  }

  // Beträge: als Zahl und in beiden Schreibweisen, in denen sie in Prosa landen.
  for (const roh of [
    ...frage("SELECT kontostand FROM zahlungskonto"),
    ...frage("SELECT betrag FROM budget"),
    ...frage("SELECT betrag FROM kontostand_anker"),
    ...frage("SELECT sum(betrag) FROM ist_buchung GROUP BY konto_id"),
  ]) {
    const cent = Number(roh);
    // Kleinbeträge und glatte Zehner sind zu unspezifisch: „0,00", „10,00" oder „100,00"
    // stehen in jeder zweiten Fixture und sagen über niemanden etwas aus.
    if (!Number.isFinite(cent) || Math.abs(cent) < 1000 || cent % 1000 === 0) continue;
    const euro = Math.trunc(Math.abs(cent) / 100);
    const rest = String(Math.abs(cent) % 100).padStart(2, "0");
    werte.add(`${euro},${rest}`); // [Betrag]
    werte.add(`${euro.toLocaleString("de-DE")},${rest}`); // [Betrag]
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

  db.close();
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
  it("stehen in keiner versionierten Datei", async () => {
    const gesucht = await merkmale();
    if (gesucht.length === 0) return; // keine Datenbank — nichts zu schützen

    const bestand = textbestand();
    const funde: string[] = [];
    for (const { datei, inhalt } of bestand) {
      // Der Wächter selbst darf die Merkmale natürlich zur Laufzeit halten.
      if (datei.endsWith("privatsphaere.test.ts")) continue;
      for (const wert of gesucht) {
        if (inhalt.includes(wert)) funde.push(`${datei}: „${wert}"`);
      }
    }

    expect(
      funde,
      `Aus dem echten Bestand steht etwas im Repo:\n  ${funde.join("\n  ")}\n` +
        "Ersetze es durch eine Beschreibung ohne Zahl — die Begründung trägt auch ohne Beleg.",
    ).toEqual([]);
  });

  it("enthält nur ausdrücklich freigegebene IBANs", () => {
    // Die EIGENEN IBANs fängt schon die Prüfung oben ab, solange sie am Konto hinterlegt
    // sind. Diese hier greift eine Stufe früher: jede IBAN-förmige Zeichenkette, die
    // nicht bewusst freigegeben wurde, schlägt an — auch eine fremde, auch eine, die
    // niemand mehr zuordnen kann.
    //
    // Die Prüfziffer taugt NICHT zur Unterscheidung: die erfundenen Beispiele unten sind
    // rechnerisch gültig, sonst kämen sie durch `ibanGueltig` nicht durch. „Echt oder
    // erfunden" ist eine Entscheidung, keine Rechnung — deshalb eine Liste, die man
    // bewusst erweitert.
    const FREIGEGEBEN = [
      "[entfernt]", // das Beispiel aus der IBAN-Dokumentation, überall zitiert
      "[entfernt]", // öffentliche Testkontoverbindung
      "[entfernt]", // öffentliche Testkontoverbindung
      "DE15200000049876543210", // erfunden, für den Abruf-Fake
      "DE00000000000000000000", // Nullwert für Prüfungen
      "[entfernt]", // dasselbe Beispiel mit absichtlich falscher Prüfziffer
    ];
    const muster = /\bDE\d{2}[ ]?(?:\d{4}[ ]?){4}\d{2}\b/g;

    const funde: string[] = [];
    for (const { datei, inhalt } of textbestand()) {
      if (datei.endsWith("privatsphaere.test.ts")) continue;
      for (const treffer of inhalt.match(muster) ?? []) {
        const iban = treffer.replace(/ /g, "");
        if (!FREIGEGEBEN.includes(iban)) funde.push(`${datei}: ${iban}`);
      }
    }

    expect(
      funde,
      `Nicht freigegebene IBANs:\n  ${funde.join("\n  ")}\n` +
        "Ist sie erfunden, trag sie oben ein. Ist sie echt, nimm sie raus.",
    ).toEqual([]);
  });
});
