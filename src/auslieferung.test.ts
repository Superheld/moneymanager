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

  it("baut die drei Plattformen NACHEINANDER", () => {
    // `latest.json` ist die Datei, die der Updater fragt, und sie trägt alle Plattformen
    // zusammen. tauri-action baut sie als READ-MODIFY-WRITE: es lädt die vorhandene Datei
    // vom Release, übernimmt ihre `platforms` und schreibt die eigene dazu (nachgesehen
    // in `src/upload-version-json.ts` beim gepinnten SHA). Zwei Jobs, die gleichzeitig
    // lesen, sehen denselben Stand — und der zweite überschreibt den Eintrag des ersten.
    //
    // Der Fehlschlag wäre STILL: die verlorene Plattform bekäme vom Updater „nichts
    // Neues" statt eines Fehlers.
    expect(WORKFLOW, "Die Plattformen bauen parallel — latest.json verliert dabei Einträge").toContain(
      "max-parallel: 1",
    );
  });

  it("verlangt das Updater-Manifest ausdrücklich, und unter dem heutigen Namen", () => {
    // Ohne `latest.json` fragt jede installierte App ins Leere und bekommt „nichts
    // Neues" — der Fehlschlag, den man nie sieht, weil er wie Ruhe aussieht.
    //
    // Der Schalter hiess bis tauri-action v0 `includeUpdaterJson` und heisst seit
    // v1.0.0 `uploadUpdaterJson`. Der alte Name fällt von selbst nicht auf: GitHub
    // übergeht einen unbekannten Input wortlos, und der Vorgabewert des neuen ist
    // `true`. Es liefe also weiter — aus dem falschen Grund, bis jemand die Vorgabe
    // ändert. Deshalb steht hier beides: dass der Schalter da ist, und dass es der
    // heutige ist.
    expect(WORKFLOW, "Kein Updater-Manifest im Release").toContain("uploadUpdaterJson: true");
    expect(
      /^\s*includeUpdaterJson:/m.test(WORKFLOW),
      "`includeUpdaterJson` ist der Name von tauri-action v0 und wird heute übergangen.",
    ).toBe(false);
  });

  it("lässt den Textschritt überall in bash laufen", () => {
    // Ohne `shell: bash` nimmt GitHub auf Windows PowerShell, und das Skript stirbt an
    // der ersten Zeile. Ein Schritt, der auf zwei von drei Läufern funktioniert, ist
    // schlimmer als einer, der nirgends läuft: er fällt erst im Release auf.
    expect(WORKFLOW, "Der Textschritt läuft auf Windows in PowerShell").toContain("shell: bash");
  });

  it("baut für Linux nur das AppImage", () => {
    // Ein `.deb` kann sich nicht selbst austauschen — der Updater könnte es nie ersetzen.
    // Es läge im Release und sähe aus wie ein Weg, der keiner ist.
    expect(WORKFLOW).toContain("ziele: appimage");
    expect(
      /ziele:.*\bdeb\b/.test(WORKFLOW),
      "Ein .deb im Release: der Updater kann es nie ersetzen, es sieht aber aus wie ein Weg.",
    ).toBe(false);
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
    // Beide Zweige müssen dastehen, damit der Text den Signierungsstand SAGT statt ihn zu
    // behaupten — und damit der unsignierte von selbst verschwindet, sobald das Zertifikat
    // da ist. Bliebe er stehen, behauptete er dann seinerseits etwas Falsches.
    expect(WORKFLOW, "Der signierte Zweig fehlt").toContain("Signiert und notarisiert.");
    expect(WORKFLOW, "Der unsignierte Zweig nennt den Zustand nicht").toContain(
      "Nicht mit einem Apple-Zertifikat signiert",
    );
  });

  it("erklärt niemandem, wie man Gatekeeper aushebelt", () => {
    // Bis zum 30.08.2026 stand die xattr-Zeile im unsignierten Zweig, und der Grund dafür
    // war gut: ohne sie ist der Fehlschlag unerklärlich. Er wiegt trotzdem weniger als
    // das, was eine öffentliche Seite einübt. „Quarantäne-Merkmal abräumen, wenn eine App
    // als beschädigt gemeldet wird" ist als GEWOHNHEIT der Griff, mit dem man sich das
    // nächste Mal etwas anderes einfängt — und die Anleitung dafür stünde bei uns.
    //
    // Geprüft wird der ganze Workflow und nicht nur der Textschritt: der Weg zurück wäre
    // sonst eine Zeile weiter oben, wo niemand hinsieht.
    expect(WORKFLOW, "Der Workflow erklärt wieder, wie man die Quarantäne abräumt").not.toMatch(
      /xattr\s+-[a-z]*d[a-z]*\s|com\.apple\.quarantine/,
    );
  });
});
