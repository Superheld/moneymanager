// SQLite-Zugang über tauri-plugin-sql. Eine geladene Datenbank-Instanz pro App,
// Schema beim ersten Zugriff angelegt. Liegt im App-Datenverzeichnis (lokal first).
// In P0 reicht „CREATE TABLE IF NOT EXISTS"; echte Migrationen ab Phase 1.

import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

async function init(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS zahlungsregel (
      id          TEXT PRIMARY KEY,
      bezeichnung TEXT    NOT NULL,
      betrag      INTEGER NOT NULL,
      rhythmus    TEXT    NOT NULL,
      startdatum  TEXT    NOT NULL,
      charakter   TEXT    NOT NULL
    );
  `);
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:moneymanager.db").then(async (db) => {
      await init(db);
      return db;
    });
  }
  return dbPromise;
}
