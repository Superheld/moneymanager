// Schriftgrössen kommen aus den Tokens (`styles/tokens/typography.css`), nicht als Zahl.
//
// Bis 2026-11-10 standen rund sechzig Stellen mit Pixelwert da (`12`, `12.5`, `13`,
// `13.5`, `11`, `11.5`) — sechs Stufen, von denen die Tokens vier kannten. Jede Stelle für
// sich war plausibel; zusammen waren es mehr Stufen, als die Oberfläche hat, und eine
// Änderung an einer Stufe erreichte die Hälfte ihrer Verwender nicht. Seitdem gibt es die
// zwei fehlenden (`--fs-tabelle`, `--fs-ui`), und dieser Wächter hält den Stand — dieselbe
// Art wie `farbregel.test.ts`.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const UI = __dirname;

function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (/\.tsx$/.test(name) && !name.endsWith(".test.tsx")) raus.push(pfad);
  }
  return raus;
}

/** `fontSize: 13`, `fontSize: "12.5px"` — eine Zahl statt eines Tokens. */
const ZAHL = /fontSize: *"?\d/;

describe("Schriftgrössen", () => {
  it("stehen in der Oberfläche als Token, nicht als Pixelzahl", () => {
    const funde: string[] = [];
    for (const pfad of dateien(UI)) {
      readFileSync(pfad, "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          if (ZAHL.test(zeile)) funde.push(`${relative(UI, pfad)}:${i + 1}  ${zeile.trim()}`);
        });
    }
    expect(funde).toEqual([]);
  });

  it("findet, wonach er sucht", () => {
    expect(ZAHL.test('style={{ fontSize: 13 }}')).toBe(true);
    expect(ZAHL.test('style={{ fontSize: "12.5px" }}')).toBe(true);
    expect(ZAHL.test('style={{ fontSize: "var(--fs-xs)" }}')).toBe(false);
  });

  it("setzt den kleinen Erklärtext über `.hinweis`, nicht aus muted plus Grösse", () => {
    // Er stand bis 2026-11-10 über hundertmal als `className="muted" style={{ fontSize:
    // "var(--fs-xs)" … }}` da (B4). Die Klasse sagt, was es IST; das Zusammensetzen
    // sagte nur, wie es aussieht.
    const MUSTER = [/className="muted" style=\{\{ fontSize: "var\(--fs-xs\)"/, /fontSize: "var\(--fs-xs\)", color: "var\(--ink-3\)"/];
    const funde: string[] = [];
    for (const pfad of dateien(UI)) {
      readFileSync(pfad, "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          if (MUSTER.some((m) => m.test(zeile))) funde.push(`${relative(UI, pfad)}:${i + 1}  ${zeile.trim()}`);
        });
    }
    expect(funde).toEqual([]);
  });
});
