// Erzeugt aus der DK-Bankenliste die schlanke Nachschlagetabelle, die der Bankabruf
// braucht: BLZ → Institut, Ort, FinTS-PIN/TAN-Endpunkt.
//
// WARUM ALS SCHRITT UND NICHT ALS DATEI IM REPO: Die Liste wird von der Deutschen
// Kreditwirtschaft an registrierte Hersteller verteilt und ist nicht öffentlich. Sie hat
// in einem öffentlichen Repo nichts verloren — die Quelle nicht und das Erzeugnis auch
// nicht. Beides ist in .gitignore. Wer die App aus dem Quelltext baut, ohne die Liste zu
// haben, bekommt schlicht keine Auswahl und trägt die FinTS-Adresse von Hand ein.
//
//   node scripts/bankenliste-erzeugen.mjs [pfad/zur/liste.csv]
//
// Ohne Argument wird die erste CSV im lokalen Doku-Ordner genommen.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const STANDARD_ORDNER = join(wurzel, "Moneymanager", "xx-import-quellen");
const ZIEL = join(wurzel, "public", "bankenliste.json");
const ZIEL_CAPABILITY = join(wurzel, "src-tauri", "capabilities", "fints-banken.json");

function quelleFinden() {
  const arg = process.argv[2];
  if (arg) return arg;
  if (!existsSync(STANDARD_ORDNER)) return null;
  const csv = readdirSync(STANDARD_ORDNER).find((d) => d.toLowerCase().endsWith(".csv"));
  return csv ? join(STANDARD_ORDNER, csv) : null;
}

const quelle = quelleFinden();
if (!quelle) {
  console.error("Keine Bankenliste gefunden. Pfad zur CSV als Argument angeben.");
  process.exit(1);
}

// Die Datei kommt in Latin-1 mit CRLF und Semikolon als Trenner. Eine Zeile je Institut
// UND Ort — dieselbe BLZ steht mehrfach drin.
const text = new TextDecoder("latin1").decode(readFileSync(quelle));
const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
const kopf = zeilen[0].split(";");

const spalte = (name) => {
  const i = kopf.findIndex((s) => s.trim().toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`Spalte „${name}" fehlt in ${quelle}`);
  return i;
};

const iBlz = spalte("BLZ");
const iName = spalte("Institut");
const iOrt = spalte("Ort");
const iUrl = spalte("PIN/TAN-Zugang URL");
const iVersion = spalte("Version");

const proBlz = new Map();
let ohneZugang = 0;

for (const zeile of zeilen.slice(1)) {
  const f = zeile.split(";");
  const blz = (f[iBlz] ?? "").trim();
  const url = (f[iUrl] ?? "").trim();
  if (!blz) continue;
  // Leere Spalte = das Institut bietet keinen FinTS-PIN/TAN-Zugang an. Solche Zeilen
  // gehören nicht in eine Auswahl, die eine Adresse liefern soll.
  if (!url) {
    ohneZugang++;
    continue;
  }
  if (proBlz.has(blz)) continue;
  proBlz.set(blz, {
    blz,
    name: (f[iName] ?? "").trim(),
    ort: (f[iOrt] ?? "").trim(),
    url,
    version: (f[iVersion] ?? "").trim(),
  });
}

const banken = [...proBlz.values()].sort((a, b) => a.blz.localeCompare(b.blz));
writeFileSync(ZIEL, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), banken }));

// Zweites Erzeugnis: die Tauri-Capability. Der HTTP-Transport darf nur Hosts erreichen,
// die in dieser Liste als FinTS-Endpunkt stehen — 1735 Institute, aber nur ~85 Hosts,
// weil sich die Rechenzentren die Endpunkte teilen. Eine pauschale Freigabe („alles
// https") wäre die bequeme Variante und genau die, die man später bereut: die Webview
// könnte dann jede beliebige Adresse ansprechen.
const hosts = [...new Set(banken.map((b) => new URL(b.url).host))].sort();
writeFileSync(
  ZIEL_CAPABILITY,
  JSON.stringify(
    {
      $schema: "../gen/schemas/desktop-schema.json",
      identifier: "fints-banken",
      description:
        "HTTP-Transport für den FinTS-Abruf. Erzeugt aus der DK-Bankenliste " +
        "(scripts/bankenliste-erzeugen.mjs) — nicht von Hand pflegen.",
      windows: ["main"],
      permissions: [{ identifier: "http:default", allow: hosts.map((h) => ({ url: `https://${h}/*` })) }],
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `${banken.length} Institute mit PIN/TAN-Zugang aus ${zeilen.length - 1} Zeilen ` +
    `(${ohneZugang} ohne Zugang übersprungen) → ${ZIEL}`,
);
console.log(`${hosts.length} verschiedene Endpunkt-Hosts → ${ZIEL_CAPABILITY}`);
