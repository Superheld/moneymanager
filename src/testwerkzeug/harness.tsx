// Test-Harness für die UI-Screens.
//
// Die Screens gehen über `application/`, dahinter liegen die SQLite-Repositories. Statt
// jede Schicht zu ersetzen, wird nur `getDb` auf eine frische In-Memory-Datenbank (sql.js)
// umgebogen — dieselbe SQL-Engine wie in der App. Der Weg von der Oberfläche bis ins
// Schema läuft dadurch echt und nicht gegen Attrappen: ein falsches Spalten-Mapping oder
// eine kaputte Abfrage fällt hier genauso auf wie eine kaputte Anzeige.
//
// Diese Datei ist Test-Werkzeug und aus der Coverage ausgenommen.

import { render, screen, waitFor, within, type RenderResult } from "@testing-library/react";
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

/**
 * Wählt einen Eintrag in einer `Auswahl` — dem Ersatz für das native `<select>`.
 *
 * Es gibt den Helfer, weil `userEvent.selectOptions` hier nicht mehr greift: eine
 * `Auswahl` ist ein Knopf mit einer Liste im Portal, kein `<select>` mit `<option>`n.
 * Zwei Schritte statt einem, und beide sind an jeder Aufrufstelle dieselben.
 *
 * `feld` ist der Name des Feldes (sein `aria-label` oder die Beschriftung des
 * `FormField`), `eintrag` der sichtbare Text der Option.
 *
 * `bereich` grenzt die Suche nach dem FELD ein — etwa auf einen Dialog, wenn derselbe
 * Feldname auch im Screen dahinter vorkommt. Die OPTION wird trotzdem global gesucht:
 * die Liste hängt in einem Portal und liegt damit ausserhalb des Dialogs im DOM. Wer das
 * übersieht, sucht die Option im Dialog und findet sie nie.
 */
export async function auswahlWaehlen(
  nutzer: { click: (el: Element) => Promise<void> },
  feld: RegExp | string,
  eintrag: RegExp | string,
  bereich?: { findByRole: typeof screen.findByRole },
): Promise<void> {
  const suche = bereich ?? screen;
  await nutzer.click(await suche.findByRole("combobox", { name: feld }));
  await nutzer.click(await within(await auswahlListe()).findByRole("option", { name: eintrag }));
}

/**
 * Die offene Liste einer `Auswahl` — verankert an ihrer KLASSE, nicht an der Rolle.
 *
 * Klingt nach einem Umweg über das Aussehen, ist aber der einzige verlässliche Weg: auf
 * derselben Seite stehen oft noch native `<select>`, und deren `<option>`-Elemente melden
 * dieselbe Rolle. Ein globales `findByRole("option", …)` griff dann die Option des
 * FILTERS statt die der offenen Liste — gemessen am Verbuchen-Dialog, wo hinter dem
 * Modal zwei Filter mit denselben Kontonamen stehen. Der Fehler war dabei still: der Test
 * klickte etwas an, die Auswahl blieb stehen, und die Zusicherung fiel erst am Ende um.
 *
 * `:not([data-closed])` ist der zweite Teil davon und genauso wenig Kosmetik: Base UI
 * lässt eine geschlossene Liste noch einen Moment im DOM stehen (für die Animation). Wer
 * kurz hintereinander zwei Felder bedient, greift sonst die Liste des VORIGEN.
 */
async function auswahlListe(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(".auswahl-popup:not([data-closed])");
    if (!el) throw new Error("Die Liste der Auswahl ist nicht offen");
    return el;
  });
}
