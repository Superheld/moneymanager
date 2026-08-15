// SQLite-Zugang über tauri-plugin-sql. Eine geladene DB-Instanz pro App, im
// App-Datenverzeichnis (lokal first). Schema über ein einfaches, versioniertes
// Migrationssystem (BAUPLAN: Migrationen ab Phase 1) — vorwärts und append-only.

import Database from "@tauri-apps/plugin-sql";
import { MIGRATIONS } from "./migrations";

/**
 * Das Minimum, das `migrate` von einer Datenbank braucht. Hält die Migrationslogik
 * unabhängig von tauri-plugin-sql und damit testbar (sql.js im Test, echte DB in der App).
 */
export interface MigrationsDb {
  execute(sql: string, werte?: unknown[]): Promise<unknown>;
  select<T>(sql: string): Promise<T>;
}

/**
 * Zieht das Schema auf den aktuellen Stand.
 *
 * Jede Migration läuft in EINER Transaktion, zusammen mit ihrem Versionseintrag: entweder
 * beides oder nichts. Ohne diese Klammer konnte eine Mehr-Statement-Migration (v2, v3, v6,
 * v9, v11, v14) mittendrin abbrechen — die Spalte stand dann bereits, die Version nicht,
 * und jeder folgende Start wiederholte die Migration und scheiterte an „duplicate column
 * name". Die App startete danach dauerhaft nicht mehr und heilte sich nicht selbst.
 *
 * Die Migrationen selbst bleiben unverändert: sie sind append-only, bestehende Versionen
 * werden nie editiert (CLAUDE.md). Die Atomarität gehört hierher, nicht in die Statements.
 */
export async function migrate(db: MigrationsDb): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)`);
  const rows = await db.select<{ v: number }[]>(
    `SELECT COALESCE(MAX(version), 0) AS v FROM _migration`,
  );
  const aktuell = rows[0]?.v ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version <= aktuell) continue;
    await db.execute("BEGIN");
    try {
      for (const stmt of m.sql) await db.execute(stmt);
      await db.execute(`INSERT INTO _migration (version) VALUES ($1)`, [m.version]);
      await db.execute("COMMIT");
    } catch (fehler) {
      // Rollback darf den ursprünglichen Fehler nicht verdecken — er ist die Diagnose.
      await db.execute("ROLLBACK").catch(() => undefined);
      throw fehler;
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
