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
//
// Wo unten vom Plugin die Rede ist (bei `migrate`), ist das Geschichte und als solche
// stehengelassen: sie erklärt, warum die Migrationen zusätzlich einzeln wiederholbar sind.

import { invoke } from "@tauri-apps/api/core";
import { MIGRATIONS } from "./migrations";
import { fremdschluesselPruefen } from "./transaktion";
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
 * **Jede Migration läuft in EINER Transaktion, samt ihrem Versionseintrag** (seit
 * 2026-11-10). Bricht sie ab — ein Fehler im Statement, ein Absturz, ein Stromausfall —,
 * steht die Datenbank da, wo sie vorher stand, und der nächste Start fährt die Migration
 * von vorn. Den halben Zustand gibt es nicht mehr. SQLite kann das, weil dort auch
 * `CREATE`, `ALTER` und `DROP` transaktional sind.
 *
 * **Warum das lange nicht so war.** Über tauri-plugin-sql holte jedes `execute` eine
 * beliebige Verbindung aus dem Pool: ein `BEGIN` landete auf der einen, die Statements
 * auf anderen, das `COMMIT` irgendwo — eine Klammer, die aussah wie Sicherheit. Statt
 * ihrer wurde jedes Statement WIEDERHOLBAR gemacht. Seit dem eigenen Pool gilt der Grund
 * nicht mehr; `db` ist hier eine Sitzung auf EINER festgehaltenen Verbindung
 * (`inSchemasitzung` unten, `src-tauri/src/transaktion.rs`).
 *
 * **Die Wiederholbarkeit bleibt trotzdem stehen**, als zweites Netz und weil die
 * bestehenden Versionen darauf gebaut sind:
 *
 *  • `CREATE TABLE/INDEX` tragen `IF NOT EXISTS`, `DROP TABLE/INDEX` tragen `IF EXISTS`.
 *  • `ALTER TABLE … ADD COLUMN` kennt kein `IF NOT EXISTS` in SQLite — die Spalte wird
 *    vorher per `PRAGMA table_info` geprüft und der Zugang übersprungen.
 *  • `ALTER TABLE … DROP COLUMN` genauso, nur andersherum.
 *  • `-- @wennTabelle x` vor einem Statement überspringt es, wenn `x` fehlt.
 *  • `-- @wennSpalte x.y` dasselbe für eine Spalte.
 *
 * Ein Bestand, der unter dem alten Ablauf mitten in einer Migration stehengeblieben ist,
 * kommt so weiterhin hoch.
 *
 * **Die Statements laufen OHNE Fremdschlüsselprüfung, geprüft wird am Ende.** SQLite kann
 * Constraints nicht nachrüsten; eine Tabelle bekommt sie nur durch Neubau. Mit
 * eingeschalteten Schlüsseln geht dabei zweierlei schief, und beides ist gemessen:
 * `DROP TABLE` scheitert, wenn ein Schlüssel mit RESTRICT darauf zeigt, und es LÖSCHT
 * STILL, wo einer mit CASCADE darauf zeigt — SQLite behandelt den Drop wie das Löschen
 * aller Zeilen. Die offizielle Umbau-Prozedur schaltet die Prüfung deshalb ab und holt
 * sie danach nach. In der App schaltet die Sitzung sie ab (das Pragma gilt pro
 * Verbindung und wirkt nur AUSSERHALB einer Transaktion), im Test sind sie ohnehin aus.
 *
 * **Die Prüfung steht bewusst NACH der Kette und ausserhalb der Transaktionen.** In die
 * Klammer gezogen, würde ein Widerspruch, der schon VOR der Migration im Bestand lag,
 * jede künftige Migration zurückrollen — für immer. So meldet sie ihn einmal laut, und
 * der nächste Start kommt hoch.
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
    await db.execute("BEGIN");
    try {
      for (const stmt of m.sql) {
        const bedingung = tabellenBedingung(stmt);
        if (bedingung && !(await tabelleExistiert(db, bedingung))) continue;
        const spaltig = spaltenBedingung(stmt);
        if (spaltig && !(await spalteExistiert(db, spaltig.tabelle, spaltig.spalte))) continue;
        const zugang = spaltenZugang(stmt);
        if (zugang && (await spalteExistiert(db, zugang.tabelle, zugang.spalte))) continue;
        const abgang = spaltenAbgang(stmt);
        if (abgang && !(await spalteExistiert(db, abgang.tabelle, abgang.spalte))) continue;
        await db.execute(stmt);
      }
      // Der Versionseintrag gehört IN die Klammer: Schema und Stand wechseln zusammen
      // oder gar nicht.
      await db.execute(`INSERT INTO _migration (version) VALUES ($1)`, [m.version]);
      await db.execute("COMMIT");
    } catch (fehler) {
      // Der Rollback-Fehler darf den eigentlichen nicht verdecken.
      try {
        await db.execute("ROLLBACK");
      } catch {
        /* der ursprüngliche Fehler zählt */
      }
      throw new Error(
        `Migration ${m.version} ist fehlgeschlagen und wurde zurückgenommen: ` +
          (fehler instanceof Error ? fehler.message : String(fehler)),
      );
    }
    gelaufen = true;
  }

  // Die Prüfung, die während des Umbaus ausgeschaltet war — nachgeholt, sobald das Schema
  // steht. Nur wenn überhaupt etwas lief: bei jedem App-Start die ganze Datenbank
  // durchzuprüfen, obwohl sich nichts geändert hat, wäre Aufwand ohne Anlass.
  if (gelaufen) await fremdschluesselPruefen(db);
}

/**
 * Eine Sitzung auf EINER festgehaltenen Verbindung, mit abgeschalteten Fremdschlüsseln.
 *
 * Alles, was `arbeit` über das übergebene `db` schickt, läuft auf derselben Verbindung —
 * das ist die Voraussetzung dafür, dass `BEGIN`, die Statements, die Blicke auf den
 * Zwischenstand und `COMMIT` zusammengehören. Beendet wird in jedem Fall: eine Sitzung,
 * die hängenbleibt, hält eine Schreibsperre, und an ihr wartet auch das Sperren der App.
 *
 * Die drei `invoke`-Zweige erreicht kein Test dieser Datei (sie laufen nur in der
 * Tauri-Shell); was die Sitzung leistet, prüft `src-tauri/src/transaktion.rs`, und was
 * `migrate` mit ihr anfängt, läuft im Test wortgleich über sql.js.
 */
async function inSchemasitzung<T>(arbeit: (db: MigrationsDb) => Promise<T>): Promise<T> {
  await invoke("schemasitzung_beginnen");
  try {
    return await arbeit({
      execute: (sql, werte = []) => invoke("schemasitzung_execute", { sql, werte }),
      select: <T,>(sql: string) => invoke<T>("schemasitzung_select", { sql, werte: [] }),
    });
  } finally {
    await invoke("schemasitzung_beenden");
  }
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

// **Ein `datenbankOeffnen` gibt es hier nicht mehr (seit 2026-11-10).** Geöffnet wird
// ausschliesslich über den Zugang (`zugang.ts` → `zugang_entsperren` und Verwandte), also
// mit einem Schlüssel, den nur Rust kennt. Die Funktion stammte aus der Zeit vor der
// Verschlüsselung und reichte den Wert für `PRAGMA key` durch den Webview — das Gegenteil
// der Zusage in `application/zugang.ts`, dass die Anwendung den Schlüssel nie sieht.

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

/**
 * Der Zugang zur Datenbank — samt Tagessicherung und Migrationen beim ersten Mal.
 *
 * **Geöffnet wird hier NICHT.** Das Tor in `App.tsx` rendert keinen Screen, bevor Rust
 * „offen" meldet; wer hier ankommt, hat entsperrt. Bis 2026-11-10 stand an dieser Stelle
 * trotzdem ein Öffnungsversuch OHNE Schlüssel, bei jedem Start. Er ging nur deshalb gut,
 * weil die Prüfabfrage an der verschlüsselten Datei scheiterte und der vorhandene Pool
 * stehen blieb — eine Zeile, die funktioniert, weil sie fehlschlägt.
 *
 * **Ein Fehlschlag wird nicht gemerkt.** Die Zusage wird zwischengespeichert, damit
 * Sicherung und Migrationen genau einmal laufen. Scheitert sie aber — etwa weil ein noch
 * laufender Ladevorgang nach dem Sperren hier ankommt und auf die geschlossene Datenbank
 * trifft —, bliebe ohne das Zurücksetzen die ABGELEHNTE Zusage stehen, und nach dem
 * Entsperren bekäme jeder Screen den alten Fehler, bis zum Neustart der App.
 */
export function getDb(): Promise<Datenbankzugang> {
  if (!dbPromise) {
    const zusage = (async () => {
      await sicherungVersuchen();
      await inSchemasitzung(migrate);
      return zugang;
    })();
    dbPromise = zusage;
    zusage.catch(() => {
      // Nur die EIGENE Zusage räumen: inzwischen kann gesperrt, entsperrt und eine neue
      // angelegt worden sein — die darf dieser späte Fehler nicht mitnehmen.
      if (dbPromise === zusage) dbPromise = null;
    });
  }
  return dbPromise;
}

/**
 * Den gemerkten Zugang vergessen — nach dem Sperren UND nach dem Entsperren.
 *
 * Nach dem Sperren, weil `getDb()` sonst weiter die zwischengespeicherte Zusage
 * zurückgäbe und der nächste Zugriff gegen eine geschlossene Datenbank liefe. Nach dem
 * Entsperren, weil Sicherung und Migrationen zu jeder ÖFFNUNG gehören und nicht zum
 * Prozess: wer über Nacht gesperrt hatte, bekommt am Morgen seine Tagessicherung.
 */
export function zugangVergessen(): void {
  dbPromise = null;
}
