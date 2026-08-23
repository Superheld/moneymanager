// Mehrere Statements atomar ausführen.
//
// **Warum das nicht einfach `BEGIN … COMMIT` über `db.execute` ist.** tauri-plugin-sql
// schickt jedes Statement über den Verbindungs-Pool und bekommt dabei irgendeine der
// Verbindungen. Ein `BEGIN` landete auf der einen, die Schreibvorgänge auf anderen, das
// `COMMIT` wieder woanders — eine Klammer, die aussieht wie Sicherheit und keine ist.
// Ausführlich steht das in `db.ts` bei `migrate` und in `src-tauri/src/transaktion.rs`.
//
// Deshalb zwei Wege, die dasselbe leisten:
//
//  • **In der App** geht die ganze Liste in EINEM Aufruf an den Rust-Command. Der nimmt
//    sich mit `pool.begin()` eine Verbindung und hält sie bis zum Ende.
//  • **Im Test** (sql.js) gibt es nur eine Verbindung, dort ist die direkte Klammer echt.
//
// Beide rollen bei einem Fehler zurück, und der Test prüft genau das — die Zusicherung
// gilt also nicht nur auf dem Papier.
//
// **Die Grenze, die man kennen muss:** In einer Transaktion wird nur GESCHRIEBEN. Die
// Anweisungen stehen fest, bevor die erste läuft; ein `SELECT` mittendrin, dessen Ergebnis
// die nächste Anweisung bestimmt, geht nicht. Das ist kein Versehen — es hält die Liste
// als Ganzes prüfbar und über die Prozessgrenze schickbar. Wer zwischendurch lesen muss,
// liest vorher.

import { invoke } from "@tauri-apps/api/core";

/** Ein Statement mit seinen Parametern. */
export interface Anweisung {
  readonly sql: string;
  readonly werte?: readonly unknown[];
}

/** Das Minimum, das der Fallback-Weg braucht — dieselbe Form wie `MigrationsDb`. */
export interface AusfuehrbareDb {
  execute(sql: string, werte?: unknown[]): Promise<unknown>;
}

/**
 * Läuft dieser Code in der Tauri-Shell?
 *
 * Tauri legt beim Start `__TAURI_INTERNALS__` auf `window`. Im Test (jsdom, sql.js) fehlt
 * es, und `invoke` liefe ins Leere. Geprüft wird die Umgebung, nicht der Import — der
 * Import gelingt auch dort, wo der Aufruf scheitert.
 */
function inTauri(): boolean {
  return typeof globalThis === "object" && "__TAURI_INTERNALS__" in globalThis;
}

/**
 * Führt alle Anweisungen in EINER Transaktion aus; bei einem Fehler wird nichts davon
 * wirksam.
 *
 * Die leere Liste ist ausdrücklich erlaubt und tut nichts: Aufrufer, die ihre Anweisungen
 * aus einer Schleife sammeln, sollen keinen Sonderfall dafür brauchen.
 */
export async function inTransaktion(db: AusfuehrbareDb, anweisungen: readonly Anweisung[]): Promise<void> {
  if (anweisungen.length === 0) return;

  if (inTauri()) {
    await invoke("transaktion", {
      db: "sqlite:moneymanager.db",
      anweisungen: anweisungen.map((a) => ({ sql: a.sql, werte: [...(a.werte ?? [])] })),
    });
    return;
  }

  await db.execute("BEGIN");
  try {
    for (const a of anweisungen) await db.execute(a.sql, [...(a.werte ?? [])]);
    await db.execute("COMMIT");
  } catch (fehler) {
    // Der Rollback-Fehler darf den eigentlichen nicht verdecken: was schiefging, steht im
    // ersten Fehler, nicht darin, dass das Aufräumen auch scheiterte.
    try {
      await db.execute("ROLLBACK");
    } catch {
      /* der ursprüngliche Fehler zählt */
    }
    throw fehler;
  }
}
