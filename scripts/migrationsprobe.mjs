#!/usr/bin/env node
// Faehrt die Migrationskette gegen eine KOPIE eines Spielstands mit aelterem Schema.
// Nicht gegen den echten Bestand — siehe CLAUDE.md, „Eine Aenderung machen".
//
//   npx vite-node scripts/migrationsprobe.mjs -- <kopie.db>
//
// Das Skript liest die Kopie und schreibt nur `<kopie>-migriert.db` daneben, und das nur,
// wenn die Kette durchlief und die Fremdschluessel sauber sind.
//
// WOZU ES DAS GIBT. Ein Bestand im ALTEN Aufbau, mit Daten darin, die die Kette umbauen
// muss — das hat `npm test` nicht. Dort entsteht jede Datenbank frisch im Zielschema.
//
// WIE ES MIGRIERT. Ueber `migrate()` aus `src/adapters/persistence/db.ts`, nicht ueber
// einen Nachbau — die Arbeit steht in `src/testwerkzeug/migrationsprobe.ts`, dieses
// Skript ist nur Datei und Ausgabe darum. Bis 2026-11-22 lief hier eine eigene Schleife,
// und sie wich ab: keine Transaktion je Version, kein Eintrag in `_migration`, kein
// `-- @wennSpalte`. Ob Skript und App gleich migrieren, prueft
// `src/testwerkzeug/migrationsprobe.test.ts`.
//
// Was die Probe NICHT nachstellt: SQLCipher und die SQLite-Fassung der App. Gefahren wird
// unter sql.js; was nur an der SQLite-Version haengt, sieht man erst beim App-Start.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pfad = process.argv[2];

if (!pfad) {
  console.error("Aufruf: npx vite-node scripts/migrationsprobe.mjs -- <kopie.db>");
  process.exit(2);
}

// Der echte Bestand ist verschluesselt und waere fuer sql.js ohnehin unlesbar — abgewiesen
// wird er trotzdem am Namen, bevor irgendetwas geoeffnet wird.
if (basename(pfad) === "moneymanager.db") {
  console.error("ABGEWIESEN: `moneymanager.db` ist der echte Bestand. Die Probe faehrt nur Kopien eines Spielstands.");
  process.exit(2);
}

const { migrationsprobe } = await import("../src/testwerkzeug/migrationsprobe.ts").catch(() => {
  console.error(
    "Die Migrationen sind TypeScript — dieses Skript ueber vite-node starten:\n" +
      "  npx vite-node scripts/migrationsprobe.mjs -- <kopie.db>",
  );
  process.exit(2);
});

const initSqlJs = (await import("sql.js")).default;
const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });

let ergebnis;
try {
  ergebnis = await migrationsprobe(SQL, readFileSync(pfad));
} catch (e) {
  console.error(
    `Die Datei laesst sich nicht lesen: ${e.message}\n` +
      "Ein Spielstand, den die App geoeffnet hat, ist verschluesselt — sql.js liest ihn nicht.",
  );
  process.exit(2);
}

console.log(`Stand vor der Migration: v${ergebnis.standVorher}`);
console.log(
  ergebnis.standNachher === ergebnis.standVorher
    ? "Nichts gelaufen."
    : `Stand nach der Migration: v${ergebnis.standNachher}`,
);

// Ausgegeben wird die VERAENDERUNG, nicht der Bestand: Zahlen aus einer Datenbank gehoeren
// nicht in eine Ausgabe, die irgendwo landet.
if (ergebnis.veraendert.length) {
  console.log("\nZeilen je Tabelle:");
  for (const { tabelle, veraenderung } of ergebnis.veraendert) console.log(`  ${tabelle}: ${veraenderung}`);
}

if (ergebnis.verletzt.length) {
  console.log("\nFremdschluessel VERLETZT (Tabelle -> Ziel):");
  for (const { tabelle, ziel } of ergebnis.verletzt.slice(0, 10)) console.log(`  ${tabelle} -> ${ziel}`);
}

if (ergebnis.fehler) {
  console.error(`\nFEHLER: ${ergebnis.fehler}`);
  process.exit(1);
}

// `migrate()` prueft nur, wenn eine Version lief — die Probe prueft immer. Ein Verstoss,
// den die App bei diesem Stand nicht melden wuerde, ist trotzdem einer.
if (ergebnis.verletzt.length) {
  console.error("\nFEHLER: Fremdschluessel verletzt, obwohl keine Version lief — der Widerspruch lag schon in der Kopie.");
  process.exit(1);
}

console.log("\nFremdschluessel-Pruefung: sauber");
const ziel = pfad.replace(/\.db$/, "") + "-migriert.db";
writeFileSync(ziel, Buffer.from(ergebnis.daten));
console.log(`Migrierte Fassung: ${ziel}`);
