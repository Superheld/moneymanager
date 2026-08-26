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

describe("Der Release-Workflow und die Apple-Signierung", () => {
  const WORKFLOW = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  it("reicht alle sechs Apple-Secrets durch", () => {
    // Sie stehen dort, damit die Signierung anspringt, sobald sie hinterlegt sind. Ohne
    // sie baut `tauri-action` klaglos ein UNSIGNIERTES Bundle — es bricht nicht ab, und
    // gemerkt wird es erst, wenn jemand die App herunterlädt.
    //
    // Signierung ALLEIN genügt nicht: Gatekeeper verlangt bei einem geladenen Bundle auch
    // die Notarisierung, und die braucht die drei unteren.
    for (const secret of [
      "APPLE_CERTIFICATE",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_SIGNING_IDENTITY",
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_TEAM_ID",
    ]) {
      expect(WORKFLOW, `${secret} fehlt im Workflow`).toContain(`secrets.${secret}`);
    }
  });

  it("bricht ab, wenn die Signierungs-Secrets fehlen", () => {
    // **Der Kern der Sache, und er hängt NICHT am Zertifikat.** Ohne diesen Schritt baut
    // `tauri-action` klaglos ein unsigniertes Bundle und hängt es an ein öffentliches
    // Release. Ein Zertifikat kann man nachreichen; ein Release, das draussen ist, nicht
    // mehr.
    //
    // Geprüft wird auf `exit 1` im Workflow — ein Schritt, der nur warnt, ist keiner.
    expect(WORKFLOW).toContain("Ohne Apple-Signierung kein oeffentliches Release");
    expect(WORKFLOW, "Der Türsteher warnt nur, statt abzubrechen").toContain("exit 1");
  });

  it("führt im Release-Text KEINE Anleitung zum Abschalten von Gatekeeper", () => {
    // Sie war notwendig, solange unsigniert ausgeliefert wurde — und genau das kann seit
    // dem Türsteher nicht mehr passieren. Käme sie zurück, hiesse das: es wird wieder
    // unsigniert ausgeliefert, und Fremden wird beigebracht, bei einer Finanz-App eine
    // Sicherheitsprüfung wegzuklicken.
    //
    // Im LOKALEN Installationsskript ist dieselbe Zeile in Ordnung: wer auf der eigenen
    // Maschine baut und dort installiert, weiss, was er tut.
    expect(
      WORKFLOW.includes("xattr -dr com.apple.quarantine"),
      "Die xattr-Anleitung ist im Release-Text zurück — dann wird wieder unsigniert " +
        "ausgeliefert, und der Türsteher oben ist umgangen worden.",
    ).toBe(false);
  });
});
