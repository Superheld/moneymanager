// Die Farbregel der Auswertung als ausführbare Zusicherung.
//
// Sie steht als Prosa im Kopf von `bausteine/geldFarbe.ts`, und genau deshalb gibt es
// diesen Test: die Regel ist erst entstanden, NACHDEM zwei Farbsprachen nebeneinander
// gewachsen waren, jede Stelle für sich plausibel. Ein `color: "var(--warn-deep)"` ist
// beim Schreiben der naheliegende Griff und beim Lesen nicht von der anderen Sprache zu
// unterscheiden — ein Kommentar in einer anderen Datei hält das nicht auf.
//
// **Geprüft werden die drei Bereiche, die AUSWERTEN**, nicht die ganze Oberfläche. Ein
// Dialog, der seinen Verwerfen-Knopf amber färbt, sagt damit nichts über Geld; die
// Verwechslung, um die es geht, entsteht nur dort, wo Zahlen nebeneinander stehen und
// eine Farbe eine Aussage über sie macht. Ein Wächter, der überall meldet, wird
// abgeschaltet statt gelesen.
//
// **Und nur an ZAHLEN und FLÄCHEN**, also `color:` und `fill=`. Ein `borderColor` an der
// Karte *Da ist etwas zu tun* ist kein Betrag — die Karte ist die Warnung.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Die Bereiche, in denen die Regel gilt. */
const AUSWERTUNG = ["analyse", "uebersicht", "budgets"];

const TOKENS = ["--ok-deep", "--warn-deep", "--ok", "--warn"];

function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      raus.push(pfad);
    }
  }
  return raus;
}

/**
 * Die Fundstellen, an denen ein Farbtoken direkt eine Zahl oder eine Fläche färbt.
 *
 * Gesucht wird das Token INNERHALB einer Farbangabe, nicht irgendwo in der Zeile: sonst
 * meldete jeder Kommentar, der die Regel erklärt, einen Verstoss — und der Wächter
 * verböte ausgerechnet, ihn zu begründen.
 */
function verstoesse(inhalt: string): string[] {
  const treffer: string[] = [];
  inhalt.split("\n").forEach((zeile, i) => {
    if (zeile.trimStart().startsWith("//") || zeile.trimStart().startsWith("*")) return;
    for (const token of TOKENS) {
      const muster = new RegExp(`(color:|fill=)[^;,}\\n]*var\\(\\s*${token}\\s*\\)`);
      if (muster.test(zeile)) treffer.push(`${i + 1}: ${zeile.trim()}`);
    }
  });
  return treffer;
}

describe("Farbregel der Auswertung", () => {
  it("färbt Zahlen und Flächen nur über bausteine/geldFarbe", () => {
    const gefunden: string[] = [];
    for (const bereich of AUSWERTUNG) {
      for (const pfad of dateien(join("src/adapters/ui", bereich))) {
        for (const zeile of verstoesse(readFileSync(pfad, "utf8"))) {
          gefunden.push(`${pfad}:${zeile}`);
        }
      }
    }
    // Die Liste bleibt leer. Wer eine Farbe braucht, die `geldFarbe` nicht hergibt, hat
    // eine neue Klasse von Aussage gefunden — die gehört dorthin, nicht hierher.
    expect(gefunden).toEqual([]);
  });

  it("erwischt den Griff, um den es geht", () => {
    // Ohne diesen Fall wäre ein kaputtes Muster ein stiller Freifahrtschein: der Wächter
    // meldete nichts und sähe aus wie ein Beweis. Dasselbe Argument wie beim Muster-Guard.
    expect(verstoesse('  <span style={{ color: "var(--warn-deep)" }}>')).toHaveLength(1);
    expect(verstoesse('  <rect fill="var(--ok)" />')).toHaveLength(1);
    // Kommentare und Kartenrahmen bleiben draussen.
    expect(verstoesse('  // die Farbe kommt aus var(--warn-deep)')).toEqual([]);
    expect(verstoesse('  <Card style={{ borderColor: "var(--warn)" }}>')).toEqual([]);
  });
});
