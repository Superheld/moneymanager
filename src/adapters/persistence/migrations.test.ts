// Migrations-Tests gegen ein echtes In-Memory-SQLite (sql.js, WASM — kein nativer Build,
// CI-tauglich). Validiert die Kette v1–v13 ohne Tauri-Runtime: Schema entsteht sauber,
// alle ALTERs greifen, der Dedup-Index erzwingt die 1:1-Garantie, und die Migration läuft
// auch inkrementell (von einer älteren DB vorwärts). Das ist die Schicht, die reine
// Core-Tests prinzipiell nicht erreichen.

import { beforeAll, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { MIGRATIONS } from "./migrations";
import { migrate, type MigrationsDb } from "./db";

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

/**
 * Wendet die Migrationen im Versionsbereich (from, to] an — wie db.ts, aber gegen sql.js.
 *
 * Die Bedingungen aus `migrate()` gehören hierher gespiegelt, sonst prüft der Test etwas
 * anderes als die App tut. `-- @wennTabelle x` überspringt ein Statement, wenn `x` fehlt;
 * gebraucht beim Umbau einer Tabelle, deren Quelle im zweiten Durchgang schon weg ist.
 *
 * Ebenso gespiegelt: `ALTER TABLE … ADD/DROP COLUMN` wird übersprungen, wenn die Spalte
 * schon da ist bzw. schon fehlt. Ohne das scheitert jeder zweite Durchgang an „duplicate
 * column name" oder „no such column" — und der Test meldete einen Fehler, den die App
 * gar nicht hat, weil `migrate()` beides abfängt.
 *
 * Die Regel dahinter gilt über diese Datei hinaus: was `migrate()` prüft, prüft `apply()`
 * mit. Jede Abweichung heisst, dass der Test etwas anderes misst als die App tut.
 */
function apply(db: Database, from = 0, to = Infinity): void {
  const bedingung = (sql: string) => sql.match(/^\s*--\s*@wennTabelle\s+(\w+)/i)?.[1];
  const hatTabelle = (name: string) =>
    db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0;
  const zugang = (sql: string) => sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
  const abgang = (sql: string) => sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)/i);
  const hatSpalte = (tabelle: string, spalte: string) => {
    const r = db.exec(`PRAGMA table_info(${tabelle})`);
    return r.length > 0 && r[0].values.some((z) => String(z[1]) === spalte);
  };

  for (const m of MIGRATIONS) {
    if (m.version > from && m.version <= to) {
      for (const sql of m.sql) {
        const noetig = bedingung(sql);
        if (noetig && !hatTabelle(noetig)) continue;
        const dazu = zugang(sql);
        if (dazu && hatSpalte(dazu[1], dazu[2])) continue;
        const weg = abgang(sql);
        if (weg && !hatSpalte(weg[1], weg[2])) continue;
        db.run(sql);
      }
    }
  }
}

function tabellen(db: Database): string[] {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return r.length ? r[0].values.map((row) => String(row[0])) : [];
}

function spalten(db: Database, tabelle: string): string[] {
  const r = db.exec(`PRAGMA table_info(${tabelle})`);
  if (!r.length) return [];
  const i = r[0].columns.indexOf("name");
  return r[0].values.map((row) => String(row[i]));
}

function indexExistiert(db: Database, name: string): boolean {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='${name}'`);
  return r.length > 0 && r[0].values.length > 0;
}

const ERWARTETE_TABELLEN = [
  "bankkonto_zuordnung", "bankzugang", // v26 — Bankzugang für den FinTS-Direktabruf
  "buchung_journal", // v53 — was mit einer Buchung geschah, nicht nur ihr letzter Stand
  "budget",
  "depot", "depotposition", "depotwert", // v38 — Depots: Beobachtungen statt Buchungen
  "dubletten_freigabe", // v34 — „kein Duplikat", von Hand festgehalten
  "einstellung", "import_lauf", "inventargegenstand", "ist_buchung",
  "ist_buchung_aufteilung", "kategorie", "kategorie_festlegung", "klassifikator_modell",
  "kontostand_anker", // v35 — was an einem Stichtag wirklich auf dem Konto lag
  "merkmal_ausschluss",
  "person",
  // v44 — der Beleg und was wir daraus gemacht haben, getrennt nach Lebenszyklus
  "umsatz_roh", "umsatz_verarbeitung",
  // v47 — die Zuordnung steht jetzt an der Buchung, `vertrag_zuordnung` ist weg
  "vertrag", "vertrag_erkennung",
  "zahlungskonto", "zahlungsregel",
];

describe("Migration 40 — Kontoklasse vorbelegen", () => {
  it("belegt jedes Konto vor und trifft beim Depot etwas anderes", () => {
    const db = new SQL.Database();
    apply(db);
    db.run(
      `INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, inhaber_ids, kontostand)
       VALUES ('a', 'Giro', 'Giro', NULL, '[]', 0), ('b', 'Depot', 'Depot', NULL, '[]', 0)`,
    );
    // Die Vorbelegung noch einmal fahren — die Statements sind wiederholbar formuliert.
    db.run("UPDATE zahlungskonto SET klasse = 'vorsorge' WHERE klasse IS NULL AND typ = 'Depot'");
    db.run("UPDATE zahlungskonto SET klasse = 'liquide'  WHERE klasse IS NULL");

    const zeilen = db.exec("SELECT id, klasse FROM zahlungskonto ORDER BY id")[0].values;
    expect(zeilen).toEqual([
      ["a", "liquide"],
      ["b", "vorsorge"],
    ]);
    db.close();
  });

  it("überschreibt eine gesetzte Klasse nicht", () => {
    // `WHERE klasse IS NULL` ist der Grund: ein zweiter Lauf darf die Wahl des Nutzers
    // nicht zurücksetzen.
    const db = new SQL.Database();
    apply(db);
    db.run(
      `INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, inhaber_ids, kontostand)
       VALUES ('a', 'Depot', 'Depot', 'liquide', '[]', 0)`,
    );
    db.run("UPDATE zahlungskonto SET klasse = 'vorsorge' WHERE klasse IS NULL AND typ = 'Depot'");

    expect(db.exec("SELECT klasse FROM zahlungskonto")[0].values).toEqual([["liquide"]]);
    db.close();
  });
});

describe("Migrationen — frische Anwendung der ganzen Kette", () => {
  it("legt alle erwarteten Tabellen an", () => {
    const db = new SQL.Database();
    apply(db);
    expect(tabellen(db)).toEqual(ERWARTETE_TABELLEN);
    db.close();
  });

  it("hat die nachträglich per ALTER ergänzten Spalten", () => {
    const db = new SQL.Database();
    apply(db);
    // v8
    expect(spalten(db, "zahlungskonto")).toContain("kontostand");
    // v2/v3
    expect(spalten(db, "zahlungsregel")).toEqual(
      expect.arrayContaining(["konto_id", "kategorie_id", "vertrag_id"]),
    );
    // v17
    expect(spalten(db, "inventargegenstand")).toContain("konto_id");
    // v23 — der Vertrag trägt die Kategorie, an der die Kategorisierungs-Kette hängt
    expect(spalten(db, "vertrag")).toContain("kategorie_id");
    // v9/v10/v11/v13
    expect(spalten(db, "umsatz_roh")).toContain("glaeubiger_id"); // v16, seit v44 in umsatz_roh
    expect(spalten(db, "ist_buchung")).toEqual(
      expect.arrayContaining(["notiz", "transfer_id", "gegenkonto_id", "plan_quelle_id", "plan_faelligkeit", "roh_hash", "kategorie_herkunft"]), // kategorie_herkunft: v20
    );
    // v37 — das Bankfaehigkeitsprofil am Zugang, das getragene Format an der Zuordnung
    expect(spalten(db, "bankzugang")).toContain("profil");
    expect(spalten(db, "bankkonto_zuordnung")).toContain("letztes_format");
    // v39 — die Reparatur von v38. `kennung` identifiziert eine Position innerhalb eines
    // Stichtags; ohne sie schlaegt der erste Depotabruf fehl.
    expect(spalten(db, "depotposition")).toContain("kennung");
    // v40 — wofuer ein Konto da ist, und damit ob sein Saldo als verfuegbar zaehlt
    expect(spalten(db, "zahlungskonto")).toContain("klasse");
    db.close();
  });

  /**
   * v20 fügt die Spalte MIT Default hinzu — und der Default ist die eigentliche Aussage
   * der Migration: der Bestand kam über den Import und das FG-Remapping herein, also
   * automatisch. Ohne ihn stünde dort NULL, und der erste rückwirkende Lauf müsste raten,
   * ob er den ganzen Bestand anfassen darf.
   */
  it("gibt bestehenden Ist-Buchungen die Kategorie-Herkunft „automatisch“ (v20)", () => {
    const db = new SQL.Database();
    apply(db, 0, 19); // Stand VOR der neuen Spalte
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle)
       VALUES ('alt', '2026-01-15', -1234, 'k1', 'kat-lebensmittel', 'Aufwand', 'import')`,
    );

    apply(db, 19, 20);

    const r = db.exec("SELECT kategorie_herkunft FROM ist_buchung WHERE id = 'alt'");
    expect(String(r[0].values[0][0])).toBe("automatisch");
    db.close();
  });

  it("erzeugt den partiellen Unique-Index für die Plan-Dedup", () => {
    const db = new SQL.Database();
    apply(db);
    expect(indexExistiert(db, "ux_ist_planref")).toBe(true);
    db.close();
  });

  it("legt die Einstellungs-Tabelle an (v12, Key/Value)", () => {
    const db = new SQL.Database();
    apply(db);
    expect(spalten(db, "einstellung")).toEqual(["schluessel", "wert"]);
    db.close();
  });

  it("legt Import-Lauf und Umsatz mit Dedup-Indizes an (v14, seit v44 zweigeteilt)", () => {
    const db = new SQL.Database();
    apply(db);
    expect(spalten(db, "import_lauf")).toEqual(
      expect.arrayContaining(["quelle", "zeitpunkt", "dateiname", "eingelesen", "neu", "duplikate"]),
    );
    // Der Beleg trägt, was die Quelle lieferte …
    expect(spalten(db, "umsatz_roh")).toEqual(
      expect.arrayContaining([
        "lauf_id", "buchungstag", "betrag", "roh_hash", "native_id",
      ]),
    );
    // … der Stand, was wir daraus gemacht haben. Die Trennung ist der Punkt: keine dieser
    // Spalten darf zurück in den Beleg wandern.
    expect(spalten(db, "umsatz_verarbeitung")).toEqual(
      expect.arrayContaining([
        "zahlungskonto_id", "status", "vorschlag_kategorie_id", "vorschlag_charakter",
        "vorschlag_quelle", "istbuchung_id", "geaendert_am",
      ]),
    );
    expect(spalten(db, "umsatz_roh")).not.toContain("status");
    // Die Kontozuordnung ist korrigierbar (der Verbuchen-Dialog lässt sie ändern) und
    // deshalb kein Beleg — sonst wäre der Beleg an dieser Stelle doch beschreibbar.
    expect(spalten(db, "umsatz_roh")).not.toContain("zahlungskonto_id");
    // Das Format steht am LAUF und nur dort — eine Zeile gehört zu genau einem Lauf.
    expect(spalten(db, "umsatz_roh")).not.toContain("format");
    expect(spalten(db, "import_lauf")).toContain("format");
    expect(indexExistiert(db, "ix_umsatz_roh_hash")).toBe(true);
    expect(indexExistiert(db, "ix_umsatz_roh_native")).toBe(true);
    db.close();
  });
});

describe("Dedup-Garantie über den Unique-Index", () => {
  function einfuegen(db: Database, id: string, planQuelle: string | null, faellig: string | null) {
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle, plan_quelle_id, plan_faelligkeit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, "2026-06-01", -100, "k1", "Aufwand", "bezahlt-markiert", planQuelle, faellig],
    );
  }

  it("verbietet zwei Ist-Buchungen für denselben Plan-Posten", () => {
    const db = new SQL.Database();
    apply(db);
    einfuegen(db, "i1", "r1", "2026-06-01");
    expect(() => einfuegen(db, "i2", "r1", "2026-06-01")).toThrow();
    db.close();
  });

  it("erlaubt mehrere freie (planlose) Buchungen", () => {
    const db = new SQL.Database();
    apply(db);
    einfuegen(db, "m1", null, null);
    expect(() => einfuegen(db, "m2", null, null)).not.toThrow();
    db.close();
  });
});

describe("Inkrementelle Migration von einer älteren DB", () => {
  it("wendet v9–v11 auf eine v8-DB an, ohne Fehler", () => {
    const db = new SQL.Database();
    apply(db, 0, 8); // alte DB: bis v8
    expect(tabellen(db)).not.toContain("ist_buchung");
    apply(db, 8); // nachziehen
    expect(tabellen(db)).toContain("ist_buchung");
    expect(spalten(db, "ist_buchung")).toEqual(
      expect.arrayContaining(["notiz", "transfer_id", "gegenkonto_id"]),
    );
    db.close();
  });
});

describe("Alpha-Aufräumen (v18)", () => {
  it("räumt Szenario-Tabellen und Ersatz-Topf-Spalten ab, wenn es sie gab", () => {
    const db = new SQL.Database();
    apply(db, 0, 17); // Stand vor dem Aufräumen
    expect(tabellen(db)).toEqual(expect.arrayContaining(["szenario", "szenario_posten"]));
    expect(spalten(db, "topf")).toEqual(
      expect.arrayContaining(["wiederbeschaffung", "nutzungsdauer_monate", "inventar_id"]),
    );

    apply(db, 17, 18); // NUR v18 — v31 räumt die Tabelle später ganz ab.

    expect(tabellen(db)).not.toContain("szenario");
    expect(tabellen(db)).not.toContain("szenario_posten");
    expect(spalten(db, "topf")).toEqual(["id", "typ", "bezeichnung", "start", "kategorie_id", "schaetzbetrag", "frist_monate", "zufuehrung_pro_monat", "sparziel"]);
    db.close();
  });
});

describe("Budget-Umbau (v30/v31)", () => {
  it("überführt ein Bestandsbudget in die neue Form und wählt ein Konto", () => {
    const db = new SQL.Database();
    apply(db, 0, 29);
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('giro','Girokonto','Giro','[]')");
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('bar','Bargeld','Bargeld','[]')");
    db.run("INSERT INTO budget (id, kategorie_id, rahmen, periode) VALUES ('b1','k1',43000,'monatlich')");
    db.run("INSERT INTO budget (id, kategorie_id, rahmen, periode) VALUES ('b2','k2',480000,'jaehrlich')");

    apply(db, 29, 30);

    const zeilen = db.exec("SELECT id, betrag_pro_monat, art, konto_id, start FROM budget ORDER BY id")[0].values;
    // Das jährliche Budget wird auf seinen Monatsanteil umgerechnet, nicht abgeschnitten.
    expect(zeilen).toEqual([
      ["b1", 43000, "monatlich", "giro", "2026-08-01"],
      ["b2", 40000, "monatlich", "giro", "2026-08-01"],
    ]);
    db.close();
  });

  it("räumt erst danach ab — und übersteht einen Abbruch dazwischen", () => {
    // Der Grund für die Trennung in zwei Versionen: v30 LIEST periode und rahmen. Liefe
    // das Abräumen in derselben Version und bräche der Lauf dazwischen ab, fände v30
    // beim nächsten Start die Spalten nicht mehr — SQLite prüft Spaltennamen beim
    // Parsen, und die App käme nicht mehr hoch.
    const db = new SQL.Database();
    apply(db, 0, 30);
    expect(spalten(db, "budget")).toContain("rahmen");
    expect(tabellen(db)).toContain("topf");

    apply(db, 30, 31);

    expect(spalten(db, "budget")).not.toContain("rahmen");
    expect(spalten(db, "budget")).not.toContain("periode");
    expect(tabellen(db)).not.toContain("topf");
    expect(spalten(db, "ist_buchung")).not.toContain("verwendung_topf_id");
    db.close();
  });
});

describe("Kontostands-Anker (v35/v36)", () => {
  it("macht aus dem zuletzt gemeldeten Saldo den ersten Anker", () => {
    // Sonst begänne die Historie bei null und die erste brauchbare Aussage („seit wann
    // stimmt es nicht mehr?") käme erst nach dem übernächsten Abruf.
    const db = new SQL.Database();
    apply(db, 0, 34);
    db.run(
      `INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id, bank_saldo, bank_saldo_datum)
       VALUES ('z1', 's1', 'giro', 145678, '2026-08-20')`,
    );
    // Ein Konto ohne gemeldeten Stand darf keinen Anker erzeugen.
    db.run(
      `INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id)
       VALUES ('z1', 's2', 'depot')`,
    );

    apply(db, 34, 35);

    expect(db.exec("SELECT konto_id, datum, herkunft, betrag FROM kontostand_anker")[0].values).toEqual([
      ["giro", "2026-08-20", "bank", 145678],
    ]);
    db.close();
  });

  it("läuft zweimal, ohne zu doppeln", () => {
    const db = new SQL.Database();
    apply(db, 0, 34);
    db.run(
      `INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id, bank_saldo, bank_saldo_datum)
       VALUES ('z1', 's1', 'giro', 145678, '2026-08-20')`,
    );
    apply(db, 34, 35);
    apply(db, 34, 35);
    expect(db.exec("SELECT count(*) FROM kontostand_anker")[0].values).toEqual([[1]]);
    db.close();
  });

  it("räumt die alten Spalten erst in der NÄCHSTEN Version ab", () => {
    // Getrennte Versionen, weil v35 sie liest: bräche der Lauf dazwischen ab, liefe v35
    // beim nächsten Start gegen fehlende Spalten und die App käme nicht mehr hoch.
    const db = new SQL.Database();
    apply(db, 0, 35);
    expect(spalten(db, "bankkonto_zuordnung")).toContain("bank_saldo");
    apply(db, 35, 36);
    expect(spalten(db, "bankkonto_zuordnung")).not.toContain("bank_saldo");
    expect(spalten(db, "bankkonto_zuordnung")).not.toContain("bank_saldo_datum");
    db.close();
  });
});

describe("Verwaiste Umsätze (v33)", () => {
  function umsatz(db: InstanceType<typeof SQL.Database>, id: string, istId: string | null) {
    db.run(
      `INSERT INTO umsatz (id, lauf_id, zahlungskonto_id, buchungstag, betrag, waehrung,
         gegenpartei, verwendungszweck, roh_hash, status, istbuchung_id)
       VALUES (?, 'l1', 'giro', '2026-08-11', -5700, 'EUR', 'Laden', 'Zweck', ?, 'verbucht', ?)`,
      [id, `h-${id}`, istId],
    );
  }

  it("legt weg, was auf eine gelöschte Buchung zeigt — und lässt den Rest in Ruhe", () => {
    const db = new SQL.Database();
    apply(db, 0, 32);
    db.run("INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle) VALUES ('b-da','2026-08-11',-5700,'giro','Aufwand','import')");
    umsatz(db, "u-heil", "b-da");
    umsatz(db, "u-verwaist", "b-weg");
    umsatz(db, "u-ohne", null);

    apply(db, 32, 33);

    const zeilen = db.exec("SELECT id, status, istbuchung_id FROM umsatz ORDER BY id")[0].values;
    expect(zeilen).toEqual([
      ["u-heil", "verbucht", "b-da"],
      ["u-ohne", "verworfen", null],
      ["u-verwaist", "verworfen", null],
    ]);
    db.close();
  });

  it("ein zweiter Durchgang ändert nichts", () => {
    const db = new SQL.Database();
    apply(db, 0, 32);
    umsatz(db, "u-verwaist", "b-weg");
    apply(db, 32, 33);
    const vorher = db.exec("SELECT id, status FROM umsatz")[0].values;
    apply(db, 32, 33);
    expect(db.exec("SELECT id, status FROM umsatz")[0].values).toEqual(vorher);
    db.close();
  });
});


describe("Migration 44 — Beleg und Verarbeitung trennen", () => {
  /** Eine Umsatzzeile im ALTEN Schema (vor v44), wie sie im Bestand steht. */
  function altzeile(
    db: InstanceType<typeof SQL.Database>,
    id: string,
    over: { status?: string; istId?: string | null; valuta?: string } = {},
  ) {
    db.run(
      `INSERT INTO umsatz (id, lauf_id, zahlungskonto_id, buchungstag, valuta, betrag,
         waehrung, gegenpartei, verwendungszweck, roh_hash, status, istbuchung_id,
         vorschlag_charakter, vorschlag_quelle)
       VALUES (?, 'l1', 'giro', '2026-08-11', ?, -5700, 'EUR', 'Kesselmann', 'Rechnung', ?,
               ?, ?, 'Aufwand', 'regel')`,
      [id, over.valuta ?? null, `h-${id}`, over.status ?? "neu", over.istId ?? null],
    );
  }

  function vorbereitet() {
    const db = new SQL.Database();
    apply(db, 0, 43);
    db.run("INSERT INTO import_lauf (id, quelle, zeitpunkt) VALUES ('l1','fints','2026-08-11T09:00:00.000Z')");
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('giro','Girokonto','Giro','[]')");
    return db;
  }

  it("verteilt jede Zeile auf Beleg und Verarbeitungsstand", () => {
    const db = vorbereitet();
    altzeile(db, "u1", { valuta: "2026-08-12" });
    apply(db, 43, 44);

    expect(db.exec("SELECT gegenpartei, valuta FROM umsatz_roh WHERE id='u1'")[0].values)
      .toEqual([["Kesselmann", "2026-08-12"]]);
    expect(db.exec("SELECT status, vorschlag_quelle, zahlungskonto_id FROM umsatz_verarbeitung WHERE umsatz_id='u1'")[0].values)
      .toEqual([["neu", "regel", "giro"]]);
    // Die alte Tabelle ist weg — nicht zurückgelassen, damit niemand versehentlich
    // weiterhin dorthin schreibt.
    expect(db.exec("SELECT name FROM sqlite_master WHERE name='umsatz'")).toEqual([]);
    db.close();
  });

  /**
   * Am echten Bestand gemessen und der Grund, warum diese Migration mehr tut als kopieren:
   * es stehen Zeilen auf „verbucht", deren Buchung es nicht mehr gibt. Mit dem
   * Fremdschlüssel auf `ist_buchung` scheiterte das Kopieren daran — und zwar NUR in der
   * App, weil sqlx Fremdschlüssel einschaltet und die sqlite3-CLI nicht.
   */
  it("stellt eine Zeile zurück, deren Buchung es nicht mehr gibt", () => {
    const db = vorbereitet();
    db.run("INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle) VALUES ('b-da','2026-08-11',-5700,'giro','Aufwand','import')");
    altzeile(db, "u-heil", { status: "verbucht", istId: "b-da" });
    altzeile(db, "u-verwaist", { status: "verbucht", istId: "b-weg" });

    apply(db, 43, 44);

    const zeilen = db.exec("SELECT umsatz_id, status, istbuchung_id FROM umsatz_verarbeitung ORDER BY umsatz_id")[0].values;
    expect(zeilen).toEqual([
      ["u-heil", "verbucht", "b-da"],
      // Zurück auf „neu" und NICHT gelöscht: die Zeile steht wieder in der Durchsicht,
      // die Entscheidung trifft ein Mensch.
      ["u-verwaist", "neu", null],
    ]);
    // Der Beleg bleibt in jedem Fall erhalten.
    expect(db.exec("SELECT COUNT(*) FROM umsatz_roh")[0].values).toEqual([[2]]);
    db.close();
  });

  it("übernimmt als Änderungszeitpunkt den Lauf, nicht das Jetzt", () => {
    const db = vorbereitet();
    altzeile(db, "u1");
    apply(db, 43, 44);
    expect(db.exec("SELECT geaendert_am FROM umsatz_verarbeitung WHERE umsatz_id='u1'")[0].values)
      .toEqual([["2026-08-11T09:00:00.000Z"]]);
    db.close();
  });

  /**
   * Die Migration bricht mittendrin ab, die Version steht noch nicht, der nächste Start
   * wiederholt sie — dann gibt es `umsatz` nicht mehr, und ein `INSERT … SELECT` daraus
   * scheiterte an „no such table". Dagegen steht `-- @wennTabelle`.
   */
  it("läuft ein zweites Mal folgenlos durch", () => {
    const db = vorbereitet();
    altzeile(db, "u1");
    apply(db, 43, 44);
    const vorher = db.exec("SELECT umsatz_id, status FROM umsatz_verarbeitung")[0].values;
    expect(() => apply(db, 43, 44)).not.toThrow();
    expect(db.exec("SELECT umsatz_id, status FROM umsatz_verarbeitung")[0].values).toEqual(vorher);
    db.close();
  });

  /**
   * Der Grund, warum die Trennung überhaupt gebaut wurde: „auf den Stand der Quelle
   * zurücksetzen" ist jetzt ein DELETE auf EINER Tabelle, und der Beleg merkt nichts.
   */
  it("lässt den Verarbeitungsstand löschen, ohne den Beleg anzutasten", () => {
    const db = vorbereitet();
    altzeile(db, "u1", { status: "verbucht", istId: null });
    apply(db, 43, 44);

    db.run("DELETE FROM umsatz_verarbeitung WHERE umsatz_id='u1'");

    expect(db.exec("SELECT gegenpartei FROM umsatz_roh WHERE id='u1'")[0].values)
      .toEqual([["Kesselmann"]]);
    db.close();
  });

  /**
   * Umgekehrt hängt der Stand am Beleg: verschwindet der Beleg, hat der Stand keinen
   * Gegenstand mehr. Das erledigt ON DELETE CASCADE — geprüft mit EINGESCHALTETEN
   * Fremdschlüsseln, weil sql.js sie standardmässig aus hat und die App (über sqlx) an.
   */
  it("nimmt den Verarbeitungsstand mit, wenn der Beleg gelöscht wird", () => {
    const db = vorbereitet();
    altzeile(db, "u1");
    apply(db, 43, 44);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM umsatz_roh WHERE id='u1'");

    expect(db.exec("SELECT COUNT(*) FROM umsatz_verarbeitung")[0].values).toEqual([[0]]);
    db.close();
  });
});


describe("Migration 45 — der tote Verdacht faellt, die Freigabe wird abgesichert", () => {
  function vorbereitet() {
    const db = new SQL.Database();
    apply(db, 0, 44);
    db.run("INSERT INTO import_lauf (id, quelle, zeitpunkt) VALUES ('l1','fints','2026-08-11T09:00:00.000Z')");
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('giro','Girokonto','Giro','[]')");
    for (const id of ["u1", "u2"]) {
      db.run(
        `INSERT INTO umsatz_roh (id, lauf_id, buchungstag, betrag, waehrung, gegenpartei,
           verwendungszweck, roh_hash) VALUES (?, 'l1', '2026-08-11', -5700, 'EUR', 'Kesselmann', 'Rechnung', ?)`,
        [id, `h-${id}`],
      );
      db.run(
        `INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, geaendert_am)
         VALUES (?, 'giro', 'neu', '2026-08-11T09:00:00.000Z')`,
        [id],
      );
    }
    return db;
  }

  it("nimmt die Verdachtsspalten weg", () => {
    const db = vorbereitet();
    apply(db, 44, 45);
    expect(spalten(db, "umsatz_verarbeitung")).not.toContain("verdacht_auf_id");
    expect(spalten(db, "umsatz_verarbeitung")).not.toContain("verdacht_gruende");
    db.close();
  });

  /**
   * Die FREIGABE bleibt, und zwar mit Inhalt: „diese beiden sind nicht dasselbe" ist eine
   * Entscheidung des Menschen und aus den Daten nicht wiederherstellbar. Wer sie beim
   * Umbau der Tabelle verliert, bekommt morgen dieselbe Mahnung wieder.
   */
  it("rettet vorhandene Freigaben in die neue Tabelle", () => {
    const db = vorbereitet();
    db.run("INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES ('u1','u2','2026-08-12T00:00:00.000Z')");

    apply(db, 44, 45);

    expect(db.exec("SELECT umsatz_a, umsatz_b FROM dubletten_freigabe")[0].values)
      .toEqual([["u1", "u2"]]);
    db.close();
  });

  it("laesst eine verwaiste Freigabe zurueck, statt am Fremdschluessel zu scheitern", () => {
    const db = vorbereitet();
    db.run("INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES ('u1','weg','2026-08-12T00:00:00.000Z')");

    expect(() => apply(db, 44, 45)).not.toThrow();
    expect(db.exec("SELECT COUNT(*) FROM dubletten_freigabe")[0].values).toEqual([[0]]);
    db.close();
  });

  /**
   * Der Grund fuer den ganzen Tabellenumbau: bisher blieb ein Freigabe-Paar nach dem
   * Loeschen einer Zeile stehen und griff beim naechsten Import nicht mehr, weil die neue
   * Zeile eine neue ID hat. Jetzt raeumt der Fremdschluessel mit auf.
   */
  it("raeumt die Freigabe mit weg, wenn ein Beleg geloescht wird", () => {
    const db = vorbereitet();
    db.run("INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES ('u1','u2','2026-08-12T00:00:00.000Z')");
    apply(db, 44, 45);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM umsatz_roh WHERE id='u1'");

    expect(db.exec("SELECT COUNT(*) FROM dubletten_freigabe")[0].values).toEqual([[0]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = vorbereitet();
    db.run("INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES ('u1','u2','2026-08-12T00:00:00.000Z')");
    apply(db, 44, 45);
    const vorher = db.exec("SELECT umsatz_a, umsatz_b FROM dubletten_freigabe")[0].values;
    expect(() => apply(db, 44, 45)).not.toThrow();
    expect(db.exec("SELECT umsatz_a, umsatz_b FROM dubletten_freigabe")[0].values).toEqual(vorher);
    db.close();
  });
});


describe("Migration 46 — der Dedup-Griff ins Ledger", () => {
  /**
   * Gemessen und nicht vermutet: die Abfrage aus `bestandsSchluessel` lief als SCAN. Der
   * Test prüft deshalb den ABFRAGEPLAN und nicht bloss, dass ein Index existiert — ein
   * Index, den der Planer nicht nimmt, ist keiner.
   */
  it("laesst die Dedup-Abfrage ueber den Index laufen statt zu scannen", () => {
    const db = new SQL.Database();
    apply(db);
    const plan = db.exec(
      "EXPLAIN QUERY PLAN SELECT roh_hash FROM ist_buchung WHERE roh_hash IS NOT NULL",
    )[0].values.map((z) => String(z[3])).join(" ");
    expect(plan).toContain("ix_ist_buchung_roh_hash");
    expect(plan).not.toContain("SCAN ist_buchung");
    db.close();
  });

  /**
   * Teilindex: von Hand erfasste Buchungen tragen keinen Roh-Hash und interessieren beim
   * Dedup nie. Steht das WHERE nicht im Index, traegt er sie mit.
   */
  it("nimmt nur Buchungen mit Roh-Hash auf", () => {
    const db = new SQL.Database();
    apply(db);
    const sql = String(
      db.exec("SELECT sql FROM sqlite_master WHERE name='ix_ist_buchung_roh_hash'")[0].values[0][0],
    );
    expect(sql).toContain("WHERE roh_hash IS NOT NULL");
    db.close();
  });
});


describe("Migration 47 — die Vertragszuordnung wandert an die Buchung", () => {
  function vorbereitet() {
    const db = new SQL.Database();
    apply(db, 0, 46);
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('giro','Girokonto','Giro','[]')");
    db.run(`INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status, art)
            VALUES ('v1','Talmberg Energie','2026-01-01','automatisch','aktiv','laufend')`);
    for (const id of ["b-zugeordnet", "b-ausdruecklich-keiner", "b-unberuehrt"]) {
      db.run(
        `INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
         VALUES (?, '2026-08-11', -4500, 'giro', 'Aufwand', 'import')`,
        [id],
      );
    }
    return db;
  }

  it("uebernimmt eine Zuordnung als Spalten der Buchung", () => {
    const db = vorbereitet();
    db.run("INSERT INTO vertrag_zuordnung (istbuchung_id, vertrag_id, herkunft) VALUES ('b-zugeordnet','v1','automatisch')");

    apply(db, 46, 47);

    expect(db.exec("SELECT vertrag_id, vertrag_herkunft FROM ist_buchung WHERE id='b-zugeordnet'")[0].values)
      .toEqual([["v1", "automatisch"]]);
    expect(db.exec("SELECT name FROM sqlite_master WHERE name='vertrag_zuordnung'")).toEqual([]);
    db.close();
  });

  /**
   * DIE STELLE, an der die Fachlichkeit hängt. In der alten Tabelle trug die blosse
   * EXISTENZ der Zeile die Aussage „hier wurde entschieden". Als Spalte wäre
   * `vertrag_id IS NULL` zweideutig: „noch nie zugeordnet" gegen „gehört ausdrücklich zu
   * keinem Vertrag". Die zweite ist eine Handentscheidung, die einen Fehlgriff der
   * Automatik korrigiert — geht sie verloren, kommt der Fehlgriff beim nächsten Abgleich
   * zurück.
   *
   * Unterschieden werden die beiden Fälle jetzt an `vertrag_herkunft`.
   */
  it("haelt ein ausdrueckliches Nein von noch-nie-entschieden auseinander", () => {
    const db = vorbereitet();
    db.run("INSERT INTO vertrag_zuordnung (istbuchung_id, vertrag_id, herkunft) VALUES ('b-ausdruecklich-keiner', NULL, 'manuell')");

    apply(db, 46, 47);

    const [entschieden] = db.exec(
      "SELECT vertrag_id, vertrag_herkunft FROM ist_buchung WHERE id='b-ausdruecklich-keiner'",
    )[0].values;
    expect(entschieden).toEqual([null, "manuell"]);

    // Die unberuehrte Buchung hat BEIDES leer — daran haengt, dass die Automatik ran darf.
    const [unberuehrt] = db.exec(
      "SELECT vertrag_id, vertrag_herkunft FROM ist_buchung WHERE id='b-unberuehrt'",
    )[0].values;
    expect(unberuehrt).toEqual([null, null]);
    db.close();
  });

  /**
   * Am echten Bestand gemessen und der eigentliche Anlass des Umbaus: es standen
   * Zuordnungen zu Buchungen da, die es nicht mehr gab. Sie haben nach dem Umzug keinen
   * Ort mehr — und koennen nicht wiederkommen, weil Zuordnung und Buchung dieselbe Zeile
   * sind.
   */
  it("laesst eine Zuordnung ohne Buchung zurueck", () => {
    const db = vorbereitet();
    db.run("INSERT INTO vertrag_zuordnung (istbuchung_id, vertrag_id, herkunft) VALUES ('gibtesnicht','v1','automatisch')");

    expect(() => apply(db, 46, 47)).not.toThrow();
    expect(db.exec("SELECT COUNT(*) FROM ist_buchung WHERE vertrag_herkunft IS NOT NULL")[0].values)
      .toEqual([[0]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = vorbereitet();
    db.run("INSERT INTO vertrag_zuordnung (istbuchung_id, vertrag_id, herkunft) VALUES ('b-zugeordnet','v1','automatisch')");
    apply(db, 46, 47);
    const vorher = db.exec("SELECT id, vertrag_id, vertrag_herkunft FROM ist_buchung ORDER BY id")[0].values;
    expect(() => apply(db, 46, 47)).not.toThrow();
    expect(db.exec("SELECT id, vertrag_id, vertrag_herkunft FROM ist_buchung ORDER BY id")[0].values)
      .toEqual(vorher);
    db.close();
  });

  it("laesst die Zahlungen eines Vertrags ueber den Index finden", () => {
    const db = new SQL.Database();
    apply(db);
    const plan = db.exec(
      "EXPLAIN QUERY PLAN SELECT id FROM ist_buchung WHERE vertrag_id = 'v1'",
    )[0].values.map((z) => String(z[3])).join(" ");
    expect(plan).toContain("ix_ist_buchung_vertrag");
    db.close();
  });
});


describe("Migrationen 48/49 — Fremdschluessel fuer die Achse Buchung-Konto-Kategorie", () => {
  function bestand() {
    const db = new SQL.Database();
    apply(db, 0, 47);
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('giro','Girokonto','Giro','[]')");
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('bar','Bargeld','Bargeld','[]')");
    db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat','Lebensmittel','Aufwand')");
    return db;
  }

  function buchung(db: InstanceType<typeof SQL.Database>, id: string, katId: string | null) {
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle,
         notiz, transfer_id, gegenkonto_id, kategorie_herkunft, zu_pruefen, roh_hash)
       VALUES (?, '2026-08-11', -4500, 'giro', ?, 'Aufwand', 'import',
         'eine Notiz', 't-1', 'bar', 'manuell', 1, ?)`,
      [id, katId, `h-${id}`],
    );
  }

  /**
   * Am Bestand gemessen: es zeigen Buchungen auf geloeschte Kategorien. In der Anzeige
   * sieht das aus wie "ohne Kategorie" — in einer Auswertung, die ueber die Kategorie
   * gruppiert, faellt die Zeile still heraus.
   */
  it("raeumt Verweise auf geloeschte Kategorien auf, statt sie mitzuschleppen", () => {
    const db = bestand();
    buchung(db, "b-heil", "kat");
    buchung(db, "b-verwaist", "weg");

    apply(db, 47, 48);

    expect(db.exec("SELECT id, kategorie_id FROM ist_buchung ORDER BY id")[0].values).toEqual([
      // Die Buchung bleibt und ist richtig — nur ihre Einordnung ist verlorengegangen.
      ["b-heil", "kat"],
      ["b-verwaist", null],
    ]);
    db.close();
  });

  /**
   * DIE RISKANTESTE STELLE DES GANZEN UMBAUS. SQLite kann Constraints nicht nachruesten,
   * die Tabelle wird also neu gebaut und umkopiert. Eine dabei vergessene Spalte faellt
   * niemandem auf — sie ist einfach leer, und das Ledger ist die falsche Tabelle, um das
   * erst spaeter zu merken.
   */
  it("traegt beim Neubau der Buchungstabelle JEDEN Wert mit", () => {
    const db = bestand();
    db.run(`INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status, art)
            VALUES ('v1','Talmberg Energie','2026-01-01','automatisch','aktiv','laufend')`);
    buchung(db, "b1", "kat");
    db.run("UPDATE ist_buchung SET vertrag_id='v1', vertrag_herkunft='manuell', plan_quelle_id='r1', plan_faelligkeit='2026-08-01'");

    const vorher = db.exec("SELECT * FROM ist_buchung")[0];
    apply(db, 47, 49);
    const nachher = db.exec("SELECT * FROM ist_buchung")[0];

    expect(nachher.columns).toEqual(vorher.columns);
    expect(nachher.values).toEqual(vorher.values);
    db.close();
  });

  it("haelt die Indizes der Buchungstabelle ueber den Neubau", () => {
    const db = new SQL.Database();
    apply(db);
    for (const i of ["ux_ist_planref", "ix_ist_buchung_roh_hash", "ix_ist_buchung_vertrag"]) {
      expect(indexExistiert(db, i)).toBe(true);
    }
    db.close();
  });

  /**
   * Die Loeschregeln sind fachliche Entscheidungen, keine Formsache — deshalb wird jede
   * einzeln geprueft und nicht bloss, dass "Fremdschluessel da sind".
   */
  it("nimmt Aufteilungen mit, wenn ihre Buchung faellt", () => {
    const db = bestand();
    buchung(db, "b1", "kat");
    db.run("INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag) VALUES ('a1','b1','kat',-4500)");
    apply(db, 47, 49);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM ist_buchung WHERE id='b1'");
    expect(db.exec("SELECT COUNT(*) FROM ist_buchung_aufteilung")[0].values).toEqual([[0]]);
    db.close();
  });

  it("laesst die Buchung stehen, wenn ihre Kategorie faellt", () => {
    const db = bestand();
    buchung(db, "b1", "kat");
    apply(db, 47, 49);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM kategorie WHERE id='kat'");
    // Die Zahlung hat stattgefunden — nur ihre Einordnung ist weg.
    expect(db.exec("SELECT id, kategorie_id FROM ist_buchung")[0].values).toEqual([["b1", null]]);
    db.close();
  });

  /**
   * Andersherum als die beiden davor: ein Konto mit Buchungen darf NICHT verschwinden.
   * Ohne diese Sperre faellt sein Geld aus jedem Saldo, und die Buchungen zeigen ins Leere.
   */
  it("verweigert das Loeschen eines Kontos, an dem Buchungen haengen", () => {
    const db = bestand();
    buchung(db, "b1", "kat");
    apply(db, 47, 49);

    db.run("PRAGMA foreign_keys = ON");
    expect(() => db.run("DELETE FROM zahlungskonto WHERE id='giro'")).toThrow();
    db.close();
  });

  it("nimmt Depotwerte und -positionen mit ihrem Depot", () => {
    const db = bestand();
    db.run(`INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
            VALUES ('z1','Talmberger Bank','https://example.invalid','99999999','nutzer','2026-08-11T00:00:00.000Z')`);
    db.run("INSERT INTO depot (id, zugang_id, schluessel, bezeichnung) VALUES ('d1','z1','s1','Depot')");
    db.run("INSERT INTO depotwert (depot_id, stichtag, gesamtwert, erfasst_am) VALUES ('d1','2026-08-11',100000,'2026-08-11T00:00:00.000Z')");
    db.run("INSERT INTO depotposition (depot_id, stichtag, kennung) VALUES ('d1','2026-08-11','k1')");
    apply(db, 47, 49);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM depot WHERE id='d1'");
    expect(db.exec("SELECT COUNT(*) FROM depotwert")[0].values).toEqual([[0]]);
    expect(db.exec("SELECT COUNT(*) FROM depotposition")[0].values).toEqual([[0]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = bestand();
    buchung(db, "b1", "kat");
    apply(db, 47, 49);
    const vorher = db.exec("SELECT * FROM ist_buchung")[0].values;
    expect(() => apply(db, 47, 49)).not.toThrow();
    expect(db.exec("SELECT * FROM ist_buchung")[0].values).toEqual(vorher);
    db.close();
  });

  /**
   * Die Gesamtprobe: nach der ganzen Kette darf SQLite selbst nichts zu bemaengeln haben.
   * Mit eingeschalteten Fremdschluesseln, so wie die App laeuft — sql.js hat sie aus.
   */
  it("hinterlaesst eine Datenbank ohne verletzte Fremdschluessel", () => {
    const db = bestand();
    buchung(db, "b1", "kat");
    apply(db, 47);
    db.run("PRAGMA foreign_keys = ON");
    expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
    db.close();
  });
});


describe("Migration 50 — der Rest der Verweise", () => {
  /**
   * Der Nachweis, dass hier nichts unter den Tisch faellt: nach der ganzen Kette traegt
   * JEDE Verweisspalte, die auf eine unserer Tabellen zeigt, auch einen Fremdschluessel.
   * Ohne so einen Test bleibt beim naechsten Umbau eine Tabelle uebrig, und niemand
   * merkt es — die Datenbank laeuft ja weiter.
   *
   * Die Ausnahmen stehen NAMENTLICH da und mit Grund. Eine Ausnahmeliste ohne Begruendung
   * waechst, bis sie alles enthaelt.
   */
  it("laesst keine Verweisspalte ohne Fremdschluessel zurueck", () => {
    const db = new SQL.Database();
    apply(db);

    const OHNE_SCHLUESSEL_MIT_GRUND = new Set([
      // Keine Verweise auf unsere Tabellen, sondern Kennungen der Bank bzw. der Quelle.
      "bankzugang.kunden_id", "bankzugang.tan_verfahren_id",
      "umsatz_roh.glaeubiger_id", "umsatz_roh.native_id",
      // Gemeinsame Marke der beiden Beine einer Umbuchung, kein Verweis auf eine Zeile.
      "ist_buchung.transfer_id",
      // Verweist auf eine PROJIZIERTE Faelligkeit, die es als Zeile nicht gibt.
      "ist_buchung.plan_quelle_id",
      // JSON-Liste, kein Einzelverweis.
      "zahlungskonto.inhaber_ids",
      // Das Journal muss die LOESCHUNG ueberleben — dafuer gibt es die Tabelle. Ein
      // Schluessel mit CASCADE raeumte genau den Eintrag weg, der die Loeschung
      // festhaelt; einer mit RESTRICT verboete das Loeschen ganz.
      "buchung_journal.istbuchung_id",
    ]);

    const tabellen = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migration'")[0]
      .values.map((z) => String(z[0]));

    const ohne: string[] = [];
    for (const tabelle of tabellen) {
      const spalten = db.exec(`PRAGMA table_info(${tabelle})`)[0].values;
      const fk = db.exec(`PRAGMA foreign_key_list(${tabelle})`);
      const abgesichert = new Set(
        fk.length ? fk[0].values.map((z) => String(z[3])) : [],
      );
      for (const s of spalten) {
        const name = String(s[1]);
        const istPk = Number(s[5]) > 0;
        if (istPk && name === "id") continue;
        if (!name.endsWith("_id") && !name.endsWith("_ids")) continue;
        const voll = `${tabelle}.${name}`;
        if (OHNE_SCHLUESSEL_MIT_GRUND.has(voll)) continue;
        if (!abgesichert.has(name)) ohne.push(voll);
      }
    }

    expect(ohne).toEqual([]);
    db.close();
  });

  it("laesst ein Budget mit seiner Kategorie fallen, eine Zahlungsregel aber nicht", () => {
    const db = new SQL.Database();
    apply(db);
    db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat','Wohnen','Aufwand')");
    db.run("INSERT INTO budget (id, kategorie_id, betrag_pro_monat, art) VALUES ('b1','kat',-50000,'monatlich')");
    db.run(`INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, kategorie_id)
            VALUES ('r1','Miete',-50000,'monatlich','2026-01-01','Aufwand','kat')`);

    db.run("PRAGMA foreign_keys = ON");
    db.run("DELETE FROM kategorie WHERE id='kat'");

    // Ein Budget OHNE Kategorie haette keinen Gegenstand — es faellt mit.
    expect(db.exec("SELECT COUNT(*) FROM budget")[0].values).toEqual([[0]]);
    // Eine Zahlungsregel dagegen bleibt und ist nur uneingeordnet: die Zahlung findet
    // weiter statt, sie gehoert nur gerade nirgendwohin.
    expect(db.exec("SELECT id, kategorie_id FROM zahlungsregel")[0].values).toEqual([["r1", null]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = new SQL.Database();
    apply(db);
    db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat','Wohnen','Aufwand')");
    const vorher = db.exec("SELECT id, name FROM kategorie")[0].values;
    expect(() => apply(db, 49)).not.toThrow();
    expect(db.exec("SELECT id, name FROM kategorie")[0].values).toEqual(vorher);
    db.close();
  });
});


describe("Migration 54 — zwei Einordnungen der Bank", () => {
  it("legt Zweckcode und Endempfaenger am Beleg an", () => {
    const db = new SQL.Database();
    apply(db);
    // Am BELEG und nicht am Verarbeitungsstand: beides kommt von der Bank und aendert
    // sich nie wieder.
    expect(spalten(db, "umsatz_roh")).toEqual(
      expect.arrayContaining(["zweck_code", "endempfaenger"]),
    );
    expect(spalten(db, "umsatz_verarbeitung")).not.toContain("zweck_code");
    db.close();
  });

  it("laesst nach dem Zweckcode ueber den Index suchen", () => {
    const db = new SQL.Database();
    apply(db);
    const plan = db.exec(
      "EXPLAIN QUERY PLAN SELECT id FROM umsatz_roh WHERE zweck_code = 'SALA'",
    )[0].values.map((z) => String(z[3])).join(" ");
    expect(plan).toContain("ix_umsatz_roh_zweck");
    db.close();
  });
});


describe("Migration 56 — Abrufe von vor v42 finden ihren Zugang", () => {
  function bestand() {
    const db = new SQL.Database();
    apply(db, 0, 55);
    db.run(`INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
            VALUES ('z1','Talmberger Bank','https://example.invalid','99999998','nutzer','2026-08-01T00:00:00.000Z')`);
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('k1','Girokonto','Giro','[]')");
    db.run(`INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id)
            VALUES ('z1','s1','k1')`);
    return db;
  }

  /** Ein Abruf im Zustand von vor v42: ohne zugang_id und ohne zahlungskonto_id. */
  function altlauf(db: InstanceType<typeof SQL.Database>, id: string, dateiname: string | null) {
    db.run(
      `INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname) VALUES (?, 'fints', ?, ?)`,
      [id, "2026-08-11T09:00:00.000Z", dateiname],
    );
  }

  it("leitet den Zugang aus den Zeilen des Laufs ab", () => {
    const db = bestand();
    altlauf(db, "l1", null);
    db.run(`INSERT INTO umsatz_roh (id, lauf_id, buchungstag, betrag, waehrung, gegenpartei,
              verwendungszweck, roh_hash) VALUES ('u1','l1','2026-08-11',-4500,'EUR','Kesselmann','Rechnung','h1')`);
    db.run(`INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, geaendert_am)
            VALUES ('u1','k1','neu','2026-08-11T09:00:00.000Z')`);

    apply(db, 55, 56);

    expect(db.exec("SELECT zugang_id, zahlungskonto_id FROM import_lauf WHERE id='l1'")[0].values)
      .toEqual([["z1", "k1"]]);
    db.close();
  });

  /**
   * Der Regelfall, nicht die Ausnahme: der Rueckgriff holt bei jedem Abruf einige Tage
   * doppelt, und die Mehrzahl aller Abrufe bringt deshalb nichts Neues. Ueber die Zeilen
   * ist da nichts abzuleiten — der Dateiname trug den Zugangsnamen als Praefix.
   */
  it("leitet ihn bei einem Lauf ohne Zeilen aus dem Dateinamen ab", () => {
    const db = bestand();
    altlauf(db, "l-leer", "Talmberger Bank · Girokonto · 2026-07-01 bis 2026-08-11");

    apply(db, 55, 56);

    expect(db.exec("SELECT zugang_id FROM import_lauf WHERE id='l-leer'")[0].values)
      .toEqual([["z1"]]);
    db.close();
  });

  /**
   * Lieber gar nicht zugeordnet als falsch: passen zwei Zugaenge auf denselben
   * Dateinamen, bleibt der Lauf leer. Eine geratene Zuordnung saehe aus wie eine
   * gemessene und waere schlechter als die Luecke.
   */
  it("laesst ihn leer, wenn zwei Zugaenge passen wuerden", () => {
    const db = bestand();
    db.run(`INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
            VALUES ('z2','Talmberger','https://example.invalid','99999997','nutzer','2026-08-01T00:00:00.000Z')`);
    altlauf(db, "l-leer", "Talmberger Bank · Girokonto · 2026-07-01 bis 2026-08-11");

    apply(db, 55, 56);

    expect(db.exec("SELECT zugang_id FROM import_lauf WHERE id='l-leer'")[0].values)
      .toEqual([[null]]);
    db.close();
  });

  it("laesst Datei-Importe unberuehrt", () => {
    const db = bestand();
    db.run(`INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname)
            VALUES ('l-datei','finanzguru','2026-08-11T09:00:00.000Z','Talmberger Bank auszug.csv')`);

    apply(db, 55, 56);

    expect(db.exec("SELECT zugang_id FROM import_lauf WHERE id='l-datei'")[0].values)
      .toEqual([[null]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = bestand();
    altlauf(db, "l-leer", "Talmberger Bank · Girokonto · 2026-07-01 bis 2026-08-11");
    apply(db, 55, 56);
    const vorher = db.exec("SELECT id, zugang_id FROM import_lauf")[0].values;
    expect(() => apply(db, 55, 56)).not.toThrow();
    expect(db.exec("SELECT id, zugang_id FROM import_lauf")[0].values).toEqual(vorher);
    db.close();
  });
});


describe("Migration 57 — Buchungen, die ihrem Beleg widersprechen", () => {
  function bestand() {
    const db = new SQL.Database();
    apply(db, 0, 56);
    db.run("INSERT INTO zahlungskonto (id, bezeichnung, typ, inhaber_ids) VALUES ('k1','Girokonto','Giro','[]')");
    db.run("INSERT INTO import_lauf (id, quelle, zeitpunkt) VALUES ('l1','fints','2026-08-11T09:00:00.000Z')");
    return db;
  }

  /** Beleg und Buchung mit frei waehlbaren Vorzeichen. */
  function paar(db: InstanceType<typeof SQL.Database>, id: string, belegBetrag: number, buchungBetrag: number) {
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
       VALUES (?, '2026-08-11', ?, 'k1', 'Aufwand', 'import')`,
      [id, buchungBetrag],
    );
    db.run(
      `INSERT INTO umsatz_roh (id, lauf_id, buchungstag, betrag, waehrung, gegenpartei,
         verwendungszweck, roh_hash) VALUES (?, 'l1', '2026-08-11', ?, 'EUR', 'Talmberg', 'Erstattung', ?)`,
      [`u-${id}`, belegBetrag, `h-${id}`],
    );
    db.run(
      `INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, istbuchung_id, geaendert_am)
       VALUES (?, 'k1', 'verbucht', ?, '2026-08-11T09:00:00.000Z')`,
      [`u-${id}`, id],
    );
  }

  /**
   * Der gemeldete Fall: eine Erstattung kam als ZUFLUSS herein und wurde beim Einsortieren
   * in eine Aufwandskategorie zum Abfluss. Im Budget belastete sie damit, statt zu
   * entlasten.
   */
  it("stellt die Richtung aus dem Beleg wieder her", () => {
    const db = bestand();
    paar(db, "b-verdreht", 4995, -4995);
    paar(db, "b-heil", -4995, -4995);

    apply(db, 56, 57);

    expect(db.exec("SELECT id, betrag FROM ist_buchung ORDER BY id")[0].values).toEqual([
      ["b-heil", -4995],
      ["b-verdreht", 4995],
    ]);
    db.close();
  });

  /**
   * Eine Korrektur, die sich selbst nicht protokolliert, ist genau die stille Aenderung,
   * gegen die es das Journal gibt — auch wenn sie diesmal von uns kommt.
   */
  it("haelt die Korrektur im Journal fest, mit dem Zustand davor", () => {
    const db = bestand();
    paar(db, "b-verdreht", 4995, -4995);

    apply(db, 56, 57);

    const eintraege = db.exec(
      "SELECT istbuchung_id, art, vorher, nachher FROM buchung_journal",
    )[0].values;
    expect(eintraege).toHaveLength(1);
    expect(String(eintraege[0][1])).toBe("geaendert");
    expect(JSON.parse(String(eintraege[0][2])).betrag).toBe(-4995);
    expect(JSON.parse(String(eintraege[0][3])).betrag).toBe(4995);
    db.close();
  });

  it("laesst Buchungen ohne Beleg in Ruhe", () => {
    const db = bestand();
    db.run(`INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
            VALUES ('b-hand','2026-08-11',-2000,'k1','Aufwand','manuell')`);

    apply(db, 56, 57);

    expect(db.exec("SELECT betrag FROM ist_buchung WHERE id='b-hand'")[0].values).toEqual([[-2000]]);
    expect(db.exec("SELECT COUNT(*) FROM buchung_journal")[0].values).toEqual([[0]]);
    db.close();
  });

  it("laeuft ein zweites Mal folgenlos durch", () => {
    const db = bestand();
    paar(db, "b-verdreht", 4995, -4995);
    apply(db, 56, 57);
    const vorher = db.exec("SELECT id, betrag FROM ist_buchung")[0].values;

    expect(() => apply(db, 56, 57)).not.toThrow();

    // Und vor allem: NICHT wieder zurueckgedreht, und kein zweiter Journaleintrag.
    expect(db.exec("SELECT id, betrag FROM ist_buchung")[0].values).toEqual(vorher);
    expect(db.exec("SELECT COUNT(*) FROM buchung_journal")[0].values).toEqual([[1]]);
    db.close();
  });
});

describe("Versionsschema", () => {
  it("hat streng aufsteigende, eindeutige Versionen", () => {
    const versionen = MIGRATIONS.map((m) => m.version);
    expect(versionen).toEqual([...versionen].sort((a, b) => a - b));
    expect(new Set(versionen).size).toBe(versionen.length);
  });
});

/**
 * Tests für `migrate()` selbst — die Funktion, die in der App läuft. Die Tests darüber
 * bilden das Anwenden nach; hier geht es um das, was NUR migrate() macht: Versionsstand
 * führen und einen Abbruch überstehen.
 */
describe("migrate() gegen echtes SQLite", () => {
  /** Minimaler MigrationsDb-Adapter auf sql.js — dasselbe, was tauri-plugin-sql liefert. */
  function adapter(db: Database): MigrationsDb {
    return {
      async execute(sql: string, werte: unknown[] = []) {
        db.run(sql, Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never])));
      },
      async select<T>(sql: string): Promise<T> {
        const r = db.exec(sql);
        if (!r.length) return [] as unknown as T;
        return r[0].values.map((row) =>
          Object.fromEntries(r[0].columns.map((c, i) => [c, row[i]])),
        ) as unknown as T;
      },
    };
  }

  const version = (db: Database) =>
    Number(db.exec("SELECT COALESCE(MAX(version), 0) FROM _migration")[0].values[0][0]);

  it("zieht eine frische Datenbank auf den letzten Stand", async () => {
    const db = new SQL.Database();
    await migrate(adapter(db));
    // migrate() führt zusätzlich seine eigene Versionstabelle — apply() oben tut das nicht.
    expect(tabellen(db)).toEqual(["_migration", ...ERWARTETE_TABELLEN]);
    expect(version(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db.close();
  });

  it("läuft ein zweites Mal folgenlos durch", async () => {
    const db = new SQL.Database();
    await migrate(adapter(db));
    await migrate(adapter(db)); // darf nicht werfen
    expect(tabellen(db)).toEqual(["_migration", ...ERWARTETE_TABELLEN]);
    db.close();
  });

  /**
   * Der Fall, für den früher eine Scheintransaktion hier stand: v11 fügt ZWEI Spalten
   * hinzu. Bricht es nach der ersten ab, steht die Version nicht — und der nächste Start
   * lief in „duplicate column name" und ließ die App dauerhaft nicht mehr hochkommen.
   * Eine echte Transaktion ist über tauri-plugin-sql nicht zu haben (Pool, siehe db.ts),
   * also muss das Wiederholen selbst folgenlos sein.
   */
  /**
   * v18 nimmt weg statt hinzuzufügen — dieselbe Wiederholbarkeit muss auch dann halten.
   * `DROP TABLE` trägt `IF EXISTS`, für `DROP COLUMN` hat SQLite kein Gegenstück; das
   * fängt migrate() über PRAGMA table_info ab. Ohne diese Prüfung stünde nach einem
   * Abbruch dauerhaft „no such column" zwischen der App und ihren Daten.
   */
  it("übersteht ein mittendrin abgebrochenes Aufräumen", async () => {
    const db = new SQL.Database();
    apply(db, 0, 17);
    db.run("CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)");
    for (const m of MIGRATIONS) {
      if (m.version <= 17) db.run(`INSERT INTO _migration (version) VALUES (${m.version})`);
    }
    // v18 halb ausgeführt: eine Tabelle und eine Spalte schon weg, Versionseintrag fehlt.
    db.run("DROP TABLE szenario_posten");
    db.run("ALTER TABLE topf DROP COLUMN wiederbeschaffung");

    await migrate(adapter(db));

    expect(tabellen(db)).not.toContain("szenario");
    expect(spalten(db, "topf")).not.toContain("inventar_id");
    expect(version(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db.close();
  });

  it("übersteht eine mittendrin abgebrochene Migration", async () => {
    const db = new SQL.Database();
    apply(db, 0, 10);
    db.run("CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)");
    for (const m of MIGRATIONS) {
      if (m.version <= 10) db.run(`INSERT INTO _migration (version) VALUES (${m.version})`);
    }
    // v11 halb ausgeführt: erste Spalte da, Versionseintrag fehlt.
    db.run("ALTER TABLE ist_buchung ADD COLUMN transfer_id TEXT");

    await migrate(adapter(db));

    expect(spalten(db, "ist_buchung")).toEqual(
      expect.arrayContaining(["transfer_id", "gegenkonto_id"]),
    );
    expect(version(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db.close();
  });
});

describe("Vertrags-Kategorie nachtragen (v23)", () => {
  /** Ein Vertrag mit abgeleiteter Zahlungsregel, auf dem Stand VOR der neuen Spalte. */
  function bestand(db: Database) {
    apply(db, 0, 22);
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status)
       VALUES ('v1', 'O2', '2024-01-01', 'automatisch', 'aktiv')`,
    );
    db.run(
      `INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, vertrag_id, kategorie_id)
       VALUES ('r1', 'O2', -2999, 'monatlich', '2024-01-01', 'Aufwand', 'v1', 'kat-telefon')`,
    );
  }

  const kategorieVon = (db: Database, id: string) => {
    const r = db.exec(`SELECT kategorie_id FROM vertrag WHERE id = '${id}'`);
    return r[0].values[0][0];
  };

  it("holt die Kategorie aus der Zahlungsregel", () => {
    const db = new SQL.Database();
    bestand(db);

    apply(db, 22, 23);

    // Ohne das trüge kein Bestandsvertrag eine Kategorie, und die Kette begänne erst
    // beim nächsten neu erfassten zu wirken.
    expect(kategorieVon(db, "v1")).toBe("kat-telefon");
    db.close();
  });

  it("ein zweiter Durchgang ändert nichts", () => {
    const db = new SQL.Database();
    bestand(db);
    apply(db, 22, 23);
    // Von Hand nachgesteuert — das darf eine Wiederholung nicht wegwischen.
    db.run("UPDATE vertrag SET kategorie_id = 'kat-vonhand' WHERE id = 'v1'");

    // Nur das UPDATE erneut: das ADD COLUMN fängt `migrate()` über PRAGMA table_info ab
    // (siehe db.ts), der einfache apply()-Helfer hier kennt diese Prüfung nicht.
    const nachtrag = MIGRATIONS.find((m) => m.version === 23)!.sql.find((q) => q.startsWith("UPDATE"))!;
    db.run(nachtrag);

    expect(kategorieVon(db, "v1")).toBe("kat-vonhand");
    db.close();
  });

  it("ein Vertrag ohne Regel-Kategorie bleibt leer", () => {
    const db = new SQL.Database();
    apply(db, 0, 22);
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status)
       VALUES ('v2', 'Ohne Regel', '2024-01-01', 'keine', 'aktiv')`,
    );

    apply(db, 22, 23);

    expect(kategorieVon(db, "v2")).toBeNull();
    db.close();
  });
});

describe("Vertrags-Kategorie erneut nachtragen (v25)", () => {
  it("holt nach, was v23 im laufenden Betrieb verpasst hat", () => {
    // Der reale Fall: die App hatte Version 23 verbucht, als die Migration erst aus dem
    // ALTER bestand. Der Bestand steht also auf 24, hat die Spalte — und sie ist leer.
    const db = new SQL.Database();
    apply(db, 0, 24);
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status)
       VALUES ('v1', 'O2', '2024-01-01', 'automatisch', 'aktiv')`,
    );
    db.run(
      `INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, vertrag_id, kategorie_id)
       VALUES ('r1', 'O2', -2999, 'monatlich', '2024-01-01', 'Aufwand', 'v1', 'kat-telefon')`,
    );

    apply(db, 24, 25);

    expect(db.exec("SELECT kategorie_id FROM vertrag WHERE id = 'v1'")[0].values[0][0]).toBe("kat-telefon");
    db.close();
  });

  it("überschreibt nichts von Hand Gepflegtes", () => {
    const db = new SQL.Database();
    apply(db, 0, 24);
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status, kategorie_id)
       VALUES ('v1', 'O2', '2024-01-01', 'automatisch', 'aktiv', 'kat-vonhand')`,
    );
    db.run(
      `INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, vertrag_id, kategorie_id)
       VALUES ('r1', 'O2', -2999, 'monatlich', '2024-01-01', 'Aufwand', 'v1', 'kat-telefon')`,
    );

    apply(db, 24, 25);
    apply(db, 24, 25); // und ein zweites Mal

    expect(db.exec("SELECT kategorie_id FROM vertrag WHERE id = 'v1'")[0].values[0][0]).toBe("kat-vonhand");
    db.close();
  });
});
