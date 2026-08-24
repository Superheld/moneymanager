// Der Wächter über die Auslieferungs-Konfiguration.
//
// `tauri.conf.json` entscheidet, wogegen eine ausgelieferte App ihre Updates prüft und
// welchen Schlüssel sie dabei erwartet. Das sind zwei Angaben, die niemand beim Arbeiten
// ansieht — und beide haben eine Fassung, die beim Probelauf gebraucht wird und in einem
// Release nichts zu suchen hat.
//
// Der Probelauf läuft über `tauri.updater-probe.conf.json`, eine Overlay-Datei, die per
// `--config` dazugemischt wird. Dieser Test hält die Grenze zwischen beiden.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KONFIG = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "src-tauri", "tauri.conf.json"), "utf8"),
);

const updater = KONFIG.plugins?.updater;

describe("Auslieferungs-Konfiguration", () => {
  it("kennt einen öffentlichen Schlüssel", () => {
    // Ohne ihn nimmt die App jedes Paket an, das ihr jemand unterschiebt. Der private
    // Gegenpart liegt ausserhalb des Repos.
    expect(typeof updater?.pubkey).toBe("string");
    expect(updater.pubkey.length).toBeGreaterThan(40);
  });

  it("prüft ausschliesslich über https", () => {
    // Tauri weist einen `http`-Endpunkt nicht etwa beim Abruf ab, sondern beim START:
    // die App PANICT und kommt gar nicht hoch. Ein solcher Endpunkt in der echten
    // Konfiguration wäre also kein schleichender Mangel, sondern eine App, die niemand
    // mehr öffnen kann.
    expect(Array.isArray(updater?.endpoints)).toBe(true);
    expect(updater.endpoints.length).toBeGreaterThan(0);
    for (const url of updater.endpoints) {
      expect(String(url).startsWith("https://"), url).toBe(true);
    }
  });

  it("trägt den Probe-Notausgang NICHT", () => {
    // `dangerousInsecureTransportProtocol` hebt genau die Prüfung oben auf. Er gehört in
    // die Overlay-Datei des Probelaufs und NUR dorthin — in der echten Konfiguration
    // machte er den Updater zu einer offenen Tür für jeden, der den Verkehr umbiegen kann.
    // Sein Name ist eine Warnung, und dieser Test ist die zweite.
    expect(updater).not.toHaveProperty("dangerousInsecureTransportProtocol");
  });

  it("baut die Updater-Artefakte mit", () => {
    // Ohne dieses Flag entsteht kein `.app.tar.gz` — und ein Release ohne Archiv ist
    // eines, das keine installierte App einspielen kann.
    expect(KONFIG.bundle?.createUpdaterArtifacts).toBe(true);
  });
});
