#!/usr/bin/env node
// Faehrt die Migrationskette gegen eine KOPIE einer echten Datenbank.
//
// WOZU ES DAS GIBT. `npm test` prueft die Migrationen gegen sql.js — und sql.js hat
// Fremdschluessel standardmaessig AUS, waehrend sqlx sie in der App auf jeder Verbindung
// EINSCHALTET. Eine Migration kann deshalb gruen sein und in der App scheitern oder still
// Daten loeschen. Genau das ist beim Umbau auf Fremdschluessel passiert: `DROP TABLE`
// scheiterte an RESTRICT, und wo CASCADE darauf zeigte, haette es Zeilen mitgenommen.
//
// Der Test kann das nicht finden. Dieses Skript schon.
//
//   node scripts/migrationsprobe.mjs <kopie.db>
//
// Die Kopie wird mit `sqlite3 -readonly "$DB" ".backup '/pfad/kopie.db'"` gezogen — NICHT
// mit `cp`: die Datenbank laeuft im WAL-Modus, und frische Schreibvorgaenge stehen in der
// `-wal`-Datei. Ein `cp` liefert einen aelteren Stand, still und plausibel aussehend.
//
// Das Skript SCHREIBT nur in die Kopie und ruehrt die echte Datenbank nie an.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const pfad = process.argv[2];

if (!pfad) {
  console.error("Aufruf: node scripts/migrationsprobe.mjs <kopie.db>");
  process.exit(2);
}

const { MIGRATIONS } = await import("../src/adapters/persistence/migrations.ts").catch(() => {
  console.error(
    "Die Migrationen sind TypeScript — dieses Skript ueber vite-node starten:\n" +
      "  npx vite-node scripts/migrationsprobe.mjs -- <kopie.db>",
  );
  process.exit(2);
});

const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
const db = new SQL.Database(readFileSync(pfad));

// Waehrend des Umbaus AUS — wie `migrate()` es ueber den schema_umbau-Command tut.
db.run("PRAGMA foreign_keys = OFF");

const zahl = (sql) => {
  try {
    const r = db.exec(sql);
    return r.length ? Number(r[0].values[0][0]) : 0;
  } catch {
    return null;
  }
};

const tabellen = () =>
  db
    .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]
    .values.map((z) => String(z[0]));

const vorher = Object.fromEntries(tabellen().map((t) => [t, zahl(`SELECT COUNT(*) FROM ${t}`)]));
const stand = zahl("SELECT COALESCE(MAX(version),0) FROM _migration");
console.log(`Stand vor der Migration: v${stand}`);

const bedingung = (sql) => sql.match(/^\s*--\s*@wennTabelle\s+(\w+)/i)?.[1];
const hatTabelle = (n) =>
  db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${n}'`).length > 0;
const zugang = (sql) => sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
const abgang = (sql) => sql.match(/^\s*ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)/i);
const hatSpalte = (t, s) => {
  const r = db.exec(`PRAGMA table_info(${t})`);
  return r.length > 0 && r[0].values.some((z) => String(z[1]) === s);
};

let gelaufen = 0;
for (const m of MIGRATIONS) {
  if (m.version <= stand) continue;
  for (const sql of m.sql) {
    const noetig = bedingung(sql);
    if (noetig && !hatTabelle(noetig)) continue;
    const dazu = zugang(sql);
    if (dazu && hatSpalte(dazu[1], dazu[2])) continue;
    const weg = abgang(sql);
    if (weg && !hatSpalte(weg[1], weg[2])) continue;
    try {
      db.run(sql);
    } catch (e) {
      console.error(`\nFEHLER in v${m.version}: ${e.message}`);
      console.error(sql.slice(0, 300));
      process.exit(1);
    }
  }
  console.log(`v${m.version} ok`);
  gelaufen++;
}

if (gelaufen === 0) console.log("Nichts zu tun — die Kopie ist auf dem letzten Stand.");

// Was die Kette hinterlassen hat. Ausgegeben wird die VERAENDERUNG, nicht der Bestand:
// Zahlen aus der echten Datenbank gehoeren nicht in eine Ausgabe, die irgendwo landet.
console.log("\nZeilen je Tabelle:");
for (const t of tabellen()) {
  const jetzt = zahl(`SELECT COUNT(*) FROM ${t}`);
  const alt = vorher[t];
  if (alt === undefined) console.log(`  ${t}: neu angelegt`);
  else if (alt !== jetzt) console.log(`  ${t}: VERAENDERT (${jetzt > alt ? "mehr" : "weniger"})`);
}
for (const t of Object.keys(vorher)) {
  if (!tabellen().includes(t)) console.log(`  ${t}: abgeraeumt`);
}

db.run("PRAGMA foreign_keys = ON");
const fk = db.exec("PRAGMA foreign_key_check");
console.log(`\nFremdschluessel-Pruefung: ${fk.length === 0 ? "sauber" : "VERLETZT"}`);
if (fk.length) {
  console.log(fk[0].values.slice(0, 10));
  process.exit(1);
}

const ziel = pfad.replace(/\.db$/, "-migriert.db");
writeFileSync(ziel, Buffer.from(db.export()));
console.log(`Migrierte Fassung: ${ziel}`);
db.close();
