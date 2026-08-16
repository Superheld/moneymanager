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
  "budget", "einstellung", "import_lauf", "inventargegenstand", "ist_buchung",
  "ist_buchung_aufteilung", "kategorie", "person", "szenario", "szenario_posten", "topf",
  "umsatz", "vertrag", "zahlungskonto", "zahlungsregel",
];

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
    // v6 — vom entfallenen Ersatz-Topf; die Spalte bleibt (forward-only), ungenutzt.
    expect(spalten(db, "topf")).toContain("inventar_id");
    // v17
    expect(spalten(db, "inventargegenstand")).toContain("konto_id");
    // v9/v10/v11/v13
    expect(spalten(db, "umsatz")).toContain("glaeubiger_id"); // v16
    expect(spalten(db, "ist_buchung")).toEqual(
      expect.arrayContaining(["notiz", "transfer_id", "gegenkonto_id", "plan_quelle_id", "plan_faelligkeit", "verwendung_topf_id", "roh_hash"]),
    );
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
