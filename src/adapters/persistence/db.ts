// SQLite-Zugang über EIGENE Kommandos, nicht mehr über tauri-plugin-sql. Eine geöffnete
// Datenbank pro App, im App-Datenverzeichnis (lokal first). Schema über ein einfaches,
// versioniertes Migrationssystem — vorwärts und append-only.
//
// **Warum nicht mehr das Plugin.** Eine verschlüsselte Datenbank verlangt `PRAGMA key`,
// und das gilt pro Verbindung. Das Plugin hält einen Pool und holt für jedes Statement
// eine beliebige daraus; ein einmal gesetzter Schlüssel erwischt genau eine davon. Der
// eigene Pool in `src-tauri/src/datenbank.rs` setzt ihn stattdessen in den
// Verbindungsoptionen — damit bekommt ihn jede Verbindung, die je entsteht.
//
// **Die Naht ist absichtlich schmal.** Nach oben sieht das aus wie vorher: `select` und
// `execute`, dieselben Signaturen. Kein einziges Repository musste angefasst werden.

import { invoke } from "@tauri-apps/api/core";
import { DATEINAME } from "./datenbankdatei";
import { MIGRATIONS } from "./migrations";
import { schemaStatement, fremdschluesselPruefen } from "./transaktion";
import { sicherungPflegen } from "../../application/sicherung";
import { heute, tauriSicherungPort } from "./sicherung";

/**
 * Das Minimum, das `migrate` von einer Datenbank braucht. Hält die Migrationslogik
 * unabhängig von tauri-plugin-sql und damit testbar (sql.js im Test, echte DB in der App).
 */
export interface MigrationsDb {
  execute(sql: string, werte?: unknown[]): Promise<unknown>;
  select<T>(sql: string): Promise<T>;
}

/** `ALTER TABLE x ADD COLUMN y …` → Tabelle und Spalte; sonst null. */
function spaltenZugang(sql: string): { tabelle: string; spalte: string } | null {
  const m = sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
  return m ? { tabelle: m[1], spalte: m[2] } : null;
}

/** `ALTER TABLE x DROP COLUMN y` → Tabelle und Spalte; sonst null. */
function spaltenAbgang(sql: string): { tabelle: string; spalte: string } | null {
  const m = sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)/i);
  return m ? { tabelle: m[1], spalte: m[2] } : null;
}

/**
 * `-- @wennTabelle x` am Anfang eines Statements → der Tabellenname; sonst null.
 *
 * Gebraucht beim UMBAU einer Tabelle: die Daten werden in die neue kopiert, dann fällt
 * die alte. Beim zweiten Lauf (die Migration brach vorher ab, die Version steht noch
 * nicht) gibt es die Quelle nicht mehr, und ein `INSERT … SELECT FROM alt` scheiterte an
 * „no such table" — die App käme nicht mehr hoch. Derselbe Grund wie bei den beiden
 * Spaltenprüfungen darunter, nur eine Ebene höher.
 */
function tabellenBedingung(sql: string): string | null {
  const m = sql.match(/^\s*--\s*@wennTabelle\s+(\w+)/i);
  return m ? m[1] : null;
}

/**
 * `-- @wennSpalte x.y` am Anfang eines Statements → Tabelle und Spalte; sonst null.
 *
 * Das Gegenstück zu `@wennTabelle`, eine Ebene tiefer, und gebraucht beim ABLÖSEN einer
 * Spalte: eine Version liest sie ein letztes Mal (etwa in eine neue Tabelle), die nächste
 * lässt sie fallen. Läuft die lesende Version danach noch einmal — die Migrationen sind
 * ausdrücklich einzeln wiederholbar —, scheiterte ihr SELECT an „no such column", und
 * SQLite prüft Spaltennamen beim PARSEN: ein `WHERE` oder `COALESCE` rettet daran nichts.
 */
function spaltenBedingung(sql: string): { tabelle: string; spalte: string } | null {
  const m = sql.match(/^\s*--\s*@wennSpalte\s+(\w+)\.(\w+)/i);
  return m ? { tabelle: m[1], spalte: m[2] } : null;
}

async function tabelleExistiert(db: MigrationsDb, tabelle: string): Promise<boolean> {
  const zeilen = await db.select<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tabelle}'`,
  );
  return zeilen.length > 0;
}

async function spalteExistiert(db: MigrationsDb, tabelle: string, spalte: string): Promise<boolean> {
  const zeilen = await db.select<{ name: string }[]>(`PRAGMA table_info(${tabelle})`);
  return zeilen.some((z) => z.name === spalte);
}

/**
 * Zieht das Schema auf den aktuellen Stand.
 *
 * **Es gibt hier keine Transaktion — und es kann keine geben.** tauri-plugin-sql führt
 * jedes `execute` über `pool.execute()` aus (wrapper.rs), und `Executor for &Pool` holt
 * pro Aufruf eine Verbindung aus einem Pool mit sqlx-Standardgröße 10. Ein `BEGIN`
 * öffnete also eine Transaktion auf Verbindung A, die mit offener Transaktion in den Pool
 * zurückginge; die folgenden Statements liefen auf B, C, … und committeten einzeln; das
 * `COMMIT` träfe irgendeine. Früher stand hier so eine Klammer und sah aus wie Sicherheit.
 * Dass sie nie schadete, lag allein daran, dass der Aufrufcode sequentiell war und der
 * Pool deshalb faktisch nur eine Verbindung benutzte.
 *
 * Statt einer Scheintransaktion ist jedes Statement WIEDERHOLBAR. Das löst dasselbe
 * Problem, das die Klammer lösen sollte: bricht eine Mehr-Statement-Migration mittendrin
 * ab (v2, v3, v6, v9, v11, v14), steht die Version nicht, und der nächste Start wiederholt
 * die Migration folgenlos, statt an „duplicate column name" zu scheitern und die App
 * dauerhaft nicht mehr starten zu lassen.
 *
 *  • `CREATE TABLE/INDEX` tragen `IF NOT EXISTS` (alle Migrationen halten das ein).
 *  • `DROP TABLE/INDEX` tragen `IF EXISTS`.
 *  • `ALTER TABLE … ADD COLUMN` kennt kein `IF NOT EXISTS` in SQLite — deshalb wird die
 *    Spalte vorher per `PRAGMA table_info` geprüft und der Zugang übersprungen.
 *  • `ALTER TABLE … DROP COLUMN` genauso, nur andersherum: fehlt die Spalte schon, ist
 *    nichts zu tun. Ohne diese Prüfung scheiterte der zweite Lauf an „no such column"
 *    und die App käme nicht mehr hoch.
 *  • `-- @wennTabelle x` vor einem Statement überspringt es, wenn `x` fehlt. Für den
 *    UMBAU einer Tabelle: kopieren, dann die alte fallen lassen — beim zweiten Lauf ist
 *    die Quelle weg, und ein `INSERT … SELECT` daraus scheiterte.
 *  • `-- @wennSpalte x.y` dasselbe für eine Spalte. Für das ABLÖSEN einer Spalte: eine
 *    Version liest sie ein letztes Mal, die nächste lässt sie fallen.
 *
 * **Die Statements laufen OHNE Fremdschlüsselprüfung, geprüft wird am Ende.** SQLite kann
 * Constraints nicht nachrüsten; eine Tabelle bekommt sie nur durch Neubau. Mit
 * eingeschalteten Schlüsseln geht dabei zweierlei schief, und beides ist gemessen:
 * `DROP TABLE` scheitert, wenn ein Schlüssel mit RESTRICT darauf zeigt, und es LÖSCHT
 * STILL, wo einer mit CASCADE darauf zeigt — SQLite behandelt den Drop wie das Löschen
 * aller Zeilen. Die offizielle Umbau-Prozedur schaltet die Prüfung deshalb ab und holt
 * sie danach nach; genau das passiert hier. In der App braucht es dafür den Rust-Weg
 * (`PRAGMA foreign_keys` gilt pro Verbindung), im Test sind sie ohnehin aus.
 *
 * Der Versionseintrag kommt zuletzt: lieber eine Migration zweimal laufen lassen (sie ist
 * wiederholbar) als sie fälschlich für erledigt halten.
 *
 * Die Migrationen selbst bleiben unverändert: append-only, bestehende Versionen werden nie
 * editiert (CLAUDE.md).
 */
export async function migrate(db: MigrationsDb): Promise<void> {
  let gelaufen = false;
  await db.execute(`CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)`);
  const rows = await db.select<{ v: number }[]>(
    `SELECT COALESCE(MAX(version), 0) AS v FROM _migration`,
  );
  const aktuell = rows[0]?.v ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version <= aktuell) continue;
    for (const stmt of m.sql) {
      const bedingung = tabellenBedingung(stmt);
      if (bedingung && !(await tabelleExistiert(db, bedingung))) continue;
      const spaltig = spaltenBedingung(stmt);
      if (spaltig && !(await spalteExistiert(db, spaltig.tabelle, spaltig.spalte))) continue;
      const zugang = spaltenZugang(stmt);
      if (zugang && (await spalteExistiert(db, zugang.tabelle, zugang.spalte))) continue;
      const abgang = spaltenAbgang(stmt);
      if (abgang && !(await spalteExistiert(db, abgang.tabelle, abgang.spalte))) continue;
      await schemaStatement(db, stmt);
      gelaufen = true;
    }
    await db.execute(`INSERT INTO _migration (version) VALUES ($1)`, [m.version]);
  }

  // Die Prüfung, die während des Umbaus ausgeschaltet war — nachgeholt, sobald das Schema
  // steht. Nur wenn überhaupt etwas lief: bei jedem App-Start die ganze Datenbank
  // durchzuprüfen, obwohl sich nichts geändert hat, wäre Aufwand ohne Anlass.
  if (gelaufen) await fremdschluesselPruefen(db);
}

/**
 * Was die Anwendung von der Datenbank sieht — dieselben zwei Methoden wie zuvor beim
 * Plugin, damit der Tausch nach oben unsichtbar bleibt.
 */
export interface Datenbankzugang {
  select<T>(sql: string, werte?: unknown[]): Promise<T>;
  execute(sql: string, werte?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
}

const zugang: Datenbankzugang = {
  select: <T,>(sql: string, werte: unknown[] = []) => invoke<T>("db_select", { sql, werte }),
  execute: (sql: string, werte: unknown[] = []) =>
    invoke<{ rowsAffected: number; lastInsertId: number }>("db_execute", { sql, werte }),
};

/**
 * Die Datenbank öffnen.
 *
 * `pragma` ist der fertige Wert für `PRAGMA key` — oder `null` für eine unverschlüsselte
 * Datenbank. Letzteres ist heute der Normalfall und wird es nicht bleiben.
 *
 * Gibt `false` zurück, wenn der Schlüssel nicht passt. Das ist kein Fehler, sondern eine
 * Antwort: eine falsch eingetippte Passphrase ist keine Ausnahme, sondern der häufigste
 * Fall beim Entsperren.
 */
export async function datenbankOeffnen(pragma: string | null): Promise<boolean> {
  return invoke<boolean>("datenbank_oeffnen", {
    o: { datei: DATEINAME, pragma, anlegen: true },
  });
}

/** Die Datenbank schliessen — der Bestand ist danach wieder zu. */
export function datenbankSchliessen(): Promise<void> {
  return invoke<void>("datenbank_schliessen");
}

/**
 * Ob gerade offen.
 *
 * Gebraucht nach einem Neuladen des Webviews: die Oberfläche weiss dann nicht mehr, ob
 * schon entsperrt wurde, der Rust-Teil aber schon.
 */
export function datenbankIstOffen(): Promise<boolean> {
  return invoke<boolean>("datenbank_ist_offen");
}

let dbPromise: Promise<Datenbankzugang> | null = null;

/**
 * Die Sicherung des Tages — VOR den Migrationen.
 *
 * Der Ort ist der ganze Punkt: der Fall, für den es Sicherungen gibt, ist eine
 * Schemaänderung, die schiefgeht. Danach zu sichern hiesse, den kaputten Stand zu
 * sichern. Läuft heute schon eine, passiert hier nichts.
 *
 * **Ein Fehlschlag hält den Start nicht auf.** Wer die App öffnet, will seine Ausgaben
 * sehen; dass keine Sicherung entstand, ist kein Grund, ihm das zu verweigern. Es steht
 * in der Konsole und sonst nirgends — dieselbe Abwägung wie bei der Update-Prüfung.
 */
async function sicherungVersuchen(): Promise<void> {
  try {
    await sicherungPflegen(tauriSicherungPort, heute());
  } catch (fehler) {
    console.warn("Sicherung nicht möglich:", fehler);
  }
}

export function getDb(): Promise<Datenbankzugang> {
  if (!dbPromise) {
    dbPromise = (async () => {
      await datenbankOeffnen(null);
      await sicherungVersuchen();
      await migrate(zugang);
      return zugang;
    })();
  }
  return dbPromise;
}

/**
 * Den gemerkten Zugang vergessen — nach dem Sperren.
 *
 * Ohne das gäbe `getDb()` weiter die zwischengespeicherte Zusage zurück, und der nächste
 * Zugriff liefe gegen eine geschlossene Datenbank statt in den Entsperr-Bildschirm.
 */
export function zugangVergessen(): void {
  dbPromise = null;
}
