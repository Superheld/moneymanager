// SQLite-Zugang über tauri-plugin-sql. Eine geladene DB-Instanz pro App, im
// App-Datenverzeichnis (lokal first). Schema über ein einfaches, versioniertes
// Migrationssystem (BAUPLAN: Migrationen ab Phase 1) — idempotent und vorwärts.

import Database from "@tauri-apps/plugin-sql";

interface Migration {
  version: number;
  sql: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1, // P0 — Walking Skeleton
    sql: [
      `CREATE TABLE IF NOT EXISTS zahlungsregel (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT    NOT NULL,
        betrag      INTEGER NOT NULL,
        rhythmus    TEXT    NOT NULL,
        startdatum  TEXT    NOT NULL,
        charakter   TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 2, // P1 — Stammdaten
    sql: [
      `CREATE TABLE IF NOT EXISTS person (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        geburtsdatum TEXT,
        rolle        TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS zahlungskonto (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT NOT NULL,
        typ         TEXT NOT NULL,
        iban        TEXT,
        inhaber_ids TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS kategorie (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        eltern_id         TEXT,
        default_charakter TEXT NOT NULL
      )`,
      `ALTER TABLE zahlungsregel ADD COLUMN konto_id TEXT`,
      `ALTER TABLE zahlungsregel ADD COLUMN kategorie_id TEXT`,
    ],
  },
];

async function migrate(db: Database): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)`);
  const rows = await db.select<{ v: number }[]>(
    `SELECT COALESCE(MAX(version), 0) AS v FROM _migration`,
  );
  const aktuell = rows[0]?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > aktuell) {
      for (const stmt of m.sql) await db.execute(stmt);
      await db.execute(`INSERT INTO _migration (version) VALUES ($1)`, [m.version]);
    }
  }
}

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:moneymanager.db").then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}
