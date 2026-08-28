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

  it("baut den Release-Text aus dem Signierungsstand, statt ihn zu behaupten", () => {
    // **Der Kern der Sache, und er hat sich am 28.08.2026 verschoben.**
    //
    // Vorher stand hier ein Türsteher, der den Lauf abbrach, wenn die Apple-Secrets
    // fehlten. Seine Begründung nannte den lokalen Weg als die Tür, die offen bleibt —
    // und die ist zu: gebaut und ausgeliefert wird ausschliesslich über GitHub, das
    // Update kommt über den Updater. Ein Wächter, der daraufhin ALLES blockiert,
    // blockiert nicht mehr das Riskante, sondern das Einzige, und wird abgeschaltet.
    //
    // Was bleibt und wichtiger ist als das Blockieren: der Release-Text darf nicht
    // behaupten, was nicht stimmt. Ein unsigniertes Bundle unter der Zeile „Signiert und
    // notarisiert" wäre der eigentliche Schaden — schlimmer als ein unsigniertes Bundle,
    // dem man ansieht, dass es eines ist.
    //
    // Geprüft wird deshalb, dass der Text BERECHNET wird. Ein Literal an dieser Stelle
    // ist genau in dem Fall falsch, in dem es darauf ankommt.
    expect(WORKFLOW, "Der Release-Text kommt nicht aus dem Signierungs-Schritt").toContain(
      "releaseBody: ${{ steps.text.outputs.body }}",
    );
    expect(WORKFLOW, "Der Signierungsstand wird nicht aus den Secrets ermittelt").toMatch(
      /signiert=ja[\s\S]*signiert=nein/,
    );
  });

  it("setzt die Apple-Variablen nur, wenn es die Secrets wirklich gibt", () => {
    // **Gemessen, und es hat einen ganzen Release-Lauf gekostet.** Ein fehlendes Secret
    // wird in einem `env:`-Block zum LEEREN STRING, und GitHub setzt die Variable
    // trotzdem. Tauri prüft „ist gesetzt", nicht „hat Inhalt", versucht ein
    // `security import` mit nichts und bricht beim Bündeln ab — nach sechseinhalb
    // Minuten Build:
    //
    //   security: SecKeychainItemImport: One or more parameters ... not valid.
    //   failed codesign application: failed to import keychain certificate
    //
    // Zwei Tage lang unsichtbar, weil der Türsteher davor abbrach: die eine Änderung hat
    // den Fehler der anderen verdeckt. Deshalb entstehen die Variablen jetzt über
    // GITHUB_ENV und nur im signierten Zweig — dort kann man einen Schlüssel WEGLASSEN,
    // im env-Block nicht.
    for (const name of [
      "APPLE_CERTIFICATE",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_SIGNING_IDENTITY",
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_TEAM_ID",
    ]) {
      expect(
        WORKFLOW.includes(`${name}: \${{ secrets.${name} }}`),
        `${name} wird wieder direkt aus dem Secret gesetzt — bei fehlendem Secret ist ` +
          "das ein leerer Wert, und das Bündeln bricht beim Signieren ab.",
      ).toBe(false);
    }
    expect(WORKFLOW, "Die Variablen entstehen nicht über GITHUB_ENV").toContain('>> "$GITHUB_ENV"');
  });

  it("führt beide Fassungen des Release-Texts — die signierte und die ehrliche", () => {
    // Der unsignierte Zweig MUSS die xattr-Anleitung tragen. Sie wegzulassen macht das
    // Bundle nicht sicherer; es macht nur den Fehlschlag unerklärlich — macOS meldet
    // „beschädigt", und wer die App nicht selbst gebaut hat, hat keine Handhabe.
    //
    // Der signierte Zweig muss weiterhin dastehen, damit die Anleitung von selbst
    // verschwindet, sobald das Zertifikat da ist. Sonst bliebe sie stehen und behauptete
    // dann ihrerseits etwas Falsches.
    expect(WORKFLOW, "Der signierte Zweig fehlt").toContain("Signiert und notarisiert.");
    expect(WORKFLOW, "Der unsignierte Zweig nennt den Weg nicht").toContain(
      "xattr -dr com.apple.quarantine",
    );
  });
});
