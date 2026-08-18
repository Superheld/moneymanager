// Wächter: Die DK-Produktregistrierungsnummer darf in KEINER versionierten Datei stehen.
//
// Sie ist kein Geheimnis — sie geht bei jeder Dialoginitialisierung im Klartext an die
// Bank und steckt in jedem ausgelieferten Binary. Aber sie identifiziert dieses Produkt
// gegenüber allen Banken: wer sie aus einem öffentlichen Quelltext kopiert, handelt unter
// unserem Namen, und Beschwerden oder eine Deregistrierung landen bei uns. Deshalb lebt
// sie in der `.env` (gitignoriert) bzw. beim Release in einem Repository-Secret.
//
// Dieser Test hält das fest, statt sich darauf zu verlassen, dass man daran denkt. Er
// prüft, was `git` tatsächlich verfolgt — nicht, was im Arbeitsverzeichnis liegt.
// Läuft bei jedem `npm test` und damit vor jedem Merge nach develop.
//
// Der Test selbst kennt die Nummer nicht: er liest sie zur Laufzeit aus der `.env`.
// Ohne `.env` (frischer Klon, CI) hat er nichts zu prüfen und ist still zufrieden.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZEL = join(import.meta.dirname, "..", "..", "..");

function produktIdAusEnv(): string | null {
  const env = join(WURZEL, ".env");
  if (!existsSync(env)) return null;
  const treffer = readFileSync(env, "utf8").match(/^VITE_FINTS_PRODUKT_ID=(.+)$/m);
  const wert = treffer?.[1].trim().replace(/^["']|["']$/g, "");
  return wert && wert.length > 0 ? wert : null;
}

function versionierteDateien(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

describe("Produktregistrierungsnummer", () => {
  it("steht in keiner versionierten Datei", () => {
    const id = produktIdAusEnv();
    if (!id) return; // nichts hinterlegt — nichts zu schützen

    const funde = versionierteDateien().filter((datei) => {
      const pfad = join(WURZEL, datei);
      try {
        // Große Binärdateien überspringen: die Nummer ist eine ASCII-Zeichenkette, und
        // ein Icon Byte für Byte zu durchsuchen kostet nur Zeit.
        if (statSync(pfad).size > 2_000_000) return false;
        return readFileSync(pfad, "utf8").includes(id);
      } catch {
        return false; // gelöscht oder nicht lesbar
      }
    });

    expect(funde, `Die Produkt-ID steht in versionierten Dateien: ${funde.join(", ")}`).toEqual([]);
  });

  it("ist gar nicht erst versioniert: die .env bleibt ausgeschlossen", () => {
    const versioniert = versionierteDateien();
    expect(versioniert).not.toContain(".env");
    expect(versioniert).not.toContain(".env.local");
  });
});
