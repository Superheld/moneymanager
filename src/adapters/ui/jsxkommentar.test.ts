// Ein `//`-Kommentar zwischen zwei JSX-Tags ist kein Kommentar, sondern TEXT.
//
// Am 2026-11-10 ist genau das passiert: beim Umbau auf Base UI `Collapsible` wurde aus
// `{offen && ( // Begründung … <Aufklappflaeche> )}` ein `<Collapsible.Panel> // Begründung
// … <Aufklappflaeche>`. Vorher stand der Kommentar in einem JS-Ausdruck, danach direkt im
// Element — und jede aufgeklappte Zeile der Monatskarten zeigte fünf Zeilen Begründung
// statt ihrer Posten. Der Compiler meldet das nicht (Text ist erlaubtes JSX), die Tests
// auch nicht (sie suchen nach Daten, und die standen weiterhin darunter).
//
// Die Regel hier ist eine Zeilenregel und kein Parser: eine Zeile, die mit `//` beginnt,
// direkt nach einer Zeile, die mit `>` endet (ein Tag geht zu) und nicht mit `=>` (ein
// Pfeil, danach ist man in JS). Am Bestand gemessen trifft sie den Fall von damals und
// sonst nichts. Ein Parser wäre genauer, aber `@babel/parser` liegt nur transitiv im
// Baum, und das Projekt-TypeScript 7 hat keine JS-Schnittstelle mehr.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const UI = join(__dirname);

function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (name.endsWith(".tsx")) raus.push(pfad);
  }
  return raus;
}

/** Zeilennummern, an denen ein `//` als Text im JSX steht. */
function kommentareAlsText(quelltext: string): number[] {
  const zeilen = quelltext.split("\n");
  const istKommentar = (z: string) => /^\s*\/\//.test(z);
  const funde: number[] = [];
  zeilen.forEach((zeile, i) => {
    if (!istKommentar(zeile)) return;
    let j = i - 1;
    // Über Leerzeilen und den Rest desselben Kommentarblocks zurück zur letzten Codezeile.
    while (j >= 0 && (!zeilen[j].trim() || istKommentar(zeilen[j]))) j--;
    const davor = j >= 0 ? zeilen[j].trimEnd() : "";
    if (davor.endsWith(">") && !davor.endsWith("=>")) funde.push(i + 1);
  });
  return funde;
}

describe("Kommentare im JSX", () => {
  it("erkennt den Fall von 2026-11-10", () => {
    const damals = ["      <Collapsible.Panel>", "        // Begründung", "        <Aufklappflaeche>"].join("\n");
    expect(kommentareAlsText(damals)).toEqual([2]);
  });

  it("lässt einen Kommentar nach einem Pfeil und einen JSX-Kommentar in Ruhe", () => {
    const erlaubt = [
      "const x = posten.map((p) =>",
      "  // Begründung",
      "  p.id);",
      "<div>",
      "  {/* Begründung */}",
      "</div>",
    ].join("\n");
    expect(kommentareAlsText(erlaubt)).toEqual([]);
  });

  it("steht in keiner Datei der Oberfläche", () => {
    const funde = dateien(UI).flatMap((pfad) =>
      kommentareAlsText(readFileSync(pfad, "utf8")).map((nr) => `${relative(UI, pfad)}:${nr}`),
    );
    expect(funde).toEqual([]);
  });
});
