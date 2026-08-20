// Test-Harness für die UI-Screens.
//
// Die Screens gehen über `application/`, dahinter liegen die SQLite-Repositories. Statt
// jede Schicht zu ersetzen, wird nur `getDb` auf eine frische In-Memory-Datenbank (sql.js)
// umgebogen — dieselbe SQL-Engine wie in der App. Der Weg von der Oberfläche bis ins
// Schema läuft dadurch echt und nicht gegen Attrappen: ein falsches Spalten-Mapping oder
// eine kaputte Abfrage fällt hier genauso auf wie eine kaputte Anzeige.
//
// Diese Datei ist Test-Werkzeug und aus der Coverage ausgenommen.

import { render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type { ReactElement } from "react";
import { MIGRATIONS } from "../adapters/persistence/migrations";
import { EinstellungenProvider } from "../adapters/ui/bausteine/EinstellungenProvider";

/**
 * tauri-plugin-sql-API auf sql.js: der Plugin nummeriert Platzhalter ($1, $2, …),
 * sql.js bindet Arrays an „?" — hier auf benannte Parameter abgebildet.
 */
export function pluginApi(db: Database) {
  const benannt = (werte: unknown[] = []) =>
    Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never]));
  return {
    async execute(sql: string, werte?: unknown[]) {
      db.run(sql, benannt(werte));
      return { rowsAffected: db.getRowsModified(), lastInsertId: 0 };
    },
    async select<T>(sql: string, werte?: unknown[]): Promise<T> {
      const stmt = db.prepare(sql);
      if (werte?.length) stmt.bind(benannt(werte));
      const zeilen: unknown[] = [];
      while (stmt.step()) zeilen.push(stmt.getAsObject());
      stmt.free();
      return zeilen as unknown as T;
    },
  };
}

let SQL: SqlJsStatic | null = null;

/** Einmalig die sql.js-WASM laden (in beforeAll aufrufen). */
export async function sqlLaden(): Promise<void> {
  if (SQL) return;
  const require = createRequire(import.meta.url);
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
}

/** Frische, vollständig migrierte In-Memory-Datenbank. */
export function frischeDb(): Database {
  if (!SQL) throw new Error("sqlLaden() zuerst in beforeAll aufrufen");
  const db = new SQL.Database();
  for (const m of MIGRATIONS) for (const sql of m.sql) db.run(sql);
  return db;
}

/** Rendert einen Screen im Einstellungs-Kontext (Währung, Locale, Sprache). */
export function rendere(element: ReactElement): RenderResult {
  return render(<EinstellungenProvider>{element}</EinstellungenProvider>);
}

/**
 * Wählt ein Register (Tab) im Bereichs-Kopf und wartet vorher darauf, dass überhaupt
 * gerendert ist. Löst `kartenAufklappen` ab: die Einstellungen sind keine Sammlung
 * aufklappbarer Karten mehr, sondern ein Bereich mit Registern — und weil immer genau
 * eines offen ist, muss ein Test sagen, welches er meint.
 */
export async function registerWaehlen(
  nutzer: { click: (el: Element) => Promise<void> },
  name: RegExp | string,
): Promise<void> {
  // Erst abwarten, dass überhaupt etwas dasteht: der EinstellungenProvider lädt Locale
  // und Währung aus der Datenbank und rendert seine Kinder bis dahin nicht. Ohne dieses
  // Warten liefe der Helfer über ein leeres Dokument und täte stillschweigend nichts.
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });

  await nutzer.click(await screen.findByRole("tab", { name }));
}
