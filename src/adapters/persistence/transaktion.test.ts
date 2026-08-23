// Prüft die Zusicherung, für die es den Transaktions-Weg überhaupt gibt: entweder alles
// oder nichts. Gegen echtes SQLite (sql.js), nicht gegen eine Attrappe — eine Attrappe
// könnte „hat zurückgerollt" behaupten, ohne dass eine Zeile davon berührt wäre.
//
// Getestet wird hier der Fallback-Weg (eine Verbindung, direkte Klammer). Der Rust-Weg
// leistet dasselbe mit `pool.begin()`; ihn erreicht kein TS-Test, seine Begründung steht
// in `src-tauri/src/transaktion.rs`.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { fremdschluesselPruefen, inTransaktion, type AusfuehrbareDb, type PruefbareDb } from "./transaktion";

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

beforeEach(() => {
  db = new SQL.Database();
  db.run(`CREATE TABLE probe (id TEXT PRIMARY KEY, wert INTEGER NOT NULL)`);
});

/** Dieselbe Abbildung wie im Test-Harness: $1, $2 … auf benannte sql.js-Parameter. */
function api(): AusfuehrbareDb {
  return {
    async execute(sql: string, werte: unknown[] = []) {
      db.run(sql, Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never])));
      return { rowsAffected: db.getRowsModified() };
    },
  };
}

function zeilen(): number {
  const stmt = db.prepare("SELECT COUNT(*) AS n FROM probe");
  stmt.step();
  const n = (stmt.getAsObject() as { n: number }).n;
  stmt.free();
  return n;
}

describe("inTransaktion", () => {
  it("schreibt alle Anweisungen, wenn keine scheitert", async () => {
    await inTransaktion(api(), [
      { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["a", 1] },
      { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["b", 2] },
    ]);
    expect(zeilen()).toBe(2);
  });

  /**
   * Der eigentliche Punkt. Ohne Transaktion stünde die erste Zeile danach in der Tabelle —
   * genau der halb geschriebene Stand, der beim Schreiben über mehrere Tabellen entsteht
   * und den niemand später auseinanderklamüsern kann.
   */
  it("macht ALLES rückgängig, wenn eine Anweisung scheitert", async () => {
    await expect(
      inTransaktion(api(), [
        { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["a", 1] },
        { sql: "INSERT INTO gibtesnicht (id) VALUES ($1)", werte: ["b"] },
      ]),
    ).rejects.toThrow();

    expect(zeilen()).toBe(0);
  });

  it("rollt auch bei einer verletzten Bedingung zurück", async () => {
    await inTransaktion(api(), [
      { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["a", 1] },
    ]);

    // Zweimal derselbe Primärschlüssel: die zweite Anweisung kippt, die erste darf
    // deshalb nicht stehenbleiben.
    await expect(
      inTransaktion(api(), [
        { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["neu", 9] },
        { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["a", 9] },
      ]),
    ).rejects.toThrow();

    expect(zeilen()).toBe(1);
  });

  /**
   * Aufrufer sammeln ihre Anweisungen aus Schleifen. Wenn dabei nichts zusammenkommt,
   * soll das kein Sonderfall sein, den jede Aufrufstelle selbst abfangen muss — und vor
   * allem soll keine leere Transaktion geöffnet werden.
   */
  it("tut bei einer leeren Liste nichts", async () => {
    await expect(inTransaktion(api(), [])).resolves.toBeUndefined();
    expect(zeilen()).toBe(0);
  });

  it("lässt die Datenbank nach einem Rollback weiter benutzbar", async () => {
    await expect(
      inTransaktion(api(), [{ sql: "INSERT INTO gibtesnicht (id) VALUES ($1)", werte: ["x"] }]),
    ).rejects.toThrow();

    // Wäre die Transaktion offen geblieben, scheiterte das hier an „cannot start a
    // transaction within a transaction".
    await inTransaktion(api(), [
      { sql: "INSERT INTO probe (id, wert) VALUES ($1, $2)", werte: ["danach", 1] },
    ]);
    expect(zeilen()).toBe(1);
  });
});

describe("fremdschluesselPruefen", () => {
  /** Dieselbe Abbildung wie oben, plus `select` — den braucht die Prüfung. */
  function pruefbar(): PruefbareDb {
    return {
      ...api(),
      async select<T>(sql: string): Promise<T> {
        const stmt = db.prepare(sql);
        const zeilen: unknown[] = [];
        while (stmt.step()) zeilen.push(stmt.getAsObject());
        stmt.free();
        return zeilen as unknown as T;
      },
    };
  }

  it("laesst eine saubere Datenbank durch", async () => {
    await expect(fremdschluesselPruefen(pruefbar())).resolves.toBeUndefined();
  });

  /**
   * Der eigentliche Punkt. Waehrend eines Tabellenumbaus ist die Pruefung abgeschaltet —
   * wer sie danach nicht nachholt, hat sie abgeschafft. Ein Waechter, der nie anschlaegt,
   * ist schlimmer als keiner, weil er beruhigt.
   *
   * Die Verletzung wird hier absichtlich mit ausgeschalteter Pruefung erzeugt: genau so
   * entsteht sie auch in echt.
   */
  it("schlaegt an, wenn ein Verweis ins Leere zeigt", async () => {
    db.run("PRAGMA foreign_keys = OFF");
    db.run(`CREATE TABLE eltern (id TEXT PRIMARY KEY)`);
    db.run(`CREATE TABLE kind (id TEXT PRIMARY KEY, eltern_id TEXT REFERENCES eltern(id))`);
    db.run("INSERT INTO kind (id, eltern_id) VALUES ('k1','gibtesnicht')");

    await expect(fremdschluesselPruefen(pruefbar())).rejects.toThrow(/Fremdschluessel/);
  });
});
