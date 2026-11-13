// Jedes `var(--…)` zeigt auf ein Token, das es gibt.
//
// Bis 2026-11-10 benutzten fünf Stellen Tokens, die nie definiert waren (`--accent-soft`,
// `--danger`, `--sh-2`, `--bg`, `--font-mono`, `--radius-2`). CSS meldet so etwas nicht:
// es nimmt still den Rückfallwert hinter dem Komma, und der sah richtig aus. Damit gab es
// zwei Rot-Töne für Fehler, eine Zeilenfarbe, die kein Token-Wechsel erreichte, und einen
// Sperrbildschirm in Weiss statt in der Fläche der App. Ein dunkles Schema hätte all diese
// Stellen hell gelassen.
//
// Geprüft wird über `src/` (TSX, TS, CSS): jeder Name in `var(--name` muss irgendwo als
// `--name:` definiert sein — in den Tokens, in `app.css` oder per `style` am Element. Die
// Variablen, die Base UI zur Laufzeit setzt, stehen benannt in der Liste darunter.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");

/** Von Base UI zur Laufzeit gesetzt (Positionierung, Toast) — nicht unsere Tokens. */
const LAUFZEIT = new Set(["anchor-width", "available-height", "available-width", "toast-index", "toast-offset-y", "toast-swipe-movement-x", "toast-swipe-movement-y"]);

function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    if (name === "vendor" || name === "node_modules") continue;
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) raus.push(pfad);
  }
  return raus;
}

describe("CSS-Variablen", () => {
  const inhalte = dateien(SRC).map((p) => ({ p, s: readFileSync(p, "utf8") }));
  const definiert = new Set<string>();
  for (const { s } of inhalte) {
    for (const m of s.matchAll(/--([a-z0-9-]+)\s*:/g)) definiert.add(m[1]);
    // Per style-Objekt gesetzt: { "--kat-ebene": 2 } oder ["--x" as string]
    for (const m of s.matchAll(/["'`]--([a-z0-9-]+)["'`]\s*(?:as [^:]+)?:/g)) definiert.add(m[1]);
  }

  it("zeigen nur auf Tokens, die es gibt", () => {
    const fehlend: string[] = [];
    for (const { p, s } of inhalte) {
      for (const m of s.matchAll(/var\(--([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-]|\$)/g)) {
        const name = m[1];
        if (!definiert.has(name) && !LAUFZEIT.has(name)) fehlend.push(`${relative(SRC, p)}: --${name}`);
      }
    }
    expect([...new Set(fehlend)]).toEqual([]);
  });

  it("erkennt einen Verweis und lässt ein Template in Ruhe", () => {
    const muster = /var\(--([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-]|\$)/g;
    expect([..."color: var(--gibts-nicht);".matchAll(muster)].map((m) => m[1])).toEqual(["gibts-nicht"]);
    expect([..."gap: `var(--sp-${a})`".matchAll(muster)]).toEqual([]);
  });
});
