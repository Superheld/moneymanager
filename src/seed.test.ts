// Der Waechter ueber den Spielstand.
//
// Ein Seed verrottet still: die Migrationskette wandert, seine INSERTs bleiben stehen,
// und der Fehler zeigt sich erst, wenn jemand ihn benutzen will — also genau dann, wenn
// man eigentlich etwas anderes vorhatte. Deshalb faehrt dieser Test ihn bei jedem
// `npm test` gegen die AKTUELLE Kette.
//
// Was er findet: eine geloeschte oder umbenannte Spalte (der INSERT wirft), einen
// verwaisten Verweis (`foreign_key_check`), eine Tabelle, die leer bleibt, weil ein
// Einfuegen still danebengeht, und eine Aufteilung, deren Teile nicht mehr auf ihren
// Betrag summieren.
//
// Was er NICHT findet: ob die Daten fachlich SINNVOLL sind. Dass ein Budget
// ueberschritten wird oder ein Verlauf plausibel aussieht, sieht nur ein Mensch — dafuer
// ist der Spielstand da, nicht dieser Test.

import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./adapters/persistence/migrations";
import { seedEinspielen } from "./testwerkzeug/seedDaten";

/**
 * Ein FESTER Stichtag. Mit `new Date()` pruefte der Test am Monatsersten etwas anderes
 * als am Monatsletzten — und die eine Abweichung, die dabei auffiele, waere ein
 * Fehlschlag ohne Anlass.
 */
const STICHTAG = new Date(2026, 5, 15);

let SQL: SqlJsStatic;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

/** Frisch migrierte In-Memory-Datenbank mit eingespieltem Spielstand. */
function mitSeed(): Database {
  const db = new SQL.Database();
  for (const m of MIGRATIONS) for (const sql of m.sql) db.run(sql);
  seedEinspielen(db, STICHTAG);
  return db;
}

const zahl = (db: Database, sql: string): number => Number(db.exec(sql)[0].values[0][0]);

describe("Spielstand", () => {
  it("laeuft gegen die aktuelle Migrationskette durch", () => {
    // Der eigentliche Rost-Test: jede INSERT-Anweisung trifft auf das heutige Schema.
    // Eine geloeschte oder umbenannte Spalte laesst sql.js hier werfen.
    expect(() => mitSeed()).not.toThrow();
  });

  it("hinterlaesst keine verwaisten Verweise", () => {
    const db = mitSeed();
    // sql.js hat Fremdschluessel AUS — `foreign_key_check` meldet Verstoesse trotzdem.
    // Genau diese Asymmetrie ist der Grund, warum so etwas sonst erst in der App auffaellt
    // (siehe `adapters/persistence/CLAUDE.md`).
    expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("fuellt jeden Bereich, den die App anzeigt", () => {
    const db = mitSeed();
    // Ein leerer Bereich ist kein Spielstand: die Zahlen sind Untergrenzen, keine
    // Erwartungen an den genauen Bestand — sonst wird der Test bei jeder Anpassung rot,
    // ohne dass etwas kaputt waere.
    for (const [tabelle, mindestens] of [
      ["zahlungskonto", 4],
      ["kategorie", 10],
      ["budget", 3],
      ["budget_betrag", 4],
      ["ist_buchung", 100],
      ["ist_buchung_aufteilung", 2],
      ["vertrag", 2],
      ["vertrag_erkennung", 2],
      ["inventargegenstand", 3],
      ["depotwert", 5],
      ["depotposition", 2],
      ["umsatz_roh", 6],
      ["umsatz_verarbeitung", 6],
      ["kontostand_anker", 4],
    ] as const) {
      expect(zahl(db, `SELECT COUNT(*) FROM ${tabelle}`), tabelle).toBeGreaterThanOrEqual(
        mindestens,
      );
    }
  });

  it("haelt die Invariante der Aufteilung: Summe der Teile = Betrag der Buchung", () => {
    const db = mitSeed();
    // Der Kern setzt das voraus. Ein Spielstand, der es verletzt, produziert Fehler, die
    // wie Rechenfehler der App aussehen.
    const abweichend = zahl(
      db,
      `SELECT COUNT(*) FROM (
         SELECT b.id FROM ist_buchung b
         JOIN ist_buchung_aufteilung a ON a.istbuchung_id = b.id
         GROUP BY b.id HAVING SUM(a.betrag) <> b.betrag
       )`,
    );
    expect(abweichend).toBe(0);
  });

  it("enthaelt den Rueckfluss: Aufwand mit positivem Betrag", () => {
    const db = mitSeed();
    // Steht ausdruecklich in der Wurzel-`CLAUDE.md` („Ein Rueckfluss gehoert IMMER in die
    // Kategorie der Ausgabe"). Faellt er aus dem Spielstand, faellt eine Regression daran
    // erst am echten Bestand auf.
    expect(
      zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE charakter = 'Aufwand' AND betrag > 0"),
    ).toBeGreaterThan(0);
  });

  it("bucht jede Umschichtung zweiseitig", () => {
    const db = mitSeed();
    // Saldo und Buchungen gehoeren zusammen: eine einseitige Umschichtung zeigte im
    // Verlauf einen Stand, den es nie gab.
    const summe = zahl(
      db,
      "SELECT COALESCE(SUM(betrag), 0) FROM ist_buchung WHERE charakter = 'Umschichtung'",
    );
    expect(summe).toBe(0);
  });

  it("ist wiederholbar — gleicher Stichtag, gleicher Bestand", () => {
    // Der gesaete Zufall traegt nur, wenn er wirklich saet. Ohne diese Zusicherung zeigt
    // ein Screenshot von gestern andere Zahlen als einer von heute.
    const a = mitSeed();
    const b = mitSeed();
    const summe = (db: Database) =>
      zahl(db, "SELECT COALESCE(SUM(betrag), 0) FROM ist_buchung") +
      "|" +
      zahl(db, "SELECT COUNT(*) FROM ist_buchung");
    expect(summe(a)).toBe(summe(b));
  });

  it("traegt keine IBAN mit existierender Bankleitzahl", () => {
    const db = mitSeed();
    // Regel aus `src/CLAUDE.md`: eine Test-IBAN traegt eine BLZ aus dem Bereich 999999xx,
    // den es nicht gibt. Eine IBAN mit echter BLZ koennte zu einem echten Konto gehoeren.
    const ibans = db.exec(
      "SELECT iban FROM zahlungskonto WHERE iban IS NOT NULL " +
        "UNION ALL SELECT gegenpartei_iban FROM umsatz_roh WHERE gegenpartei_iban IS NOT NULL",
    );
    const werte = ibans.length ? ibans[0].values.map((z) => String(z[0])) : [];
    expect(werte.length).toBeGreaterThan(0);
    for (const wert of werte) expect(wert.slice(4, 10), wert).toBe("999999");
  });
});
