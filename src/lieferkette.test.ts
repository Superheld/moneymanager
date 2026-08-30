// Der Wächter über die Abhängigkeits-Vorschläge.
//
// Dependabot legt seine Pull Requests gegen den STANDARDBRANCH an, wenn man ihm nichts
// anderes sagt — hier also gegen `main`. Das ist genau der Branch, auf dem nicht
// gearbeitet wird: er trägt den veröffentlichten Stand und nimmt nur Merges aus
// `develop` an, durchgesetzt vom `prepare-commit-msg`-Hook.
//
// Der Haken daran ist, dass dieser Hook auf DIESER Maschine sitzt, ein Merge auf GitHub
// aber dort passiert. Ein Vorschlag gegen `main` lässt sich also mit einem Klick
// zusammenführen, ohne dass der Wachposten je gefragt wird — er fällt lautlos genau dann
// aus, wenn er gebraucht wird. Einmal standen so dreizehn offene Vorschläge am falschen
// Ort, alle grün, und nichts daran sah verkehrt aus.
//
// Deshalb steht `target-branch` bei jedem Eintrag, und deshalb prüft dieser Test es
// nach: der Fehler entsteht nicht beim Ändern der Datei, sondern beim ERGÄNZEN eines
// weiteren Ökosystems, wo man die Zeile schlicht vergisst.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEPENDABOT = readFileSync(
  join(import.meta.dirname, "..", ".github", "dependabot.yml"),
  "utf8",
);

// Kein YAML-Parser im Baum, und für diese Frage braucht es auch keinen: die Datei ist
// eine flache Liste, und jeder Eintrag beginnt mit seinem Ökosystem.
const eintraege = DEPENDABOT.split(/^  - package-ecosystem:/m).slice(1);

describe("Die Abhängigkeits-Vorschläge", () => {
  it("deckt npm, cargo und die Actions ab", () => {
    // Die dritte ist die, die man vergisst: Actions sind auf Commit-SHAs gepinnt und
    // altern deshalb stumm.
    expect(DEPENDABOT).toContain("package-ecosystem: npm");
    expect(DEPENDABOT).toContain("package-ecosystem: cargo");
    expect(DEPENDABOT).toContain("package-ecosystem: github-actions");
    expect(eintraege.length).toBeGreaterThanOrEqual(3);
  });

  it("richtet JEDEN Eintrag auf develop", () => {
    for (const eintrag of eintraege) {
      const oekosystem = eintrag.split("\n")[0].trim();
      expect(eintrag, `Eintrag "${oekosystem}" ohne target-branch`).toMatch(
        /^\s+target-branch: develop$/m,
      );
    }
  });

  it("richtet keinen Eintrag auf main", () => {
    // Der ausdrückliche Gegentest: `target-branch: main` wäre schlimmer als die fehlende
    // Zeile, weil es aussieht, als hätte jemand darüber nachgedacht.
    expect(DEPENDABOT).not.toMatch(/target-branch:\s*main/);
  });
});
