// Die Migrationsprobe muss beweisen, was sie vorgibt: dass ein Bestand im alten Aufbau
// so dasteht, wie die App ihn nach dem Öffnen hätte. Gemessen wird deshalb gegen
// `migrate()` auf einer frischen Datenbank — dasselbe Schema, Zeichen für Zeichen, und
// dieselbe Versionsführung.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "../adapters/persistence/migrations";
import { migrate } from "../adapters/persistence/db";
import { alsMigrationsDb, migrationsprobe } from "./migrationsprobe";

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

/** Die Stufe, auf der der alte Bestand steht — vor dem Rücklagen-Umbau (v76–v81). */
const ALTE_STUFE = 75;

/**
 * Ein Bestand im Aufbau von v75, so wie die App ihn damals hinterliess: Schema samt
 * `_migration`. Die Daten sind genau die, die v80 und v81 umbauen müssen.
 */
function alterBestand(zusatz?: (db: Database) => void): Uint8Array {
  const db = new SQL.Database();
  db.run("CREATE TABLE _migration (version INTEGER PRIMARY KEY)");
  for (const m of MIGRATIONS) {
    if (m.version > ALTE_STUFE) continue;
    for (const sql of m.sql) db.run(sql);
    db.run("INSERT INTO _migration (version) VALUES (?)", [m.version]);
  }
  db.run("INSERT INTO person (id, name) VALUES ('p-probe', 'Ohlert')");
  db.run(`INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse)
          VALUES ('k-probe', 'Tagesgeld', 'tagesgeld', 'ruecklage')`);
  db.run(`INSERT INTO kategorie (id, name, default_charakter)
          VALUES ('kat-probe', 'Vibora', 'variabel')`);
  // Ein aufbauendes Budget mit Betragsreihe: v81 macht daraus eine Rücklage.
  db.run(`INSERT INTO budget (id, kategorie_id, konto_id, art, start)
          VALUES ('b-probe', 'kat-probe', 'k-probe', 'aufbauend', '2026-01-01')`);
  db.run("INSERT INTO budget_betrag (budget_id, ab_monat, betrag) VALUES ('b-probe', '2026-01', 5000)");
  // Eine Rücklage mit freier Rate: v80 trägt sie in die Ratenreihe.
  db.run(`INSERT INTO ruecklage (id, bezeichnung, rate, beginn, konto_id)
          VALUES ('r-probe', 'Kesselmann', 2500, '2026-02-01', 'k-probe')`);
  zusatz?.(db);
  const daten = db.export();
  db.close();
  return daten;
}

function schema(db: Database): unknown {
  return db.exec("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name")[0].values;
}

function versionen(db: Database): number[] {
  return db.exec("SELECT version FROM _migration ORDER BY version")[0].values.map((z) => Number(z[0]));
}

async function frischMigriert(): Promise<Database> {
  const db = new SQL.Database();
  await migrate(alsMigrationsDb(db));
  return db;
}

describe("migrationsprobe", () => {
  it("bringt einen alten Bestand auf dasselbe Schema wie migrate() auf einer frischen Datenbank", async () => {
    const ergebnis = await migrationsprobe(SQL, alterBestand());
    expect(ergebnis.fehler).toBeNull();
    expect(ergebnis.verletzt).toEqual([]);

    const probe = new SQL.Database(ergebnis.daten);
    const frisch = await frischMigriert();
    expect(schema(probe)).toEqual(schema(frisch));
    probe.close();
    frisch.close();
  });

  // Der Nachbau bis 2026-11-22 schrieb keine Versionen: die migrierte Fassung stand
  // danach noch auf der alten Stufe, und die App hätte die Kette über sie erneut gefahren.
  it("führt die Versionen wie migrate()", async () => {
    const ergebnis = await migrationsprobe(SQL, alterBestand());
    expect(ergebnis.standVorher).toBe(ALTE_STUFE);
    expect(ergebnis.standNachher).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);

    const probe = new SQL.Database(ergebnis.daten);
    const frisch = await frischMigriert();
    expect(versionen(probe)).toEqual(versionen(frisch));
    probe.close();
    frisch.close();
  });

  it("baut die Daten um, die die Kette umbauen muss, und meldet nur die Richtung", async () => {
    const ergebnis = await migrationsprobe(SQL, alterBestand());
    const probe = new SQL.Database(ergebnis.daten);

    // v81: das aufbauende Budget ist eine Rücklage geworden, seine Reihe ihre Raten.
    expect(probe.exec("SELECT COUNT(*) FROM budget WHERE id = 'b-probe'")[0].values[0][0]).toBe(0);
    expect(probe.exec("SELECT art FROM ruecklage WHERE id = 'b-probe'")[0].values[0][0]).toBe("fortlaufend");
    // v80: die freie Rate steht in der Reihe.
    expect(
      probe.exec("SELECT betrag FROM ruecklage_rate WHERE ruecklage_id = 'r-probe'")[0].values[0][0],
    ).toBe(2500);
    probe.close();

    expect(ergebnis.veraendert).toContainEqual({ tabelle: "budget", veraenderung: "weniger" });
    expect(ergebnis.veraendert).toContainEqual({ tabelle: "ruecklage", veraenderung: "mehr" });
    expect(ergebnis.veraendert).toContainEqual({ tabelle: "ruecklage_rate", veraenderung: "neu angelegt" });
  });

  it("hat über der eigenen Fassung nichts mehr zu tun", async () => {
    const erste = await migrationsprobe(SQL, alterBestand());
    const zweite = await migrationsprobe(SQL, erste.daten);
    expect(zweite.fehler).toBeNull();
    expect(zweite.standVorher).toBe(erste.standNachher);
    expect(zweite.veraendert).toEqual([]);
  });

  // Ein Widerspruch, der schon im alten Bestand lag: migrate() meldet ihn nach der
  // Kette laut, die Probe nennt dazu die Tabelle.
  it("meldet einen verletzten Fremdschlüssel wie migrate() und nennt die Tabelle", async () => {
    const ergebnis = await migrationsprobe(
      SQL,
      alterBestand((db) =>
        db.run("INSERT INTO budget_betrag (budget_id, ab_monat, betrag) VALUES ('b-fehlt', '2026-03', 100)"),
      ),
    );
    expect(ergebnis.fehler).toMatch(/Fremdschluessel/);
    expect(ergebnis.verletzt).toContainEqual({ tabelle: "budget_betrag", ziel: "budget" });
  });

  // Die eigentliche Zusage: es gibt keinen zweiten Ablauf, der auseinanderlaufen könnte.
  it("das Skript fährt die Kette nicht selbst", () => {
    const skript = readFileSync(new URL("../../scripts/migrationsprobe.mjs", import.meta.url), "utf8");
    expect(skript).toContain("src/testwerkzeug/migrationsprobe.ts");
    expect(skript).not.toMatch(/MIGRATIONS|db\.run\(/);
  });
});
