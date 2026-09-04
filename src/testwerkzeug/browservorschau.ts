// Die App im BROWSER laufen lassen — damit man sie auf einem Handy ansehen kann.
//
// WOZU ES DAS GIBT. Es gibt kein E2E (siehe `src/CLAUDE.md`), und `npm run dev` allein
// half hier nicht weiter: ohne die Tauri-Shell scheitert der allererste Aufruf
// (`zugang_stand`), die Oberflaeche bleibt im Zustand „laedt" und rendert `null`. Auf dem
// Handy sah man eine WEISSE SEITE — kein Fehler, keine Meldung, nichts zu beurteilen.
//
// Diese Datei legt deshalb eine Attrappe der Tauri-Naht (`window.__TAURI_INTERNALS__`)
// und beantwortet die Kommandos aus einer sql.js-Datenbank im Speicher — dieselbe
// Engine, dieselbe Migrationskette und derselbe Spielstand wie in den Tests und in
// `npm run seed`. Kein Produktivcode wird dafuer angefasst: `invoke` fragt genau dieses
// eine Objekt.
//
// **Sie ist WERKZEUG und laeuft ausschliesslich in der Entwicklung.** `main.tsx` laedt
// sie dynamisch und nur unter `import.meta.env.DEV` — im gebauten Bundle ist sie nicht
// enthalten. Diese Datei ist aus der Coverage ausgenommen.
//
// DREI GRENZEN, die man kennen muss, bevor man einem Befund hier glaubt:
//
//   1. **Alles liegt im Speicher.** Ein Neuladen wirft den Bestand weg und seedet neu.
//      Was man aendert, ist nach F5 wieder wie vorher.
//   2. **Fremdschluessel sind aus** — sql.js prueft sie nicht. Dieselbe blinde Stelle wie
//      in den Tests: ein Datenfehler, den die echte Datenbank abweisen wuerde, faellt
//      hier durch.
//   3. **Es gibt keine Verschluesselung, keine Sicherungen, keinen Bankabruf und kein
//      Update.** Die Kommandos dafuer antworten mit dem harmlosesten Wert oder werfen mit
//      Namen. Wer eines davon pruefen will, braucht die echte Shell.

import initSqlJs, { type Database } from "sql.js";
// Vite loest das zur URL der WASM-Datei auf und liefert sie mit aus. Der Weg ueber
// `node:module` (so macht es der Test-Harness) gibt es im Browser nicht.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { MIGRATIONS } from "../adapters/persistence/migrations";
import { seedEinspielen } from "./seedDaten";

/** Der Spielstand im Speicher — vollstaendig migriert und gefuellt. */
async function bestandBauen(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  // Dieselbe Buchfuehrung wie `migrate()`: ohne den Eintrag faehrt die App beim Start
  // die ganze Kette ein zweites Mal ueber das fertige Schema.
  db.run("CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)");
  for (const m of MIGRATIONS) {
    for (const sql of m.sql) db.run(sql);
    db.run("INSERT INTO _migration (version) VALUES (?)", [m.version]);
  }
  seedEinspielen(db);
  return db;
}

interface Anweisung {
  sql: string;
  werte?: unknown[];
}

/**
 * Die Kommandos, die die App tatsaechlich absetzt.
 *
 * Was hier fehlt, WIRFT mit seinem Namen statt still `undefined` zu liefern. Ein
 * Kommando, das wortlos nichts zurueckgibt, laesst die Oberflaeche in einen leeren
 * Zustand laufen, und man sucht den Fehler dann im Screen.
 */
function kommandos(db: Database) {
  // Der Plugin-Weg nummeriert Platzhalter ($1, $2, …), sql.js bindet Arrays an „?" —
  // hier auf benannte Parameter abgebildet. Dieselbe Umsetzung wie im Test-Harness.
  const benannt = (werte: unknown[] = []) =>
    Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never]));

  const ausfuehren = (sql: string, werte?: unknown[]) => {
    db.run(sql, benannt(werte));
    return { rowsAffected: db.getRowsModified(), lastInsertId: 0 };
  };

  const lesen = (sql: string, werte?: unknown[]) => {
    const stmt = db.prepare(sql);
    if (werte?.length) stmt.bind(benannt(werte));
    const zeilen: unknown[] = [];
    while (stmt.step()) zeilen.push(stmt.getAsObject());
    stmt.free();
    return zeilen;
  };

  return {
    // --- Datenbank ---
    db_select: (a: { sql: string; werte?: unknown[] }) => lesen(a.sql, a.werte),
    db_execute: (a: { sql: string; werte?: unknown[] }) => ausfuehren(a.sql, a.werte),
    datenbank_oeffnen: () => true,
    datenbank_ist_offen: () => true,
    datenbank_schliessen: () => undefined,
    transaktion: (a: { anweisungen: Anweisung[] }) => {
      db.run("BEGIN");
      try {
        for (const x of a.anweisungen) ausfuehren(x.sql, x.werte);
        db.run("COMMIT");
      } catch (fehler) {
        try {
          db.run("ROLLBACK");
        } catch {
          /* der urspruengliche Fehler zaehlt */
        }
        throw fehler;
      }
      return undefined;
    },
    schema_umbau: (a: { anweisungen: Anweisung[] }) => {
      for (const x of a.anweisungen) ausfuehren(x.sql, x.werte);
      return undefined;
    },

    // --- Zugang ---
    // Eingerichtet UND offen: das Tor steht vor allem anderen, und eine Passphrase, die
    // nichts verschluesselt, waere eine Abfrage ohne Sinn.
    zugang_stand: () => ({ eingerichtet: true, offen: true, altbestand: false }),
    zugang_entsperren: () => true,
    zugang_code_zeigen: () => null,

    // --- Sicherung ---
    // `false` heisst „heute schon eine da" und ist damit der Wert, der nichts behauptet.
    sicherung_anlegen: () => false,
    sicherungen_auflisten: () => [] as string[],
    sicherungen_entfernen: () => 0,
    sicherungsordner: () => "(Browser-Vorschau — keine Sicherungen)",

    // --- Aktualisierung ---
    // `null` heisst „nichts Neues" und ist genau die Antwort, die die App hier braucht.
    // Sie faengt einen Fehlschlag zwar ab („Ein Fehlschlag beim PRUEFEN ist kein
    // Fehler"), schriebe aber bei jedem Start eine Warnung in die Konsole — und eine
    // Vorschau, die von sich aus Fehler meldet, macht die echten unsichtbar.
    "plugin:updater|check": () => null,
  } as Record<string, (a: never) => unknown>;
}

/**
 * Die Attrappe einlegen. Tut nichts, wenn die echte Shell schon da ist.
 *
 * Der Rueckgabewert jedes Kommandos wird in ein `Promise` verpackt — `invoke` erwartet
 * eines, und ein synchron geworfener Fehler kaeme sonst an einer Stelle heraus, an der
 * niemand ihn faengt.
 */
export async function vorschauEinrichten(): Promise<void> {
  if ("__TAURI_INTERNALS__" in globalThis) return;

  const db = await bestandBauen();
  const tabelle = kommandos(db);

  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
    value: {
      invoke: (befehl: string, argumente: unknown) => {
        const fn = tabelle[befehl];
        if (!fn) {
          return Promise.reject(
            new Error(
              `Browser-Vorschau: das Kommando „${befehl}" gibt es hier nicht. ` +
                `Was dahinter steckt (Verschluesselung, Bankabruf, Update, Export), ` +
                `laeuft nur in der Tauri-Shell.`,
            ),
          );
        }
        try {
          return Promise.resolve(fn(argumente as never));
        } catch (fehler) {
          return Promise.reject(fehler);
        }
      },
      transformCallback: (cb: unknown) => cb,
    },
    writable: true,
    configurable: true,
  });

  // Sichtbar in der Konsole, damit niemand einen Befund aus der Vorschau fuer einen
  // Befund aus der App haelt.
  console.info(
    "Browser-Vorschau: Spielstand im Speicher (sql.js). Kein Bestand, keine " +
      "Verschluesselung, keine Fremdschluesselpruefung — ein Neuladen setzt alles zurueck.",
  );
}
