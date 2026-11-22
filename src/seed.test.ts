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

import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./adapters/persistence/migrations";
import { seedEinspielen } from "./testwerkzeug/seedDaten";
import { standardkategorienFlach } from "./application/kategorien/standardkategorien";
import { getrageneBuchungen, KONTOKLASSEN, passtZu } from "./core";
import type { Zahlungsspur } from "./core";
import { pluginApi } from "./testwerkzeug/harness";
import { sqliteVermoegenRepository } from "./adapters/persistence/sqliteVermoegenRepository";
import { sqliteVorsorgeRepository } from "./adapters/persistence/sqliteVorsorgeRepository";
import { sqliteZahlungskontoRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { sqliteLedgerRepository } from "./adapters/persistence/sqliteLedgerRepository";
import { sqliteDepotRepository } from "./adapters/persistence/sqliteDepotRepository";
import { sqliteVertragRepository } from "./adapters/persistence/sqliteVertragRepository";
import { sqliteKontozuordnungRepository } from "./adapters/persistence/sqliteBankzugangRepositories";
import { vermoegenLaden } from "./application/vermoegen/vermoegensichten";
import { vorsorgeLaden } from "./application/vorsorge/vorsorge";
import { sqliteBudgetRepository } from "./adapters/persistence/sqliteBudgetRepository";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { sqliteVertragszuordnungRepository } from "./adapters/persistence/sqliteVertragZuordnungRepositories";
import { sqliteRuecklagenRepository } from "./adapters/persistence/sqliteRuecklagenRepository";
import { sqliteRuecklagenzuordnungRepository } from "./adapters/persistence/sqliteRuecklagenzuordnungRepository";
import { sqliteZahlungsregelRepository } from "./adapters/persistence/sqliteZahlungsregelRepository";
import { sqliteUmsatzRepository } from "./adapters/persistence/sqliteImportRepositories";
import { sqliteEinstellungenRepository } from "./adapters/persistence/sqliteEinstellungenRepository";
import { abschlussvorschau, ruecklagenLaden, ruecklagenVerlauf, ruecklagenWertverlust, type Ruecklagensicht } from "./application/ruecklagen/ruecklagensichten";
import { geldJeKontoLaden } from "./application/ruecklagen/geldJeKonto";
import { ruecklagenvorschlaegeLaden } from "./application/ruecklagen/ruecklagenvorschlaege";
import { budgetbereichLaden, budgetuebersichtLaden } from "./application/budgets/budgetsichten";

// Fuer die Faelle, die den Spielstand durch die USE-CASES lesen statt per SQL: `getDb`
// zeigt dann auf dieselbe sql.js-Datenbank, in die der Seed geschrieben hat.
const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./adapters/persistence/db", () => ({ getDb: async () => halter.lesen() }));

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

  it("legt genau die Kategorien der Vorlage an — keine eigenen", () => {
    // **Der Fehler, den es hier zu verhindern gilt, ist einmal passiert.** Der Seed fuehrte
    // eine EIGENE Kategorienliste, und sie hiess dieselben Dinge anders als die Vorlage:
    // `Mobilitaet` ohne Umlaut, `Miete` statt `Miete & Nebenkosten`. `standardkategorienAnlegen`
    // gleicht ueber den Namen ab, fand sieben davon nicht wieder und legte sie ein zweites
    // Mal an — der Spielstand hatte danach Dubletten, und man sah ihm nicht an, woher sie
    // kamen.
    //
    // Der Test prueft deshalb GLEICHHEIT und nicht Teilmenge: eine Kategorie im Seed, die
    // die Vorlage nicht kennt, ist genau der Anfang, mit dem es letztes Mal losging.
    const db = mitSeed();
    const [zeilen] = db.exec("SELECT id, name FROM kategorie ORDER BY id");
    const imSeed = (zeilen?.values ?? []).map((z) => `${String(z[0])} ${String(z[1])}`);
    const inDerVorlage = standardkategorienFlach()
      .map((k) => `${k.id} ${k.name}`)
      .sort();
    expect(imSeed.sort()).toEqual(inDerVorlage);
  });

  it("haengt jede Buchung, jedes Budget und jeden Vertrag an eine Kategorie, die es gibt", () => {
    // `foreign_key_check` oben faengt das ebenfalls — aber erst als anonyme Verletzung.
    // Hier faellt der NAME, und beim Umbenennen einer Vorlagen-Kategorie ist das der
    // Unterschied zwischen „irgendwo ein Verweis kaputt" und „diese Zeile hier".
    const db = mitSeed();
    const bekannt = new Set(standardkategorienFlach().map((k) => k.id));
    for (const tabelle of ["ist_buchung", "budget", "vertrag", "ruecklage"]) {
      const [zeilen] = db.exec(
        `SELECT DISTINCT kategorie_id FROM ${tabelle} WHERE kategorie_id IS NOT NULL`,
      );
      for (const [id] of zeilen?.values ?? []) {
        expect(bekannt.has(String(id)), `${tabelle} zeigt auf die unbekannte Kategorie ${id}`).toBe(
          true,
        );
      }
    }
  });

  it("fuellt jeden Bereich, den die App anzeigt", () => {
    const db = mitSeed();
    // Ein leerer Bereich ist kein Spielstand: die Zahlen sind Untergrenzen, keine
    // Erwartungen an den genauen Bestand — sonst wird der Test bei jeder Anpassung rot,
    // ohne dass etwas kaputt waere.
    for (const [tabelle, mindestens] of [
      ["zahlungskonto", 4],
      ["kategorie", 10],
      ["budget", 2],
      ["budget_betrag", 3],
      ["ruecklage_rate", 2],
      ["ist_buchung", 100],
      ["ist_buchung_aufteilung", 2],
      ["vertrag", 2],
      ["vertrag_erkennung", 2],
      ["ruecklage", 4],
      ["depotwert", 5],
      ["depotposition", 2],
      ["umsatz_roh", 6],
      ["umsatz_verarbeitung", 6],
      ["kontostand_anker", 4],
      ["vermoegensgegenstand", 2],
      ["vermoegenswert", 4],
      ["verbindlichkeit", 1],
      ["verbindlichkeit_stand", 2],
      ["vorsorgeziel", 1],
      ["vorsorgeziel_annahme", 2],
    ] as const) {
      expect(zahl(db, `SELECT COUNT(*) FROM ${tabelle}`), tabelle).toBeGreaterThanOrEqual(
        mindestens,
      );
    }
  });

  it("traegt die Ruecklagen in beiden Sorten und mit beiden Faellen an einer Kategorie", () => {
    // Die Ruecklagen von Hand von davor stehen da wie vor Migration 80 (abschliessend, ohne
    // Fundfenster, die Rate noch in `rate`) — die Umstellungsprobe misst an ihnen. Daneben
    // das fruehere aufbauende Budget, wie Migration 81 es hinterlaesst, und die beiden
    // Faelle aus ADR-0006: eine Ruecklage allein an ihrer Kategorie, zwei an derselben.
    const db = mitSeed();
    expect(zahl(db, "SELECT COUNT(*) FROM budget WHERE art <> 'monatlich'")).toBe(0);
    expect(
      zahl(db, "SELECT COUNT(*) FROM ruecklage WHERE id = 'budget-anschaffung' AND art = 'fortlaufend' AND findet_ab IS NULL"),
    ).toBe(1);
    expect(zahl(db, "SELECT COUNT(*) FROM ruecklage_rate WHERE ruecklage_id = 'budget-anschaffung'")).toBe(1);
    // Allein: an `kat-mobilitaet` haengt genau eine.
    expect(zahl(db, "SELECT COUNT(*) FROM ruecklage WHERE kategorie_id = 'kat-mobilitaet'")).toBe(1);
    // Zwei an derselben, die beide finden: die fortlaufende ohne Anfang und eine mit Fundfenster.
    expect(
      zahl(
        db,
        "SELECT COUNT(*) FROM ruecklage WHERE kategorie_id = 'kat-anschaffungen' AND (findet_ab IS NOT NULL OR art = 'fortlaufend')",
      ),
    ).toBe(2);
    // Bis Paket 5 stand hier 0: der Spielstand hatte keine Zuordnung. Seit den Faellen zum
    // Durchspielen (`ruecklagenFaelle`) sind es genau die beiden ausdruecklichen
    // Entscheidungen an `kat-anschaffungen` — eine Ruecklage und „keine". Mehr soll es
    // dort nicht sein: alles andere dort soll warten. Dazu seit 2026-11-22 eine Ausgabe,
    // die einer Ruecklage ausserhalb ihrer Kategorie zugeordnet ist (`rue-fall-fernseher`).
    expect(zahl(db, "SELECT COUNT(*) FROM ruecklage_zuordnung WHERE kategorie_id = 'kat-anschaffungen'")).toBe(2);
    expect(zahl(db, "SELECT COUNT(*) FROM ruecklage_zuordnung")).toBe(3);
  });

  /**
   * Der Spielstand muss die Maske ueberstehen, nicht nur das Schema.
   *
   * Das Schema ist hier viel toleranter als die App: `budget.start` ist `TEXT` und nimmt
   * jede Zeichenkette, `konto_id` ist nullable. `budgetAnlegen` verlangt aber ein DATUM
   * (`YYYY-MM-DD`) und ein Konto — und beides prueft es beim SPEICHERN, also erst dann,
   * wenn jemand ein bestehendes Budget bearbeiten will.
   *
   * Genau da klaffte es: der Seed schrieb einen Monat (`YYYY-MM`) und kein Konto. Jedes
   * Budget im Spielstand liess sich anzeigen und keines aendern; die Meldung lautete
   * „Startdatum angeben", und beim monatlichen Budget zeigt die Maske das Startdatum
   * nicht einmal an. `foreign_key_check` und die INSERTs sahen davon nichts.
   *
   * Deshalb prueft dieser Test die FORM gegen die Regeln der Anwendungsschicht, nicht
   * gegen die der Tabelle.
   */
  it("schreibt Budgets, die sich in der Maske auch bearbeiten lassen", () => {
    const db = mitSeed();
    const [zeilen] = db.exec("SELECT id, start, konto_id FROM budget");
    expect(zeilen?.values.length ?? 0).toBeGreaterThan(0);
    for (const [id, start, kontoId] of zeilen?.values ?? []) {
      expect(String(start), `budget ${id}: start ist ein Datum, kein Monat`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(kontoId, `budget ${id}: ohne Konto ist es eine Zahl ohne Deckung`).not.toBeNull();
    }

    const [versionen] = db.exec("SELECT budget_id, ab_monat FROM budget_betrag");
    for (const [budgetId, abMonat] of versionen?.values ?? []) {
      expect(String(abMonat), `budget_betrag ${budgetId}: ab_monat ist ein Monat`).toMatch(
        /^\d{4}-\d{2}$/,
      );
    }
  });

  /**
   * Jede Kontoklasse kommt im Spielstand vor.
   *
   * Sonst faellt eine Klasse, die niemand benutzt, erst dann auf, wenn ein echter Bestand
   * sie traegt — und die Karte „Was da ist" zeigt im Spielstand bis dahin eine Zeile
   * weniger, als es geben kann.
   */
  it("belegt jede Kontoklasse mit mindestens einem Konto", () => {
    const db = mitSeed();
    for (const klasse of KONTOKLASSEN) {
      expect(
        zahl(db, `SELECT COUNT(*) FROM zahlungskonto WHERE klasse = '${klasse}'`),
        klasse,
      ).toBeGreaterThanOrEqual(1);
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
    // Steht ausdruecklich in `src/core/buchung/CLAUDE.md` („Ein Rueckfluss gehoert IMMER in die
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

  /**
   * Die Erkennungsregeln des Spielstands muessen auch wirklich TREFFEN.
   *
   * Sie taten es nie, und niemand hat es gesehen — der Waechter prueft bis hierher, dass
   * Zeilen entstehen, nicht dass sie etwas bewirken. Zwei Fehler auf einmal:
   * `schluessel` ist eine JSON-Spalte und trug einen blossen Namen (der Leser faellt in
   * seinen catch und liefert eine leere Merkmalsliste), und die Betragsspanne war aus
   * einem Aufwand abgeleitet und damit negativ, waehrend `passtZu` gegen den Betrag OHNE
   * Vorzeichen prueft.
   *
   * Geprueft wird deshalb mit `passtZu` selbst und nicht mit nachgebautem SQL: eine
   * zweite Nachbildung der Regel waere genau die Stelle, an der derselbe Denkfehler ein
   * zweites Mal Platz haette.
   */
  it("hat Handzuordnungen, aus denen sich Merkmale ableiten lassen", () => {
    // Ohne sie bliebe der Vorschlagsblock im Vertragsdialog im ganzen Spielstand leer,
    // und man haette nur an echten Daten etwas zu sehen. Geprueft wird beides, was die
    // Ableitung braucht: Belege UND wechselnde Empfaengerfelder — bei durchweg gleichem
    // Namen faende sie nichts, was `standardErkennung` nicht ohnehin schon schreibt.
    const db = mitSeed();
    const [zeilen] = db.exec(
      `SELECT b.vertrag_id, r.gegenpartei
       FROM ist_buchung b
       JOIN umsatz_verarbeitung v ON v.istbuchung_id = b.id
       JOIN umsatz_roh r ON r.id = v.umsatz_id
       WHERE b.vertrag_herkunft = 'manuell' AND b.vertrag_id IS NOT NULL`,
    );
    const werte = zeilen?.values ?? [];
    expect(werte.length).toBeGreaterThan(1);

    const proVertrag = new Map<string, Set<string>>();
    for (const [vertragId, partei] of werte) {
      const menge = proVertrag.get(String(vertragId)) ?? new Set<string>();
      menge.add(String(partei ?? ""));
      proVertrag.set(String(vertragId), menge);
    }
    expect([...proVertrag.values()].some((namen) => namen.size > 1)).toBe(true);
  });

  it("schreibt Erkennungsregeln, die im Bestand auch etwas finden", () => {
    const db = mitSeed();
    const [regeln] = db.exec(
      "SELECT vertrag_id, schluessel, betrag_von, betrag_bis, konto_id FROM vertrag_erkennung",
    );
    expect(regeln?.values.length ?? 0).toBeGreaterThan(0);

    const [zeilen] = db.exec(
      `SELECT b.id, b.datum, b.betrag, b.konto_id, b.charakter, r.gegenpartei, r.verwendungszweck, r.glaeubiger_id
       FROM ist_buchung b
       JOIN umsatz_verarbeitung v ON v.istbuchung_id = b.id
       JOIN umsatz_roh r ON r.id = v.umsatz_id`,
    );
    const spuren: Zahlungsspur[] = (zeilen?.values ?? []).map((z) => ({
      id: String(z[0]),
      datum: String(z[1]),
      betrag: Number(z[2]),
      kontoId: String(z[3]),
      charakter: String(z[4]) as Zahlungsspur["charakter"],
      gegenpartei: String(z[5] ?? ""),
      verwendungszweck: String(z[6] ?? ""),
      glaeubigerId: z[7] == null ? undefined : String(z[7]),
    }));

    for (const [vertragId, schluessel, von, bis, kontoId] of regeln?.values ?? []) {
      const merkmale = JSON.parse(String(schluessel));
      // Das aktuelle Format, nicht das Altformat aus Migration 19: der Spielstand wird
      // neu geschrieben und hat keinen Altbestand zu tragen.
      expect(merkmale, `${vertragId}: Merkmale als typisierte Liste`).not.toHaveLength(0);
      for (const m of merkmale) expect(m).toHaveProperty("art");
      // Die Spanne misst eine HOEHE — ein negativer Wert schliesst alles aus.
      if (von != null) expect(Number(von), `${vertragId}: betrag_von ist eine Hoehe`).toBeGreaterThan(0);
      if (bis != null) expect(Number(bis), `${vertragId}: betrag_bis ist eine Hoehe`).toBeGreaterThan(0);

      const regel = {
        vertragId: String(vertragId),
        merkmale,
        betragVon: von == null ? undefined : Number(von),
        betragBis: bis == null ? undefined : Number(bis),
        kontoId: kontoId == null ? undefined : String(kontoId),
      };
      expect(
        spuren.filter((sp) => passtZu(regel, sp)).length,
        `${vertragId}: die Regel trifft keine einzige Zahlung`,
      ).toBeGreaterThan(0);
    }
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
    // Der Fall, fuer den `vertrag_herkunft` existiert (`src/core/vertraege/CLAUDE.md`): ohne die
    // Herkunft holte der naechste Abgleich die Buchung zurueck.
    expect(
      zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE vertrag_id IS NULL AND vertrag_herkunft IS NOT NULL"),
    ).toBeGreaterThan(0);
    // Und die Gegenprobe: es gibt auch zugeordnete.
    expect(zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE vertrag_id IS NOT NULL")).toBeGreaterThan(0);
  });

  it("ordnet Miete und Gehalt ihrem Vertrag zu", () => {
    // Die Ergebnisrechnung findet Fixkosten und Einnahmen ueber die Vertragszuordnung der
    // Buchung. Ohne sie stuende der groesste Posten des Spielstands unter „Ungeplant" und
    // sein Vertrag dauerhaft als „offen" — die Uebersicht zeigte dann genau den Fall, den
    // sie als Hinweis auf eine fehlende Zuordnung meint, als Normalzustand.
    const db = mitSeed();
    for (const [regelId, kategorieId] of [
      ["regel-miete", "kat-miete-nebenkosten"],
      ["regel-gehalt", "kat-gehalt"],
    ]) {
      const [regel] = db.exec("SELECT vertrag_id FROM zahlungsregel WHERE id = ?", [regelId]);
      const vertragId = regel?.values[0]?.[0];
      expect(vertragId, `${regelId} haengt an keinem Vertrag`).toBeTruthy();
      expect(
        zahl(db, `SELECT COUNT(*) FROM ist_buchung WHERE kategorie_id = '${kategorieId}' AND vertrag_id = '${vertragId}'`),
        `${regelId}: keine Zahlung ist dem Vertrag zugeordnet`,
      ).toBeGreaterThan(0);
      expect(
        zahl(db, `SELECT COUNT(*) FROM ist_buchung WHERE kategorie_id = '${kategorieId}' AND vertrag_id IS NULL`),
        `${regelId}: eine Zahlung steht ohne Vertrag da`,
      ).toBe(0);
    }
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

/**
 * Der Umbuchungsvertrag im Spielstand. Er ist der einzige Vertrag ohne Erkennungsregel,
 * und genau daran haengt, dass die Zuordnung ueber den WEG laeuft — ohne Gegenkonto an
 * beiden Seiten sieht weder der Abgleich noch der Ruecklagenfluss etwas.
 */
describe("Spielstand — Umbuchungsvertrag", () => {
  it("verbindet Regel und gebuchte Beine ueber dasselbe Kontopaar", () => {
    const db = mitSeed();
    const [regel] = db.exec(
      "SELECT konto_id, gegenkonto_id, charakter, vertrag_id FROM zahlungsregel WHERE gegenkonto_id IS NOT NULL",
    );
    expect(regel?.values).toHaveLength(1);
    const [kontoId, gegenkontoId, charakter, vertragId] = regel!.values[0];
    expect(charakter).toBe("Umschichtung");
    expect(vertragId).toBe("vertrag-sparrate");

    const [beine] = db.exec(
      `SELECT COUNT(*) FROM ist_buchung
        WHERE charakter = 'Umschichtung' AND betrag < 0
          AND konto_id = '${kontoId}' AND gegenkonto_id = '${gegenkontoId}'`,
    );
    expect(Number(beine!.values[0][0])).toBeGreaterThan(0);
  });

  /**
   * Der Fall, den man sonst nur herstellt, indem man ihn herstellt — und an dem beide
   * Haelften der Stilllegungs-Regel sichtbar werden.
   */
  it("enthaelt ein stillgelegtes Konto MIT Buchungen und Restbetrag", () => {
    const db = mitSeed();
    const [zeile] = db.exec(
      "SELECT aktiv, kontostand FROM zahlungskonto WHERE id = 'konto-alt'",
    );
    expect(zeile!.values[0][0]).toBe(0);
    // Restgeld: es steht in „Was da ist", obwohl das Konto nirgends mehr waehlbar ist.
    expect(Number(zeile!.values[0][1])).toBeGreaterThan(0);
    // Und eine Vergangenheit, die in der Analyse weiterzaehlt.
    expect(zahl(db, "SELECT COUNT(*) FROM ist_buchung WHERE konto_id = 'konto-alt'")).toBeGreaterThan(0);
  });

  it("fuehrt alle anderen Konten als aktiv", () => {
    // Die Gegenprobe zum Testfall darueber: genau EIN stillgelegtes Konto, nicht aus
    // Versehen mehrere. Ein Spielstand, in dem die Haelfte der Konten still ist, zeigt die
    // App in einem Zustand, den es so nicht gibt.
    const db = mitSeed();
    expect(zahl(db, "SELECT COUNT(*) FROM zahlungskonto WHERE aktiv = 0")).toBe(1);
  });

  it("paart beide Beine jeder Umbuchung", () => {
    const db = mitSeed();
    // Eine transfer_id ohne Gegenstueck waere eine halbe Umbuchung — der Verlauf zeigte
    // dann einen Stand, den es nie gab.
    const [ungepaart] = db.exec(
      `SELECT COUNT(*) FROM (
         SELECT transfer_id FROM ist_buchung WHERE transfer_id IS NOT NULL
          GROUP BY transfer_id HAVING COUNT(*) <> 2
       )`,
    );
    expect(Number(ungepaart!.values[0][0])).toBe(0);
  });
});

/**
 * Der Bereich Vermoegen, gelesen wie die Oberflaeche ihn liest — ueber die Use-Cases.
 *
 * Per SQL liesse sich nur zaehlen, ob Zeilen da sind. Ob die Karte etwas ZEIGT, haengt an
 * der Rechnung: ein Verlauf mit einem einzigen Punkt, ein Ziel, das schon gedeckt oder
 * nicht mehr erreichbar ist, saehe in der Tabelle genauso gefuellt aus.
 */
describe("Spielstand — Vermoegen und Vorsorge", () => {
  const HEUTE = "2026-06-15"; // derselbe Tag wie STICHTAG
  const bestand = {
    vermoegenRepo: sqliteVermoegenRepository,
    kontoRepo: sqliteZahlungskontoRepository,
    ledger: sqliteLedgerRepository,
    depotRepo: sqliteDepotRepository,
    vertragRepo: sqliteVertragRepository,
    kontozuordnungen: () => sqliteKontozuordnungRepository.alle(),
  };
  const mitSeedAngebunden = () => halter.setzen(pluginApi(mitSeed()));

  it("legt keine Beobachtung in die Zukunft", () => {
    const db = mitSeed();
    for (const tabelle of ["vermoegenswert", "verbindlichkeit_stand"]) {
      expect(zahl(db, `SELECT COUNT(*) FROM ${tabelle} WHERE stichtag > '${HEUTE}'`), tabelle).toBe(0);
    }
  });

  it("zeigt ein Nettovermoegen mit Verlauf ueber mehrere Jahre", async () => {
    mitSeedAngebunden();
    const sicht = await vermoegenLaden(bestand, HEUTE);
    // Mehr Punkte als der Kontoverlauf hat: die Reihen reichen weiter zurueck als die
    // Buchungen, und genau das soll der Verlauf zeigen.
    expect(sicht.verlauf.length).toBeGreaterThan(24);
    expect(sicht.verlauf[sicht.verlauf.length - 1]).toEqual(sicht.netto);
    // Und er bewegt sich — ein Verlauf, der ueber Jahre auf einem Wert steht, sieht nach
    // fehlenden Daten aus.
    expect(new Set(sicht.verlauf.map((p) => p.netto)).size).toBeGreaterThan(3);
    expect(sicht.netto.schulden).toBeGreaterThan(0);
  });

  it("verknuepft eine Schuld mit einem Vermoegenswert, und die Restschuld sinkt", async () => {
    mitSeedAngebunden();
    const sicht = await vermoegenLaden(bestand, HEUTE);
    const verknuepft = sicht.schulden.filter((s) => s.gegenstandName);
    expect(verknuepft.length).toBeGreaterThan(0);
    for (const s of sicht.schulden) {
      // `reihe` ist juengste zuerst: jede aeltere Restschuld ist hoeher.
      const betraege = s.reihe.map((r) => r.betrag);
      expect(betraege.length, s.verbindlichkeit.id).toBeGreaterThan(1);
      expect([...betraege].sort((a, b) => a - b), s.verbindlichkeit.id).toEqual(betraege);
    }
  });

  it("rechnet fuer das Vorsorgeziel eine Sparrate — weder gedeckt noch unerreichbar", async () => {
    mitSeedAngebunden();
    const sicht = await vorsorgeLaden({ ...bestand, vorsorgeRepo: sqliteVorsorgeRepository }, HEUTE);
    expect(sicht).not.toBeNull();
    // Es gilt die JUENGERE der beiden Annahmen, nicht die erste.
    const annahmen = await sqliteVorsorgeRepository.annahmen();
    expect(annahmen.length).toBe(2);
    const juengste = [...annahmen].sort((a, b) => b.abMonat.localeCompare(a.abMonat))[0];
    expect(sicht!.annahme.abMonat).toBe(juengste.abMonat);

    expect(sicht!.stand.sparrate).not.toBeNull();
    expect(sicht!.stand.sparrate!).toBeGreaterThan(0);
    expect(sicht!.stand.deckung).toBeLessThan(1);
    // Und der Vermoegenswert, der dem Ziel zugeordnet ist, zaehlt mit.
    expect(sicht!.vermoegen.vermoegenswerte).toBeGreaterThan(0);
  });
});

/**
 * Die Faelle des Ruecklagen-Umbaus (`ruecklagenFaelle` in `seedDaten.ts`), gelesen ueber
 * dieselben Use-Cases wie der Bereich Ruecklagen. Per SQL liesse sich nur sagen, dass
 * Zeilen da sind — ob die Karte „Wartet auf Zuordnung" etwas zeigt oder eine Ruecklage
 * im Minus steht, entscheidet die Rechnung.
 */
describe("Spielstand — Ruecklagen zum Durchspielen", () => {
  const HEUTE = "2026-06-15"; // derselbe Tag wie STICHTAG
  const deps = {
    ledger: sqliteLedgerRepository,
    kategorieRepo: sqliteKategorieRepository,
    budgetRepo: sqliteBudgetRepository,
    zuordnungRepo: sqliteVertragszuordnungRepository,
    ruecklagenRepo: sqliteRuecklagenRepository,
    ruecklagenzuordnungRepo: sqliteRuecklagenzuordnungRepository,
    kontoRepo: sqliteZahlungskontoRepository,
    regelRepo: sqliteZahlungsregelRepository,
    vertragRepo: sqliteVertragRepository,
    umsatzRepo: sqliteUmsatzRepository,
    einstellungenRepo: sqliteEinstellungenRepository,
  };
  const laden = async (): Promise<Ruecklagensicht> => {
    halter.setzen(pluginApi(mitSeed()));
    return ruecklagenLaden(deps, HEUTE);
  };
  const zeile = (s: Ruecklagensicht, id: string) => {
    const z = s.zeilen.find((x) => x.ruecklage.id === id);
    expect(z, id).toBeDefined();
    return z!;
  };

  it("laesst mindestens drei Buchungen auf eine Zuordnung warten — und zwei sind entschieden", async () => {
    const s = await laden();
    const anAnschaffungen = s.wartend.filter((w) => w.kategorieId === "kat-anschaffungen");
    expect(anAnschaffungen.length).toBeGreaterThanOrEqual(3);
    // Die beiden entschiedenen stehen NICHT auf der Karte: eine traegt `rue-6`, eine keine.
    const zuordnungen = (await sqliteRuecklagenzuordnungRepository.alle()).filter((z) => z.kategorieId === "kat-anschaffungen");
    expect(zuordnungen.map((z) => z.ruecklageId ?? null).sort()).toEqual([null, "rue-6"].sort());
    const wartend = new Set(s.wartend.map((w) => w.buchungId));
    for (const z of zuordnungen) expect(wartend.has(z.istbuchungId), z.istbuchungId).toBe(false);
  });

  it("hat eine Ruecklage, die mit Rest abgeschlossen werden kann", async () => {
    const s = await laden();
    const reise = zeile(s, "rue-fall-reise");
    expect(reise.abschlussweg).toBe("abschliessen");
    const vorschau = abschlussvorschau(s, reise.ruecklage, HEUTE)!;
    expect(vorschau.getragen).toBeGreaterThan(0);
    expect(vorschau.frei).toBeGreaterThan(0);
    expect(vorschau.ungedeckt).toBe(0);
    // Die Ausgaben verteilen sich ueber zwei Monate des Verlaufs.
    const verlauf = ruecklagenVerlauf(s, reise.ruecklage, HEUTE);
    expect(verlauf.filter((m) => m.verbraucht > 0)).toHaveLength(2);
  });

  it("hat eine Ruecklage, die im Minus abgeschlossen wuerde", async () => {
    const s = await laden();
    const kamera = zeile(s, "rue-fall-kamera");
    expect(kamera.abschlussweg).toBe("abschliessen");
    const vorschau = abschlussvorschau(s, kamera.ruecklage, HEUTE)!;
    expect(vorschau.ungedeckt).toBeGreaterThan(0);
    expect(vorschau.frei).toBe(0);
  });

  it("zeigt einen frueheren Abschluss mit Neubeginn und einen beendeten in der Geschichte", async () => {
    const s = await laden();
    const geschenke = s.geschichte.find((g) => g.ruecklageId === "rue-fall-geschenke");
    expect(geschenke).toMatchObject({ abschluss: true, beendet: false });
    expect(geschenke!.frei!).toBeGreaterThan(0);
    // Sie laeuft weiter, im neuen Zyklus ab dem Abschlusstag — und der Verlauf hat den
    // Monat, in dem frei wurde.
    const neu = zeile(s, "rue-fall-geschenke");
    expect(neu.ruecklage.beginn).toBe(geschenke!.datum);
    expect(ruecklagenVerlauf(s, neu.ruecklage, HEUTE).some((m) => (m.abgeschlossen ?? 0) > 0)).toBe(true);

    const fest = s.geschichte.find((g) => g.ruecklageId === "rue-fall-fest");
    expect(fest).toMatchObject({ abschluss: true, beendet: true });
    expect(s.zeilen.some((z) => z.ruecklage.id === "rue-fall-fest")).toBe(false);
  });

  it("hat eine, die weiterlaeuft und im Minus steht, und eine gut gefuellte", async () => {
    const s = await laden();
    const minus = zeile(s, "rue-fall-instandhaltung");
    expect(minus.art).toBe("fortlaufend");
    expect(minus.stand).toBeLessThan(0);
    expect(minus.soll).toBe(0);
    const voll = zeile(s, "rue-fall-beitraege");
    expect(voll.art).toBe("fortlaufend");
    expect(voll.stand).toBeGreaterThan(voll.rate * 6);
  });

  it("fuehrt den Altbestand ohne Kategorie mit Ausbuchung und verknuepfter Buchung", async () => {
    const s = await laden();
    const kueche = zeile(s, "rue-fall-kueche");
    expect(kueche.ruecklage.kategorieId).toBeUndefined();
    expect(kueche.abschlussweg).toBe("ausbuchen");
    const eintrag = s.geschichte.find((g) => g.ruecklageId === "rue-fall-kueche");
    expect(eintrag).toMatchObject({ abschluss: false, beendet: false });
    expect(eintrag!.buchung?.budgetrelevant).toBe(false);
    expect(eintrag!.ungedeckt!).toBeGreaterThan(0);
  });

  it("schlaegt fuer Finanzen eine Ruecklage vor und fuer Familie & Kinder ein Budget", async () => {
    halter.setzen(pluginApi(mitSeed()));
    const ruecklagen = await ruecklagenvorschlaegeLaden(deps, HEUTE);
    expect(ruecklagen.map((v) => v.kategorieId)).toContain("kat-finanzen");
    const budgets = (await budgetbereichLaden(deps, HEUTE)).vorschlaege;
    expect(budgets.map((v) => v.kategorieId)).toContain("kat-familie-kinder");
    // Und jede in genau einer Liste.
    expect(budgets.map((v) => v.kategorieId)).not.toContain("kat-finanzen");
    expect(ruecklagen.map((v) => v.kategorieId)).not.toContain("kat-familie-kinder");
  });

  it("verteilt auf einem unterdeckten Konto anteilig und fuehrt eine Ruecklage ohne Konto", async () => {
    halter.setzen(pluginApi(mitSeed()));
    const geld = await geldJeKontoLaden(deps, HEUTE);
    const knapp = geld.konten.find((k) => k.kontoId === "konto-fall-tagesgeld");
    expect(knapp).toBeDefined();
    expect(knapp!.belegung.posten.length).toBeGreaterThanOrEqual(2);
    expect(knapp!.belegung.frei).toBeLessThan(0);
    // Und mindestens ein zweites Konto traegt Ruecklagen.
    expect(geld.konten.some((k) => k.kontoId === "konto-tagesgeld")).toBe(true);
    expect(geld.ohneKonto.map((r) => r.id)).toContain("rue-fall-geschenke");
  });

  it("zaehlt ein Budget auf der Hauptkategorie ohne die Ruecklage darunter", async () => {
    halter.setzen(pluginApi(mitSeed()));
    const { staende } = await budgetuebersichtLaden(deps, HEUTE);
    const gesundheit = staende.find((s) => s.budget.id === "budget-fall-gesundheit");
    expect(gesundheit?.abgezogen).toContain("Behandlungen");
  });

  it("ordnet eine Ausgabe einer Ruecklage ausserhalb ihrer Kategorie zu — das Budget dort zaehlt sie nicht", async () => {
    const s = await laden();
    const fernseher = zeile(s, "rue-fall-fernseher");
    const [zuordnung] = (await sqliteRuecklagenzuordnungRepository.alle()).filter((z) => z.ruecklageId === "rue-fall-fernseher");
    expect(zuordnung).toBeDefined();
    expect(zuordnung.kategorieId).not.toBe(fernseher.ruecklage.kategorieId);
    const vonAnfang = "2000-01-01";
    const getragen = getrageneBuchungen(s.verlaufsicht, "rue-fall-fernseher", vonAnfang, "2100-01-01").map((p) => p.buchung.id);
    expect(getragen).toContain(zuordnung.istbuchungId);
    const imBudget = getrageneBuchungen(s.verlaufsicht, "budget-freizeit", vonAnfang, "2100-01-01").map((p) => p.buchung.id);
    expect(imBudget).not.toContain(zuordnung.istbuchungId);
  });

  it("zeigt neben einer Ruecklage einen Wertverlust seit einem Kauf vor ihrem Beginn — und was fehlt", async () => {
    const s = await laden();
    const fernseher = zeile(s, "rue-fall-fernseher");
    const kauf = fernseher.ruecklage.kauf!;
    expect(kauf).toBeDefined();
    expect(kauf.datum < fernseher.ruecklage.beginn).toBe(true);
    expect(fernseher.wertverlust!.bisHeute).toBeGreaterThan(fernseher.stand);
    expect(fernseher.wertverlust!.fehlt).toBe(fernseher.wertverlust!.bisHeute - fernseher.stand);
    // Im Verlauf beginnt die zweite Linie vor dem ersten Monat der Ruecklage.
    const linie = ruecklagenWertverlust(fernseher.ruecklage, HEUTE);
    expect(linie[0].monat < ruecklagenVerlauf(s, fernseher.ruecklage, HEUTE)[0].monat).toBe(true);
  });
});
