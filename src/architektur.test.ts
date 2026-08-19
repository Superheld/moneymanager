// Der Wächter über die Schichtgrenzen.
//
// Warum ein Test und kein ESLint: das Projekt hat gar keinen Linter, und
// `@typescript-eslint/parser` unterstützt das hier installierte TypeScript 7 nicht
// (Peer bis 6.0). Ein Test kostet keine Abhängigkeit, läuft in `npm test` und hängt
// damit schon in der CI. Und er kann mehr als eine Import-Regel: die ALTLAST unten ist
// prüfbar, sie darf nicht verrotten.
//
// Die Regel selbst steht in CLAUDE.md und ARCHITEKTUR.md. Hier steht sie ausführbar.
//
//   adapters ──▶ application ──▶ core
//
// Die STRENGE Fassung (Entscheidung 2026-08-19): die UI kennt `core` und
// `adapters/persistence` NICHT. Sie importiert Domänen-Vokabular und Use-Cases aus
// `application/`, sonst nichts. Warum streng: eine Domänenregel, die die UI umgehen
// kann, wird sie irgendwann umgehen — beim Budgetverbrauch ist genau das passiert
// (Vertragszahlungen zählten doppelt, weil jeder Screen seine eigene Buchungsliste
// zusammenstellte).

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const WURZEL = resolve(__dirname);

/**
 * UI-Dateien, die noch direkt auf `core` oder `adapters/persistence` zugreifen.
 *
 * Diese Liste ist die Migrationsschuld, sichtbar im Repo statt in einem Ticket. Sie darf
 * nur SCHRUMPFEN — ein Test unten schlägt fehl, sobald ein Eintrag nichts mehr verletzt,
 * damit sie nicht mit toten Namen verrottet. Neue Einträge gehören nicht hinein: was neu
 * gebaut wird, wird gleich richtig gebaut.
 */
const ALTLAST: readonly string[] = [
  "adapters/ui/AbrufDialog.tsx",
  "adapters/ui/AnalyseScreen.tsx",
  "adapters/ui/BankzugaengeScreen.tsx",
  "adapters/ui/BuchungDetail.tsx",
  "adapters/ui/BudgetsScreen.tsx",
  "adapters/ui/CategoryPicker.tsx",
  "adapters/ui/EinstellungenProvider.tsx",
  "adapters/ui/EinstellungenScreen.tsx",
  "adapters/ui/FestlegungenCard.tsx",
  "adapters/ui/ImportScreen.tsx",
  "adapters/ui/InventarScreen.tsx",
  "adapters/ui/KategorisierungCards.tsx",
  "adapters/ui/KontenScreen.tsx",
  "adapters/ui/KontenVerwaltung.tsx",
  "adapters/ui/KontenVerwaltungScreen.tsx",
  "adapters/ui/KontoAnlegenModal.tsx",
  "adapters/ui/MerkmaleBlock.tsx",
  "adapters/ui/MonatsAusblick.tsx",
  "adapters/ui/NeueBuchungen.tsx",
  "adapters/ui/ReviewScreen.tsx",
  "adapters/ui/SammelDialog.tsx",
  "adapters/ui/TrainingBereich.tsx",
  "adapters/ui/UebersichtScreen.tsx",
  "adapters/ui/VertraegeScreen.tsx",
  "adapters/ui/VertragErkennungModal.tsx",
  "adapters/ui/VertragModal.tsx",
  "adapters/ui/einstellungenKontext.ts",
];

/** Alle Produktivdateien unter `src/` — Tests zählen nicht (sie dürfen schichtübergreifend prüfen). */
function produktivDateien(verzeichnis = WURZEL): string[] {
  const raus: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    if (eintrag === "node_modules") continue;
    const voll = join(verzeichnis, eintrag);
    if (statSync(voll).isDirectory()) {
      raus.push(...produktivDateien(voll));
    } else if (/\.tsx?$/.test(eintrag) && !/\.(test|d)\./.test(eintrag)) {
      raus.push(voll);
    }
  }
  return raus;
}

/** Die Schicht, in der eine Datei liegt — „core", „application", „adapters/ui" … */
function schicht(datei: string): string {
  const teile = relative(WURZEL, datei).split("/");
  if (teile[0] === "adapters") return `adapters/${teile[1]}`;
  return teile[0];
}

/**
 * Die Schichten, die eine Datei über RELATIVE Importe erreicht. Pakete (react, i18next)
 * interessieren hier nicht — die Regel gilt der Richtung im eigenen Code.
 */
function importierteSchichten(datei: string): Set<string> {
  const quelle = readFileSync(datei, "utf8");
  const ziele = new Set<string>();
  for (const [, pfad] of quelle.matchAll(/from\s*"([^"]+)"/g)) {
    if (!pfad.startsWith(".")) continue;
    const aufgeloest = resolve(dirname(datei), pfad);
    if (!aufgeloest.startsWith(WURZEL)) continue;
    ziele.add(schicht(aufgeloest));
  }
  return ziele;
}

const DATEIEN = produktivDateien();
const kurz = (d: string) => relative(WURZEL, d);

describe("Schichtgrenzen", () => {
  // Die Grenze, die schon immer hält — und die wichtigste: ein Kern ohne IO ist der
  // Grund, warum die ganze Suite in Sekunden durchläuft.
  it("core importiert nichts nach außen", () => {
    const verstoesse = DATEIEN.filter((d) => schicht(d) === "core")
      .map((d) => ({ datei: kurz(d), zieht: [...importierteSchichten(d)].filter((z) => z !== "core") }))
      .filter((v) => v.zieht.length > 0);
    expect(verstoesse).toEqual([]);
  });

  it("application kennt nur core", () => {
    const erlaubt = new Set(["core", "application"]);
    const verstoesse = DATEIEN.filter((d) => schicht(d) === "application")
      .map((d) => ({ datei: kurz(d), zieht: [...importierteSchichten(d)].filter((z) => !erlaubt.has(z)) }))
      .filter((v) => v.zieht.length > 0);
    expect(verstoesse).toEqual([]);
  });

  it("die UI greift weder auf core noch auf die Persistenz durch", () => {
    const verboten = new Set(["core", "adapters/persistence"]);
    const verstoesse = DATEIEN.filter((d) => schicht(d) === "adapters/ui")
      .filter((d) => !ALTLAST.includes(kurz(d)))
      .map((d) => ({ datei: kurz(d), zieht: [...importierteSchichten(d)].filter((z) => verboten.has(z)) }))
      .filter((v) => v.zieht.length > 0);
    expect(verstoesse).toEqual([]);
  });

  // Ohne diese Prüfung wäre die ALTLAST eine Liste, die niemand je wieder anfasst: ein
  // migrierter Screen bliebe darin stehen, und beim nächsten Direktzugriff fiele es
  // keinem auf. Sie muss mit jeder Migration kürzer werden.
  it("die Altlast-Liste enthält nur, was wirklich noch verletzt", () => {
    const verboten = new Set(["core", "adapters/persistence"]);
    const ueberfluessig = ALTLAST.filter((eintrag) => {
      const datei = join(WURZEL, eintrag);
      if (!DATEIEN.includes(datei)) return true; // Datei gibt es nicht mehr
      return [...importierteSchichten(datei)].every((z) => !verboten.has(z));
    });
    expect(ueberfluessig).toEqual([]);
  });
});
