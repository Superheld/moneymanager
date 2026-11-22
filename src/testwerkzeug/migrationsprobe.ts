// Die Migrationsprobe ohne Datei und ohne Konsole — `scripts/migrationsprobe.mjs` ist nur
// die Kommandozeile darum, `migrationsprobe.test.ts` prueft sie.
//
// **Die Kette faehrt hier `migrate()` selbst**, nicht ein Nachbau. Bis 2026-11-22 baute
// das Skript die Schleife aus `db.ts` nach und lief ihr hinterher: ohne Transaktion je
// Version, ohne Versionseintrag in `_migration`, ohne `-- @wennSpalte`. Jede Regel, die
// `migrate()` dazulernt, haette ein Nachbau wieder verpasst.
//
// Was die App DARUM herum tut, steht hier dazu, und nur das: die Schemasitzung schaltet
// die Fremdschluessel ab, bevor `migrate()` beginnt (`src-tauri/src/transaktion.rs`).
// Die Tagessicherung davor entfaellt — die Probe laeuft ohnehin auf einer Kopie.

import type { Database, SqlJsStatic } from "sql.js";
import { migrate, type MigrationsDb } from "../adapters/persistence/db";

/** Was sich an einer Tabelle getan hat — die Richtung, nie die Zahl (siehe `CLAUDE.md`). */
export type Veraenderung = "neu angelegt" | "mehr" | "weniger" | "abgeraeumt";

export interface Probenergebnis {
  standVorher: number;
  standNachher: number;
  /** Tabellen, deren Zeilenzahl sich verändert hat; unveränderte fehlen. */
  veraendert: { tabelle: string; veraenderung: Veraenderung }[];
  /** Die Meldung von `migrate()`, wenn es scheiterte; sonst null. */
  fehler: string | null;
  /** `PRAGMA foreign_key_check` nach dem Lauf: Tabelle und Zieltabelle je Verstoss. */
  verletzt: { tabelle: string; ziel: string }[];
  /** Die migrierte Datenbank — nur gültig, wenn `fehler` null ist. */
  daten: Uint8Array;
}

/** sql.js als `MigrationsDb` — dieselbe Form, die in der App die Schemasitzung hat. */
export function alsMigrationsDb(db: Database): MigrationsDb {
  return {
    async execute(sql: string, werte: unknown[] = []) {
      db.run(sql, werte as never);
    },
    async select<T>(sql: string): Promise<T> {
      const [res] = db.exec(sql);
      if (!res) return [] as unknown as T;
      return res.values.map((zeile) =>
        Object.fromEntries(res.columns.map((c, i) => [c, zeile[i]])),
      ) as unknown as T;
    },
  };
}

function tabellen(db: Database): string[] {
  const [r] = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  return r ? r.values.map((z) => String(z[0])) : [];
}

function zeilen(db: Database, tabelle: string): number {
  return Number(db.exec(`SELECT COUNT(*) FROM "${tabelle}"`)[0].values[0][0]);
}

function stand(db: Database): number {
  if (!tabellen(db).includes("_migration")) return 0;
  return Number(db.exec("SELECT COALESCE(MAX(version), 0) FROM _migration")[0].values[0][0]);
}

/**
 * Fährt `migrate()` über eine Kopie von `bestand`, wie die App es beim Öffnen tut.
 *
 * Wirft nur, wenn die Datei sich nicht lesen lässt (etwa verschlüsselt). Ein Scheitern
 * der Kette steht in `fehler` — samt der Fremdschlüsselverstösse, wenn es daran lag.
 */
export async function migrationsprobe(SQL: SqlJsStatic, bestand: Uint8Array): Promise<Probenergebnis> {
  const db = new SQL.Database(bestand);
  try {
    // Wie die Schemasitzung: AUS, bevor `migrate()` beginnt — innerhalb einer
    // Transaktion wirkte das Pragma nicht mehr. sql.js hat sie zwar ohnehin aus, aber
    // die Probe soll nicht davon abhängen, was eine Bibliothek voreinstellt.
    db.run("PRAGMA foreign_keys = OFF");

    const vorher = new Map(tabellen(db).map((t) => [t, zeilen(db, t)]));
    const standVorher = stand(db);

    let fehler: string | null = null;
    try {
      await migrate(alsMigrationsDb(db));
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }

    // Die Verstösse selbst, nicht nur ihre Zahl aus `fremdschluesselPruefen`: wer die
    // Probe fährt, will wissen, WO. Tabellennamen, keine Werte.
    const [fk] = db.exec("PRAGMA foreign_key_check");
    const verletzt = fk ? fk.values.map((z) => ({ tabelle: String(z[0]), ziel: String(z[2]) })) : [];

    const jetzt = tabellen(db);
    const veraendert: Probenergebnis["veraendert"] = [];
    for (const t of jetzt) {
      const alt = vorher.get(t);
      const neu = zeilen(db, t);
      if (alt === undefined) veraendert.push({ tabelle: t, veraenderung: "neu angelegt" });
      else if (alt !== neu) veraendert.push({ tabelle: t, veraenderung: neu > alt ? "mehr" : "weniger" });
    }
    for (const t of vorher.keys()) {
      if (!jetzt.includes(t)) veraendert.push({ tabelle: t, veraenderung: "abgeraeumt" });
    }

    return { standVorher, standNachher: stand(db), veraendert, fehler, verletzt, daten: db.export() };
  } finally {
    db.close();
  }
}
