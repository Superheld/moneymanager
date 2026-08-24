#!/usr/bin/env node
// Schreibt den SPIELSTAND fuer die Entwicklung — eine vollstaendig migrierte Datenbank
// mit erfundenen Daten.
//
//   npm run seed                          # in die Dev-Datenbank
//   npx vite-node scripts/seed-anlegen.mjs -- /pfad/x.db   # woanders hin
//
// WOZU ES DAS GIBT. Die installierte App verwaltet echtes Geld, die Entwicklung soll frei
// rumprobieren koennen. Beides auf derselben Datei geht nicht gut aus: im Alpha-Stadium
// duerfen Migrationen ausdruecklich WEGNEHMEN, und ein Versuch, der schiefgeht, traefe
// sonst den einzigen Bestand, den es gibt.
//
// Welche Datei die App oeffnet, entscheidet `src/adapters/persistence/datenbankdatei.ts`.
// Dieses Skript fuellt die andere. Die Daten selbst stehen in
// `src/testwerkzeug/seedDaten.ts` — dort, wo `src/seed.test.ts` sie bei jedem `npm test`
// gegen die aktuelle Migrationskette faehrt.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const WURZEL = new URL("..", import.meta.url).pathname;

const geladen = await Promise.all([
  import("../src/adapters/persistence/migrations.ts"),
  import("../src/testwerkzeug/seedDaten.ts"),
]).catch(() => {
  console.error(
    "Migrationen und Seed sind TypeScript — dieses Skript ueber vite-node starten:\n" +
      "  npx vite-node scripts/seed-anlegen.mjs",
  );
  process.exit(2);
});
const [{ MIGRATIONS }, { seedEinspielen }] = geladen;

const initSqlJs = (await import("sql.js")).default;

/** Wo die App im Entwicklungsmodus sucht (macOS). Muss zu `datenbankdatei.ts` passen. */
const DEV_DB = join(
  homedir(),
  "Library",
  "Application Support",
  "de.netmechanics.moneymanager",
  "moneymanager-dev.db",
);

const ziel = process.argv[2] ?? DEV_DB;

// Der Schutz, der den ganzen Zweck traegt: dieses Skript darf den ECHTEN Bestand unter
// keinen Umstaenden treffen. Es ueberschreibt sein Ziel vollstaendig — ein vertippter
// Pfad waere nicht ein Fehler, sondern der Verlust der Daten, um deren Trennung es hier
// ueberhaupt geht. Deshalb am Dateinamen abgewiesen und nicht am Inhalt: der Name steht
// fest, bevor irgendetwas geoeffnet wird.
if (basename(ziel) === "moneymanager.db") {
  console.error(
    "ABGEWIESEN: `moneymanager.db` ist der echte Bestand — der Seed ueberschreibt sein Ziel.\n" +
      "Der Spielstand heisst `moneymanager-dev.db`. Ohne Argument trifft das Skript ihn von selbst.",
  );
  process.exit(2);
}

const SQL = await initSqlJs({
  locateFile: () => join(WURZEL, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
});
const db = new SQL.Database();

// Dieselbe Buchfuehrung wie `migrate()`: die Tabelle gehoert nicht zur Kette, sondern
// haelt fest, welche Version schon lief. Ohne sie faehrt die App beim ersten Start die
// ganze Kette erneut ueber den fertigen Spielstand.
db.run("CREATE TABLE IF NOT EXISTS _migration (version INTEGER PRIMARY KEY)");
for (const m of MIGRATIONS) {
  for (const sql of m.sql) {
    try {
      db.run(sql);
    } catch (fehler) {
      console.error(`Migration v${m.version} scheiterte: ${fehler.message}`);
      process.exit(1);
    }
  }
  db.run("INSERT INTO _migration (version) VALUES (?)", [m.version]);
}

seedEinspielen(db);

const verzeichnis = dirname(ziel);
if (!existsSync(verzeichnis)) mkdirSync(verzeichnis, { recursive: true });
writeFileSync(ziel, Buffer.from(db.export()));

const zaehle = (tabelle) => db.exec(`SELECT COUNT(*) FROM ${tabelle}`)[0].values[0][0];
console.log(`Spielstand geschrieben: ${ziel}`);
console.log(
  `  Konten ${zaehle("zahlungskonto")} · Kategorien ${zaehle("kategorie")} · ` +
    `Budgets ${zaehle("budget")} · Buchungen ${zaehle("ist_buchung")} · ` +
    `Vertraege ${zaehle("vertrag")} · Inventar ${zaehle("inventargegenstand")} · ` +
    `Posteingang ${zaehle("umsatz_roh")} · Depotwerte ${zaehle("depotwert")}`,
);
