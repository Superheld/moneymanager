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

/** Wendet die Migrationen im Versionsbereich (from, to] an — wie db.ts, aber gegen sql.js. */
function apply(db: Database, from = 0, to = Infinity): void {
  for (const m of MIGRATIONS) {
    if (m.version > from && m.version <= to) {
      for (const sql of m.sql) db.run(sql);
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
  "budget",
  "depot", "depotposition", "depotwert", // v38 — Depots: Beobachtungen statt Buchungen
  "dubletten_freigabe", // v34 — „kein Duplikat", von Hand festgehalten
  "einstellung", "import_lauf", "inventargegenstand", "ist_buchung",
  "ist_buchung_aufteilung", "kategorie", "kategorie_festlegung", "klassifikator_modell",
  "kontostand_anker", // v35 — was an einem Stichtag wirklich auf dem Konto lag
  "merkmal_ausschluss",
  "person",
  "umsatz", "vertrag", "vertrag_erkennung", "vertrag_zuordnung",
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
    expect(spalten(db, "umsatz")).toContain("glaeubiger_id"); // v16
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
   * ob er 5279 Zeilen anfassen darf.
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

  it("legt Import-Lauf und Umsatz mit Dedup-Indizes an (v14)", () => {
    const db = new SQL.Database();
    apply(db);
    expect(spalten(db, "import_lauf")).toEqual(
      expect.arrayContaining(["quelle", "zeitpunkt", "dateiname", "eingelesen", "neu", "duplikate"]),
    );
    expect(spalten(db, "umsatz")).toEqual(
      expect.arrayContaining([
        "lauf_id", "zahlungskonto_id", "buchungstag", "betrag", "roh_hash", "native_id",
        "status", "vorschlag_kategorie_id", "vorschlag_charakter", "vorschlag_quelle", "istbuchung_id",
      ]),
    );
    expect(indexExistiert(db, "ix_umsatz_roh_hash")).toBe(true);
    expect(indexExistiert(db, "ix_umsatz_native_id")).toBe(true);
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
