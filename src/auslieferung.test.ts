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

  it("hält die xattr-Anleitung und die Signierung zusammen", () => {
    // **Die beiden gehören gekoppelt, und zwar in dieser Richtung:** solange unsigniert
    // ausgeliefert wird, MUSS die Anleitung dastehen — ohne sie kommt niemand in die App.
    // Sobald signiert wird, muss sie WEG: dann ist sie falsch und bringt Leuten bei, bei
    // einer Finanz-App eine Sicherheitswarnung wegzuklicken.
    //
    // Welcher der beiden Zustände gilt, kann dieser Test nicht wissen — ob Secrets
    // hinterlegt sind, steht nicht im Repo. Was er kann: dafür sorgen, dass die Kopplung
    // beim Umschalten nicht übersehen wird. Wer die xattr-Zeile entfernt, muss diesen
    // Test anfassen und liest dabei, worauf er zu achten hat.
    const hatAnleitung = WORKFLOW.includes("xattr -dr com.apple.quarantine");
    expect(
      hatAnleitung,
      "Die xattr-Anleitung ist weg — dann muss die Signierung stehen und dieser Test " +
        "auf das Gegenteil umgestellt werden.",
    ).toBe(true);
  });
});
