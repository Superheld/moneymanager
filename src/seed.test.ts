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
      ["kontogruppe", 2],
      ["kontogruppe_konto", 4],
    ] as const) {
      expect(zahl(db, `SELECT COUNT(*) FROM ${tabelle}`), tabelle).toBeGreaterThanOrEqual(
        mindestens,
      );
    }
  });

  // Der Fall, den eine feste Kontoklasse nicht abbilden kann und fuer den es Gruppen
  // gibt: dasselbe Konto liegt in mehr als einer.
  it("legt ein Konto in zwei Gruppen", () => {
    const db = mitSeed();
    expect(
      zahl(
        db,
        "SELECT COUNT(*) FROM (SELECT konto_id FROM kontogruppe_konto " +
          "GROUP BY konto_id HAVING COUNT(*) > 1)",
      ),
    ).toBeGreaterThanOrEqual(1);
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

  it("holt Belege aus mehreren Quellen", () => {
    const db = mitSeed();
    // Ein Spielstand mit nur einer Quelle zeigt die Faelle nicht, die es nur zwischen
    // Quellen gibt — allen voran die Zwillinge.
    expect(zahl(db, "SELECT COUNT(DISTINCT quelle) FROM import_lauf")).toBeGreaterThanOrEqual(2);
    expect(zahl(db, "SELECT COUNT(DISTINCT format) FROM import_lauf WHERE format IS NOT NULL"))
      .toBeGreaterThanOrEqual(2);
  });

  it("traegt genug Material fuer ein messbares Training — und Woerter, die streuen", () => {
    const db = mitSeed();
    // Empfaenger und Verwendungszweck stehen am BELEG, nicht an der Buchung. Ein
    // Spielstand, dessen Alltagszahlungen nur eine `notiz` tragen, ist fuer die
    // Kategorie-Erkennung leer — genau das war er bis 2026-08-29, und es fiel nicht auf,
    // weil jede andere Ansicht die Notiz zeigt.
    const mitText = zahl(
      db,
      `SELECT COUNT(*) FROM ist_buchung b
       JOIN umsatz_verarbeitung v ON v.istbuchung_id = b.id
       JOIN umsatz_roh r ON r.id = v.umsatz_id
       WHERE b.kategorie_id IS NOT NULL AND b.charakter <> 'Umschichtung'
         AND (LENGTH(r.gegenpartei) > 0 OR LENGTH(r.verwendungszweck) > 0)`,
    );
    // Ueber `MESSBAR_AB` (50), sonst trainiert die App ohne Trefferquote.
    expect(mitText).toBeGreaterThan(150);

    // Und es muss Zeilen OHNE Beleg geben: von Hand erfasst, damit „ohne Text" als
    // Ausschlussgrund im Spielstand ueberhaupt vorkommt.
    expect(zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE quelle = 'manuell'")).toBeGreaterThan(0);

    // Ein Empfaengerwort, das in MEHREREN Kategorien steht. Ohne so eines traegt jedes
    // Wort seine Kategorie eindeutig, und Trennschaerfe und Trennkraft — die beiden
    // Zahlen, die der Trainingsbereich gegeneinander stellt — saehen ueberall gleich
    // gut aus.
    const streuend = zahl(
      db,
      `SELECT COUNT(*) FROM (
         SELECT r.gegenpartei FROM ist_buchung b
         JOIN umsatz_verarbeitung v ON v.istbuchung_id = b.id
         JOIN umsatz_roh r ON r.id = v.umsatz_id
         WHERE b.kategorie_id IS NOT NULL
         GROUP BY r.gegenpartei HAVING COUNT(DISTINCT b.kategorie_id) > 1
       )`,
    );
    expect(streuend).toBeGreaterThan(0);
  });

  it("enthaelt jeden Umsatz-Status", () => {
    const db = mitSeed();
    // „neu", „verbucht", „duplikat", „verworfen" — Weggelegtes bleibt sichtbar, und beim
    // Durchsehen zaehlt es mit.
    for (const status of ["neu", "verbucht", "duplikat", "verworfen"]) {
      expect(
        zahl(db, `SELECT COUNT(*) FROM umsatz_verarbeitung WHERE status = '${status}'`),
        status,
      ).toBeGreaterThan(0);
    }
  });

  it("verbindet jede verbuchte Zeile mit einer Buchung, und zwar ueber denselben Hash", () => {
    const db = mitSeed();
    // Der Weg von der Buchung zum Beleg ist ein JOIN ueber `istbuchung_id`. Zeigt er ins
    // Leere, fehlen in jeder Detailansicht Empfaenger und Verwendungszweck — die stehen
    // NICHT an der Buchung.
    expect(
      zahl(db, "SELECT COUNT(*) FROM umsatz_verarbeitung WHERE status = 'verbucht' AND istbuchung_id IS NULL"),
    ).toBe(0);
    expect(
      zahl(
        db,
        `SELECT COUNT(*) FROM umsatz_verarbeitung v
         JOIN umsatz_roh r ON r.id = v.umsatz_id
         JOIN ist_buchung b ON b.id = v.istbuchung_id
         WHERE b.roh_hash IS NOT NULL AND b.roh_hash <> r.roh_hash`,
      ),
    ).toBe(0);
  });

  /**
   * Ein Umbuchungs-Bein ohne Gegenstueck. Es darf KEINE Umschichtung sein: liegt das
   * Gegenkonto nicht im Bestand, hat das Geld den erfassten Bereich verlassen, und eine
   * Umschichtung zaehlte in kein Budget und in keine Ausgabe — das Geld waere weg und
   * fehlte nirgends.
   */
  it("enthaelt ein ungepaartes Umbuchungs-Bein, und zwar als Aufwand", () => {
    const db = mitSeed();
    const zeilen = db.exec(
      `SELECT b.charakter, b.kategorie_id, b.transfer_id
         FROM ist_buchung b
         JOIN umsatz_verarbeitung v ON v.istbuchung_id = b.id
         JOIN umsatz_roh r ON r.id = v.umsatz_id
        WHERE r.roh_hash = 'hash-halbe-umbuchung'`,
    );
    expect(zeilen).toHaveLength(1);
    const [charakter, kategorie, transfer] = zeilen[0].values[0];
    expect(charakter).toBe("Aufwand");
    expect(kategorie).toBeNull();
    expect(transfer).toBeNull();
  });

  /**
   * `endempfaenger` steht NEBEN `gegenpartei`, nicht statt dessen: dort bleibt der
   * Zahlungsdienstleister, und wer die Zahlung wirklich bekommt, ist eine eigene Angabe.
   * Fuer die Kategorie-Erkennung ist der Unterschied erheblich — der Dienstleister ist
   * bei jedem Haendler derselbe.
   */
  it("enthaelt eine Zahlung ueber einen Dienstleister, mit Endempfaenger daneben", () => {
    const db = mitSeed();
    const zeilen = db.exec(
      "SELECT gegenpartei, endempfaenger FROM umsatz_roh WHERE roh_hash = 'hash-dienstleister'",
    );
    expect(zeilen).toHaveLength(1);
    const [partei, endempfaenger] = zeilen[0].values[0];
    expect(String(endempfaenger).length).toBeGreaterThan(0);
    expect(endempfaenger).not.toBe(partei);
  });

  it("legt echte Zwillinge an, nicht angeschriebene Verdachte", () => {
    const db = mitSeed();
    // Der Verdacht wird beim HINSEHEN gerechnet. Ein Spielstand kann ihn deshalb nur
    // erzeugen, indem er wirklich zwei aehnliche Zeilen enthaelt: gleicher Betrag, gleicher
    // Empfaenger, dicht beieinander, aus VERSCHIEDENEN Laeufen.
    const paare = zahl(
      db,
      `SELECT COUNT(*) FROM umsatz_roh a
       JOIN umsatz_roh b ON b.betrag = a.betrag AND b.gegenpartei = a.gegenpartei
         AND b.id > a.id AND b.lauf_id <> a.lauf_id
         AND ABS(julianday(b.buchungstag) - julianday(a.buchungstag)) <= 2`,
    );
    expect(paare).toBeGreaterThan(0);
  });

  it("haelt eine Dubletten-Freigabe als sortiertes Paar", () => {
    const db = mitSeed();
    expect(zahl(db, "SELECT COUNT(*) FROM dubletten_freigabe")).toBeGreaterThan(0);
    // Die Reihenfolge traegt keine Bedeutung und ist deshalb festgelegt — sonst stuende
    // dasselbe Paar zweimal drin, einmal je Richtung.
    expect(zahl(db, "SELECT COUNT(*) FROM dubletten_freigabe WHERE umsatz_a >= umsatz_b")).toBe(0);
  });

  it("laesst Buchungen offen, die noch angesehen werden muessen", () => {
    const db = mitSeed();
    expect(zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE zu_pruefen = 1")).toBeGreaterThan(0);
  });

  /**
   * JEDE Zeile im Auszug traegt eine Beschriftung — entweder eine eigene Bezeichnung oder
   * einen Beleg, aus dem der Auszug den Empfaenger nimmt.
   *
   * Der Spielstand schrieb bis 2026-08-25 gar keine `notiz`, und der Auszug zeigte
   * seitenweise Zeilen, an denen nur ein Datum und ein Betrag standen. Aufgefallen ist das
   * beim Hinsehen, nicht beim Testlauf — deshalb steht die Zusicherung jetzt hier: eine
   * neue Buchungsart im Seed faellt sonst genauso still wieder ohne Beschriftung an.
   */
  it("beschriftet jede Buchung — eigene Bezeichnung oder Beleg", () => {
    const db = mitSeed();
    const ohne = zahl(
      db,
      `SELECT COUNT(*) FROM ist_buchung b
        WHERE (b.notiz IS NULL OR TRIM(b.notiz) = '')
          AND NOT EXISTS (
            SELECT 1 FROM umsatz_verarbeitung v
             JOIN umsatz_roh r ON r.id = v.umsatz_id
            WHERE v.istbuchung_id = b.id AND TRIM(COALESCE(r.gegenpartei, '')) <> ''
          )`,
    );
    expect(ohne).toBe(0);
  });

  /**
   * Und sie sind ERZEUGT, nicht abgeschrieben: bei sechs bis zehn Einkaeufen im Monat
   * staende sonst ueberall dasselbe. Gezogen wird aus dem gesaeten Wuerfel, die
   * Wiederholbarkeit oben bleibt davon unberuehrt.
   */
  it("beschriftet die Alltagsbuchungen verschieden", () => {
    const db = mitSeed();
    const verschiedene = zahl(
      db,
      "SELECT COUNT(DISTINCT notiz) FROM ist_buchung WHERE kategorie_id = 'kat-lebensmittel'",
    );
    expect(verschiedene).toBeGreaterThan(3);
  });

  it("enthaelt die Zahlung, die AUSDRUECKLICH zu keinem Vertrag gehoert", () => {
    const db = mitSeed();
    // Der Fall, fuer den `vertrag_herkunft` existiert (Wurzel-`CLAUDE.md`): ohne die
    // Herkunft holte der naechste Abgleich die Buchung zurueck.
    expect(
      zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE vertrag_id IS NULL AND vertrag_herkunft IS NOT NULL"),
    ).toBeGreaterThan(0);
    // Und die Gegenprobe: es gibt auch zugeordnete.
    expect(zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE vertrag_id IS NOT NULL")).toBeGreaterThan(0);
  });

  it("traegt Plangroessen, damit der Monatsausblick etwas zu rechnen hat", () => {
    const db = mitSeed();
    expect(zahl(db, "SELECT COUNT(*) FROM zahlungsregel")).toBeGreaterThanOrEqual(4);
    // Nicht nur monatliche — sonst bliebe die Projektionsarithmetik ungeprueft.
    expect(zahl(db, "SELECT COUNT(DISTINCT rhythmus) FROM zahlungsregel")).toBeGreaterThanOrEqual(2);
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
