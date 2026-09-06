// Der Wächter über die Verweise in der Doku.
//
// Das Repo ist öffentlich, ein Teil der Doku aber bewusst nicht: die DDD-Unterlagen und
// das Design-System liegen ausserhalb. Genau daran ist schon zweimal ein Verweis
// zerbrochen — eine versionierte Datei zeigte auf eine, die nur lokal existiert. Für
// jemanden mit dem Arbeitsplatz stimmt so ein Satz, für einen frischen Klon führt er ins
// Leere, und das fällt niemandem auf, der das Verzeichnis hat.
//
// Deshalb prüft dieser Test ausführbar, was sonst nur guter Wille wäre: jeder Pfad, den
// eine VERSIONIERTE Markdown-Datei nennt, muss selbst versioniert sein. Nicht „existiert
// im Arbeitsbaum" — das ist der Fehler, der uns getäuscht hat.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
// ZWEI Pfad-Module, und die Trennung ist der Grund, warum dieser Waechter auf Windows
// ueberhaupt laeuft. Alles, was hier verglichen wird, sind REPO-Pfade: `git ls-files`
// liefert sie mit Schraegstrich, ein Markdown-Link schreibt sie mit Schraegstrich. Wer
// sie durch das plattformeigene `node:path` schickt, bekommt auf Windows Backslashes
// zurueck — und vergleicht danach `src\\adapters\\x.ts` mit `src/adapters/x.ts`. Der
// Waechter meldet dann jeden Verweis als tot, obwohl die Datei danebensteht; genau daran
// ist der Windows-Job dreier Releases gestorben, bevor je ein Compiler lief.
//
// `posix` fuer die Repo-Pfade, das native Modul nur dort, wo wirklich auf die Platte
// gegriffen wird.
import { resolve, join as imDateisystem } from "node:path";
import { dirname, join, normalize } from "node:path/posix";

const WURZEL = resolve(__dirname, "..");

/**
 * Pfade, die eine versionierte Datei nennen DARF, obwohl sie nicht im Repo liegen.
 *
 * Jeder Eintrag ist eine bewusste Ausnahme und braucht einen Grund. Der Test darunter
 * hält die Liste ehrlich: ein Eintrag, der inzwischen versioniert ist, lässt ihn
 * fehlschlagen — so kann sie nicht mit erledigten Fällen verrotten.
 */
const AUSSERHALB: readonly string[] = [
  // Maschinenspezifische Rezepte (Pfade zur echten DB, Cache-Verzeichnisse). Gehören
  // nicht ins öffentliche Repo und werden in CLAUDE.md ausdrücklich als lokal benannt.
  // `CLAUDE.local.md` ist der von Claude Code vorgesehene Ort für lokale Anweisungen.
  "CLAUDE.local.md",
  // Dateien der Bibliothek `lib-fints`, nicht unsere. Der Skill unter
  // `.claude/skills/lib-fints/` belegt seine Aussagen an deren Quelltext — das ist der
  // Sinn eines solchen Skills, und ein Verweis darauf ist kein Fehler. Sie liegen in
  // `node_modules` bzw. im Repo der Bibliothek.
  "node_modules/lib-fints/README.md",
  "codes.ts",
  "interactions/customerInteraction.ts",
];

/** Alle vom Repo verwalteten Dateien. Ohne git ist die Prüfung wertlos — dann soll sie brechen. */
function versionierteDateien(): string[] {
  const roh = execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" });
  const dateien = roh.split("\0").filter(Boolean);
  if (dateien.length === 0) throw new Error("git ls-files lieferte nichts — Wächter kann nicht prüfen");
  return dateien;
}

/** `./x`, `../x` und `x/./y` zu einem vergleichbaren Pfad glätten. */
function glaetten(pfad: string): string {
  return normalize(pfad).replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
}

/**
 * Pfadartige Nennungen aus einer Markdown-Datei.
 *
 * Zwei Formen: Markdown-Links `[text](ziel)` — relativ zur Datei aufgelöst — und
 * Pfade in Backticks mit erkennbarer Dateiendung. Alles andere (Prosa, Befehle,
 * Platzhalter wie `*Screen.tsx`) bleibt bewusst draussen: ein Wächter, der bei jedem
 * zweiten Satz falschen Alarm schlägt, wird abgeschaltet.
 */
function genanntePfade(datei: string, inhalt: string): string[] {
  const raus: string[] = [];

  for (const treffer of inhalt.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const ziel = treffer[1];
    if (/^(https?:|mailto:|#)/.test(ziel)) continue;
    raus.push(glaetten(join(dirname(datei), ziel.split("#")[0])));
  }

  for (const treffer of inhalt.matchAll(/`([A-Za-z0-9_.\-/]+\.(?:tsx?|md|json|ya?ml|toml))`/g)) {
    const kandidat = treffer[1];
    // Blosse Dateiendungen (`.d.ts`, `.tsx`) sind keine Pfade. Ein echter Pfad, der mit
    // einem Punkt beginnt, trägt ein Verzeichnis (`.github/workflows/ci.yml`).
    if (kandidat.startsWith(".") && !kandidat.includes("/")) continue;
    raus.push(glaetten(kandidat));
  }

  return raus;
}

/**
 * Dateien, deren Verweise NICHT geprüft werden.
 *
 * Nur das Changelog: es erzählt, was war, und muss dabei Dateien nennen dürfen, die es
 * heute nicht mehr gibt („ARCHITEKTUR.md ist darin aufgegangen", „src/test/ heißt jetzt
 * …"). Ein Verweis, der auf einen vergangenen Stand zeigt, ist dort kein Fehler, sondern
 * der Zweck. Für jede andere Markdown-Datei gilt die Prüfung.
 */
const ERZAEHLENDE_DATEIEN: readonly string[] = ["CHANGELOG.md"];

describe("Doku-Verweise", () => {
  const versioniert = versionierteDateien();
  const markdown = versioniert
    .filter((d) => d.endsWith(".md"))
    .filter((d) => !ERZAEHLENDE_DATEIEN.includes(d));

  it("findet überhaupt versionierte Markdown-Dateien", () => {
    expect(markdown.length).toBeGreaterThan(0);
  });

  it.each(markdown)("%s nennt nur Pfade, die im Repo liegen", (datei) => {
    const inhalt = readFileSync(imDateisystem(WURZEL, datei), "utf8");
    const genannt = genanntePfade(datei, inhalt);

    // Die Regression, die dieser Waechter selbst hatte, mit ihrem eigenen Namen. Auf
    // dieser Maschine kann sie nicht anschlagen — `posix` erzeugt nie einen Backslash.
    // Auf Windows schon, und dort ist der Unterschied gross: ohne diese Zeile meldet der
    // Test unten JEDEN Verweis als tot, und man sucht den Fehler in der Doku statt im
    // Pfad-Modul.
    expect(
      genannt.filter((p) => p.includes("\\")),
      `${datei}: Pfade mit Backslash — hier wurde wieder das plattformeigene node:path benutzt`,
    ).toEqual([]);

    const fehlend = genannt.filter((pfad) => {
      if (AUSSERHALB.includes(pfad)) return false;
      // Suffix-Vergleich: CLAUDE.md darf `bausteine/CLAUDE.md` kurz nennen, ohne den vollen Pfad
      // zu wiederholen. Der Kandidat muss dabei an einer Verzeichnisgrenze aufsetzen.
      return !versioniert.some((v) => v === pfad || v.endsWith(`/${pfad}`));
    });
    expect(fehlend, `${datei} verweist auf nicht versionierte Pfade`).toEqual([]);
  });

  it("führt in AUSSERHALB nur Pfade, die wirklich nicht im Repo liegen", () => {
    const erledigt = AUSSERHALB.filter((pfad) =>
      versioniert.some((v) => v === pfad || v.endsWith(`/${pfad}`)),
    );
    expect(erledigt, "diese Einträge sind versioniert und gehören aus der Liste").toEqual([]);
  });
});
