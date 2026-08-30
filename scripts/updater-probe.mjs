#!/usr/bin/env node
// Der Endpunkt für die Update-Probe — auf dem eigenen Rechner, ohne Veröffentlichung.
//
//   node scripts/updater-probe.mjs
//
// WOZU ES DAS GIBT. Der Update-Weg lässt sich nicht halb prüfen: entweder eine installierte
// App findet ein signiertes Paket, lädt es, ersetzt sich und startet neu — oder man weiss
// nichts. Ein Endpunkt muss es dafür geben. Diesen hier gibt es nur, solange das Skript
// läuft, und er liegt auf 127.0.0.1.
//
// Das Skript BAUT NICHT. Es nimmt, was im Bundle-Verzeichnis liegt, schreibt das Manifest
// dazu und stellt beides bereit. Was vorher zu tun ist, sagt es, wenn etwas fehlt — und der
// ganze Ablauf steht in CLAUDE.md unter „Den Update-Weg durchspielen".

import { createReadStream, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const BUNDLE = join(WURZEL, "src-tauri/target/release/bundle/macos");
const ARCHIV = "Moneymanager.app.tar.gz";
const PORT = 8787;

// Welche Version angeboten wird. Ohne Argument die aus `package.json` — beim Probelauf gibt
// man die hoehere von Hand mit, weil der Build sie ueber `--config` bekommen hat und
// `package.json` deshalb unveraendert bleibt. Das ist Absicht: eine Probe soll die
// Versionsangabe des Projekts nicht anfassen.
const version =
  process.argv[2] ?? JSON.parse(readFileSync(join(WURZEL, "package.json"), "utf8")).version;

const archivPfad = join(BUNDLE, ARCHIV);
const sigPfad = `${archivPfad}.sig`;

if (!existsSync(archivPfad)) {
  console.error(
    `Kein Updater-Archiv unter ${archivPfad}.\n\n` +
      "Erst die NEUE Fassung bauen — mit Signaturschluessel, sonst entsteht keine .sig:\n" +
      "  export TAURI_SIGNING_PRIVATE_KEY=~/.moneymanager-schluessel/updater.key\n" +
      "  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=\n" +
      "  npm run tauri build",
  );
  process.exit(2);
}

if (!existsSync(sigPfad)) {
  console.error(
    `Archiv da, aber keine Signatur (${ARCHIV}.sig).\n\n` +
      "Der Build lief ohne Schluessel. Ein unsigniertes Paket weist der Updater ab — und das\n" +
      "ist der Sinn der Sache, nicht ein Hindernis. Nochmal bauen, diesmal mit gesetztem\n" +
      "TAURI_SIGNING_PRIVATE_KEY.",
  );
  process.exit(2);
}

// Das Manifest. Der Plattformschluessel muss exakt passen (`darwin-aarch64` auf
// Apple Silicon) — steht dort etwas anderes, meldet der Updater „nichts Neues" statt eines
// Fehlers, und man sucht lange an der falschen Stelle.
const manifest = {
  version,
  notes: "Probelauf des Update-Wegs — kein echtes Release.",
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature: readFileSync(sigPfad, "utf8").trim(),
      url: `http://127.0.0.1:${PORT}/${ARCHIV}`,
    },
  },
};
writeFileSync(join(BUNDLE, "latest.json"), JSON.stringify(manifest, null, 2));

const server = createServer((anfrage, antwort) => {
  const name = decodeURIComponent((anfrage.url ?? "/").split("?")[0].replace(/^\//, ""));
  // Nur die zwei Dateien, um die es geht. Ein Server, der ein ganzes Verzeichnis
  // ausliefert, ist hier nicht noetig — und was nicht noetig ist, wird auch nicht angeboten.
  if (name !== "latest.json" && name !== ARCHIV) {
    antwort.writeHead(404).end("nicht da");
    return;
  }
  const pfad = join(BUNDLE, name);
  antwort.writeHead(200, {
    "content-type": name.endsWith(".json") ? "application/json" : "application/gzip",
    "content-length": statSync(pfad).size,
  });
  createReadStream(pfad).pipe(antwort);
  console.log(`  → ausgeliefert: ${name}`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Update-Probe laeuft auf http://127.0.0.1:${PORT}`);
  console.log(`  angebotene Version: ${version}`);
  console.log("");
  console.log("Jetzt die INSTALLIERTE App starten (nicht `tauri dev`).");
  console.log("Sie muss mit dem Probe-Endpunkt gebaut worden sein:");
  console.log("  npm run tauri build -- --config src-tauri/tauri.updater-probe.conf.json");
  console.log("");
  console.log("Beenden mit Strg-C.");
});
