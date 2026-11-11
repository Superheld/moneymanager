// Die Base-UI-Regel als ausführbare Zusicherung (`ui/CLAUDE.md`, „Bedienteile").
//
// Seit 2026-11-10 steht unter jedem Bedienteil, für das Base UI etwas hat, Base UI —
// gekapselt in einem Baustein. Vorher standen dieselben Teile von Hand da, und jedes Mal
// fehlte dieselbe Hälfte: der Knopf liess sich nicht sperren, der Aufklapper sagte nicht,
// was er öffnet, die Segmentleiste hatte keine Pfeiltasten. Ein Kommentar hält den
// nächsten rohen `<button>` nicht auf; dieser Test schon.
//
// Gesucht wird nach den FORMEN, an denen der Eigenbau zu erkennen ist — nicht nach jedem
// denkbaren Element. Die Ausnahmen sind benannt und begründet; eine neue gehört in die
// Liste UND in `ui/CLAUDE.md`, sonst ist sie keine Entscheidung, sondern ein Rückfall.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const UI = join(__dirname);

function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (/\.tsx$/.test(name) && !name.endsWith(".test.tsx")) raus.push(pfad);
  }
  return raus;
}

/** Die Zeilen mit Code, ohne Kommentare — ein Satz ÜBER `<button>` ist kein `<button>`. */
function codezeilen(pfad: string): { nr: number; text: string }[] {
  return readFileSync(pfad, "utf8")
    .split("\n")
    .map((text, i) => ({ nr: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text));
}

interface Regel {
  readonly name: string;
  readonly muster: RegExp;
  /** Dateien (relativ zu `ui/`), in denen die Form erlaubt ist — mit Grund. */
  readonly erlaubt: Readonly<Record<string, string>>;
}

const REGELN: readonly Regel[] = [
  { name: "roher <button>", muster: /<button[\s>]/, erlaubt: {} },
  { name: "natives Kästchen/Optionsfeld", muster: /type="(checkbox|radio)"/, erlaubt: {} },
  { name: "natives Zahlenfeld", muster: /type="number"/, erlaubt: {} },
  {
    name: "natives <select>",
    muster: /<select[\s>]/,
    erlaubt: {
      "bausteine/Zeilenauswahl.tsx":
        "so gross wie eine Pille in einer Tabellenzeile; eine Liste im Portal wäre für drei Einträge Aufwand ohne Gegenwert",
    },
  },
  { name: "aria-pressed von Hand", muster: /aria-pressed=/, erlaubt: {} },
  {
    name: "aria-expanded von Hand",
    muster: /aria-expanded=/,
    erlaubt: {
      "bausteine/AppShell.tsx":
        "die Schublade ist schmal eine Schublade und breit eine Spalte — EIN Element in drei Formen; Base UI `Drawer` hiesse, die Navigation je Breite in zwei Renderwege zu teilen",
    },
  },
  { name: "role=\"tab\" von Hand", muster: /role="tab(list|panel)?"/, erlaubt: {} },
  {
    name: "role=\"button\" von Hand",
    muster: /role=\{?"button"/,
    erlaubt: {
      "bausteine/Aufklapptabelle.tsx": "die Zeile ist ein <tr> und öffnet eine Buchung; ein Knopf kann sie nicht sein",
    },
  },
];

describe("Bedienteile stehen auf Base UI", () => {
  const alle = dateien(UI);

  for (const regel of REGELN) {
    it(`kein ${regel.name} ausserhalb der benannten Ausnahmen`, () => {
      const funde: string[] = [];
      for (const pfad of alle) {
        const rel = relative(UI, pfad);
        if (regel.erlaubt[rel]) continue;
        for (const { nr, text } of codezeilen(pfad)) {
          if (regel.muster.test(text)) funde.push(`${rel}:${nr}  ${text.trim()}`);
        }
      }
      expect(funde).toEqual([]);
    });
  }

  it("findet die Formen, nach denen er sucht", () => {
    // Ein Wächter, den man nie hat anschlagen sehen, ist ungeprüft.
    const probe = '      <button type="button" aria-pressed={an} role="tab">';
    expect(REGELN.filter((r) => r.muster.test(probe)).map((r) => r.name)).toEqual([
      "roher <button>",
      "aria-pressed von Hand",
      "role=\"tab\" von Hand",
    ]);
  });
});
