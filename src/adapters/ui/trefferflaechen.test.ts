// Trefferflächen und Schriftgrad der Eingabefelder, schmal — geprüft an den CSS-Regeln.
//
// jsdom rechnet kein Layout und wendet keine Medienabfragen an; eine gerenderte
// Komponente hat dort weder Höhe noch Breite. Geprüft wird deshalb, was `app.css` für
// eine Fensterbreite festlegt: welche Regeln bei 390 px greifen und welche bei 1280 px.
// Ob der Browser daraus wirklich 44 px macht, belegt erst eine Messung am Bildschirm —
// dieser Test hält fest, dass die Regel dasteht und niemand sie still überschreibt.
//
// Die beiden Regeln dahinter stehen in `ui/CLAUDE.md` unter „Mobile first": 44 px für
// alles, was ein Finger treffen muss, und 16 px Schrift in jedem Feld, sonst zoomt iOS
// Safari beim Fokus die Seite.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "../../styles/app.css"), "utf8");
const BAUSTEINE = join(__dirname, "bausteine");

interface Regel {
  auswahl: string[];
  medien: string[];
  dekl: Map<string, string>;
}

/** Eine kleine Zerlegung — für diese Datei genügt sie: Regeln, darin höchstens `@media`. */
function zerlegen(css: string, medien: string[] = [], raus: Regel[] = []): Regel[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < text.length) {
    const auf = text.indexOf("{", i);
    if (auf < 0) break;
    const kopf = (text.slice(i, auf).split(";").pop() ?? "").trim();
    let tiefe = 1;
    let j = auf + 1;
    while (tiefe > 0 && j < text.length) {
      if (text[j] === "{") tiefe++;
      else if (text[j] === "}") tiefe--;
      j++;
    }
    const rumpf = text.slice(auf + 1, j - 1);
    if (kopf.startsWith("@media")) zerlegen(rumpf, [...medien, kopf.slice(6).trim()], raus);
    else if (!kopf.startsWith("@")) {
      const dekl = new Map<string, string>();
      for (const teil of rumpf.split(";")) {
        const d = teil.indexOf(":");
        if (d > 0) dekl.set(teil.slice(0, d).trim(), teil.slice(d + 1).trim());
      }
      raus.push({ auswahl: kopf.split(",").map((s) => s.trim()), medien, dekl });
    }
    i = j;
  }
  return raus;
}

/** Greift eine Medienabfrage bei dieser Fensterbreite? Nur die Breite zählt hier. */
function greift(abfrage: string, breite: number): boolean {
  for (const [, art, wert] of abfrage.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)) {
    const px = Number(wert);
    if (art === "min" && breite < px) return false;
    if (art === "max" && breite > px) return false;
  }
  return true;
}

const REGELN = zerlegen(CSS);

/** Der Wert, den eine Klasse allein bei dieser Breite trägt — die letzte greifende Regel. */
function wert(klasse: string, eigenschaft: string, breite: number): string | undefined {
  let w: string | undefined;
  for (const r of REGELN) {
    if (!r.medien.every((m) => greift(m, breite))) continue;
    if (!r.auswahl.includes("." + klasse)) continue;
    const v = r.dekl.get(eigenschaft);
    if (v !== undefined) w = v;
  }
  return w;
}

/** Alle greifenden Regeln, deren letztes Glied die Klasse trägt (`.tabellenfilter .field`). */
function regelnAm(klasse: string, breite: number) {
  const muster = new RegExp(`\\.${klasse}(?![\\w-])[^\\s>+~]*$`);
  return REGELN.filter((r) => r.medien.every((m) => greift(m, breite)) && r.auswahl.some((a) => muster.test(a)));
}

/** Je Baustein die Klasse, die sein Bedienteil trägt — und die Datei, die sie setzt. */
/**
 * `auchBreite`: dazu eine Mindestbreite. Nur, wo der Inhalt schmaler sein kann als ein
 * Finger — an einem Knopf mit Text ersetzte sie in einer Flex-Zeile das `auto`, das ihn
 * nie schmaler werden lässt als seine Beschriftung (siehe `app.css`).
 */
const BEDIENTEILE: [datei: string, klasse: string, auchBreite: boolean][] = [
  ["Button.tsx", "btn", false],
  ["IconButton.tsx", "iconbtn", true],
  ["Umschalter.tsx", "umschalter-knopf", false],
  ["Registerleiste.tsx", "registerleiste-reiter", true],
  ["Zeilenlink.tsx", "zeilenlink", true],
  ["Zeilenauswahl.tsx", "zeilenauswahl", false],
  ["Auswahl.tsx", "auswahl-trigger", false],
  ["Kaestchen.tsx", "kaestchen", false],
  ["DataTable.tsx", "datentabelle-seitenfeld", true],
  ["Datumsfeld.tsx", "datumsfeld-knopf", true],
  ["Modal.tsx", "dialog-schliessen", true],
];

/**
 * Zeilen, die aufklappen und selbst das Bedienteil sind — kein Baustein, sondern je
 * Bereich gebaut. Pfade ab `ui/`.
 */
const AUFKLAPPZEILEN: [datei: string, klasse: string][] = [
  ["uebersicht/ErgebnisKarten.tsx", "aufklappzeile"],
  ["kontenverwaltung/AbgleichBereich.tsx", "aufklappzeile"],
];

/** Felder, die den Fokus bekommen und tippen oder wählen lassen. */
const FELDER: [datei: string, klasse: string][] = [
  ["FormField.tsx", "field"],
  ["Datumsfeld.tsx", "datumsfeld-eingabe"],
  ["DataTable.tsx", "datentabelle-seitenfeld"],
  ["Zeilenauswahl.tsx", "zeilenauswahl"],
];

const SCHMAL = 390;
const BREIT = 1280;

describe("Trefferflächen schmal", () => {
  it.each(BEDIENTEILE)("%s trägt die Klasse .%s", (datei, klasse) => {
    expect(readFileSync(join(BAUSTEINE, datei), "utf8")).toContain(klasse);
  });

  it.each(BEDIENTEILE)("%s: .%s ist schmal mindestens 44 px hoch", (_datei, klasse, auchBreite) => {
    expect(wert(klasse, "min-height", SCHMAL)).toBe("var(--trefferflaeche)");
    if (auchBreite) expect(wert(klasse, "min-width", SCHMAL)).toBe("var(--trefferflaeche)");
  });

  // `auto` und nicht 0: das ist der Ausgangswert, und an einem Flex-Kind sind die beiden
  // verschieden — 0 liesse einen Knopf breit schrumpfen, was er vorher nicht tat.
  it.each(BEDIENTEILE)("%s: .%s bleibt breit, wie es war", (_datei, klasse, auchBreite) => {
    expect(wert(klasse, "min-height", BREIT)).toBe("auto");
    if (auchBreite) expect(wert(klasse, "min-width", BREIT)).toBe("auto");
  });

  it("gibt einem Knopf mit Text keine Mindestbreite, nur denen der Seitensteuerung", () => {
    expect(wert("btn", "min-width", SCHMAL)).toBeUndefined();
    expect(REGELN.some((r) => r.medien.length === 0 && r.auswahl.includes(".datentabelle-seiten .btn") && r.dekl.get("min-width") === "var(--trefferflaeche)")).toBe(true);
  });

  it("überschreibt die Mindestgrösse schmal nirgends mit einer kleineren", () => {
    const funde: string[] = [];
    for (const [, klasse] of BEDIENTEILE) {
      for (const r of regelnAm(klasse, SCHMAL)) {
        for (const p of ["min-height", "min-width"]) {
          const v = r.dekl.get(p);
          if (v !== undefined && v !== "var(--trefferflaeche)") funde.push(`${r.auswahl.join(", ")} { ${p}: ${v} }`);
        }
      }
    }
    // Die Filterleiste gibt einer Auswahl eine Mindestbreite von 10rem — grösser, also gut.
    expect(funde.filter((f) => !f.includes("10rem"))).toEqual([]);
  });

  it.each(AUFKLAPPZEILEN)("%s trägt die Klasse .%s", (datei, klasse) => {
    expect(readFileSync(join(__dirname, datei), "utf8")).toContain(`className="${klasse}"`);
  });

  it.each(AUFKLAPPZEILEN)("%s: .%s ist schmal mindestens 44 px hoch, breit wie vorher", (_datei, klasse) => {
    expect(wert(klasse, "min-height", SCHMAL)).toBe("var(--trefferflaeche)");
    expect(wert(klasse, "min-height", BREIT)).toBe("auto");
    expect(regelnAm(klasse, SCHMAL).filter((r) => r.dekl.has("min-height")).map((r) => r.dekl.get("min-height"))).toEqual(["var(--trefferflaeche)"]);
  });

  it("legt um ein Kästchen ohne Text eine unsichtbare Fläche von 44 px", () => {
    const flaeche = REGELN.find((r) => r.medien.length === 0 && r.auswahl.some((a) => a.includes(".kaestchen-feld") && a.endsWith("::after")));
    expect(flaeche?.dekl.get("position")).toBe("absolute");
    expect(flaeche?.dekl.get("inset")).toBe("calc((16px - var(--trefferflaeche)) / 2)");
  });

  it("kennt den Wert der Trefferfläche", () => {
    const tokens = readFileSync(join(__dirname, "../../styles/tokens/spacing.css"), "utf8");
    expect(tokens).toMatch(/--trefferflaeche:\s*44px/);
  });
});

describe("Schrift in Feldern schmal", () => {
  it.each(FELDER)("%s trägt die Klasse .%s", (datei, klasse) => {
    expect(readFileSync(join(BAUSTEINE, datei), "utf8")).toContain(klasse);
  });

  /**
   * JEDE greifende Regel, nicht nur die letzte: der Fehler, den es gab, sass in einer
   * spezifischeren Regel (`.tabellenfilter .field`), die die Grundregel schmal wieder
   * aufhob — und im Datumsfeld trug die Hülle die 16 px, das Feld darin nicht.
   */
  it.each(FELDER)("%s: .%s hat schmal nirgends weniger als 16 px", (_datei, klasse) => {
    const regeln = regelnAm(klasse, SCHMAL).filter((r) => r.dekl.has("font-size"));
    expect(regeln.length).toBeGreaterThan(0);
    for (const r of regeln) expect(`${r.auswahl.join(", ")}: ${r.dekl.get("font-size")}`).toMatch(/: 16px$/);
  });

  it("findet die Regel, die schmal zu klein wäre", () => {
    const probe = zerlegen(".tabellenfilter .field { font-size: 13px }");
    expect(probe[0].auswahl).toEqual([".tabellenfilter .field"]);
    expect(greift("(min-width: 700px)", SCHMAL)).toBe(false);
    expect(greift("(max-width: 699.98px)", SCHMAL)).toBe(true);
  });
});
