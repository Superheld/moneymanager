// Kein Paket fuehrt beim Installieren unbemerkt Code aus.
//
// **Warum das der wichtigste npm-Waechter ist.** Ein `postinstall` laeuft mit den Rechten
// dessen, der `npm ci` tippt — vor jedem Test, vor jedem Build, auf jeder Maschine und in
// jeder CI. Das ist der Weg, den uebernommene npm-Pakete tatsaechlich nehmen; eine
// Schwachstelle IM Code muss erst erreicht werden, ein Install-Skript laeuft von selbst.
//
// **Warum keine `ignore-scripts=true`.** Gemessen, nicht vermutet: damit bricht der Build.
// `lib-fints` kommt aus einem Git-Repository und wird beim Installieren ueber sein
// `prepare`-Skript gebaut; ohne das fehlt sein `dist/`, und Vite bricht mit „failed to
// resolve import" ab. Ein globales Verbot nimmt also genau das Skript mit, das gebraucht
// wird — und es waere reizvoll, es dann wieder abzuschalten.
//
// Stattdessen eine ALLOWLIST: `allowScripts` in package.json, gepinnt auf die Version.
// npm meldet jedes Paket, das dort nicht steht; dieses Skript macht daraus einen Abbruch.
// Ein neues Paket mit Install-Skript kommt damit nicht mehr still herein — jemand muss es
// ausdruecklich freigeben, und dieser Moment ist die Gelegenheit, hinzusehen.
//
// Freigeben:  npm install-scripts approve <paket>
// Ansehen:    npm install-scripts ls

import { execFileSync } from "node:child_process";

let roh;
try {
  roh = execFileSync("npm", ["install-scripts", "ls", "--json"], { encoding: "utf8" });
} catch (fehler) {
  // Ein Waechter, der nicht arbeiten kann, bricht ab statt zu beruhigen — dieselbe Regel
  // wie beim Wert-Abgleich der Privatsphaere.
  console.error("Die Freigabeliste liess sich nicht lesen. Es wurde NICHTS geprueft.");
  console.error(String(fehler.message ?? fehler).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
}

const offen = JSON.parse(roh).allowScripts ?? [];
if (offen.length === 0) {
  console.log("Install-Skripte: alle freigegeben.");
  process.exit(0);
}

console.error("ABGEBROCHEN — Pakete mit Install-Skript ohne Freigabe:\n");
for (const paket of offen) {
  const schluessel = (paket.changes ?? []).map((c) => c.key).join(", ");
  console.error(`  ${paket.name}${schluessel ? `  (${schluessel})` : ""}`);
}
console.error("\nAnsehen, was das Skript tut, DANN freigeben:");
console.error("  npm install-scripts ls");
console.error("  npm install-scripts approve <paket>");
process.exit(1);
