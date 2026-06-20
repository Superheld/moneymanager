// Migrations-Tests gegen ein echtes In-Memory-SQLite (sql.js, WASM — kein nativer Build,
// CI-tauglich). Validiert die Kette v1–v13 ohne Tauri-Runtime: Schema entsteht sauber,
// alle ALTERs greifen, der Dedup-Index erzwingt die 1:1-Garantie, und die Migration läuft
// auch inkrementell (von einer älteren DB vorwärts). Das ist die Schicht, die reine
// Core-Tests prinzipiell nicht erreichen.

import { beforeAll, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { MIGRATIONS } from "./migrations";

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
  "budget", "einstellung", "inventargegenstand", "ist_buchung", "kategorie", "person",
  "szenario", "szenario_posten", "topf", "vertrag", "zahlungskonto", "zahlungsregel",
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
    // v6
    expect(spalten(db, "topf")).toContain("inventar_id");
    // v9/v10/v11/v13
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
