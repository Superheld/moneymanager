// Der Wächter über die Schichtgrenzen.
//
// Warum ein Test und kein ESLint: das Projekt hat gar keinen Linter, und
// `@typescript-eslint/parser` unterstützt das hier installierte TypeScript 7 nicht
// (Peer bis 6.0). Ein Test kostet keine Abhängigkeit, läuft in `npm test` und hängt
// damit schon in der CI. Und er kann mehr als eine Import-Regel: die ALTLAST unten ist
// prüfbar, sie darf nicht verrotten.
//
// Die Regel selbst steht in CLAUDE.md. Hier steht sie ausführbar.
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
 * **Sie ist leer.** Die gesamte Oberfläche geht über `application/`; solange die
 * Migration lief, stand die Restschuld hier — sichtbar im Repo statt in einem Ticket.
 *
 * Sie bleibt stehen, weil sie zwei Dinge kann, die ein gelöschtes Array nicht kann: sie
 * benennt den Ausnahmefall, falls es je wieder einen gibt, und der Test darunter hält
 * sie ehrlich — ein Eintrag, der nichts mehr verletzt, lässt ihn fehlschlagen. Neue
 * Einträge gehören nicht hinein: was neu gebaut wird, wird gleich richtig gebaut.
 */
const ALTLAST: readonly string[] = [];

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

  // Eingebetteter Fremdcode (`vendor/`) ist Infrastruktur, kein Kern. Er kennt dieses
  // Projekt nicht — und sobald er es kennte, liesse er sich nicht mehr gegen seine
  // Herkunft abgleichen: jeder Import in unsere Richtung waere eine Aenderung, die beim
  // naechsten Abgleich entweder verlorengeht oder ihn blockiert.
  it("vendor kennt das Projekt nicht", () => {
    const verstoesse = DATEIEN.filter((d) => schicht(d) === "vendor")
      .map((d) => ({ datei: kurz(d), zieht: [...importierteSchichten(d)].filter((z) => z !== "vendor") }))
      .filter((v) => v.zieht.length > 0);
    expect(verstoesse).toEqual([]);
  });

  // Und die Gegenrichtung: fremde Datenformen kommen nur über einen Adapter herein, der
  // sie uebersetzt. Zoege die UI direkt aus `vendor/`, stuenden Fliesskomma-Betraege und
  // fremde Feldnamen mitten im Screen — genau das, was die Schichtgrenze verhindert.
  it("nur die Adapter benutzen vendor — nicht der Kern, nicht die Anwendung, nicht die UI", () => {
    const draussen = new Set(["core", "application", "adapters/ui"]);
    const verstoesse = DATEIEN.filter((d) => draussen.has(schicht(d)))
      .map((d) => ({ datei: kurz(d), zieht: [...importierteSchichten(d)].filter((z) => z === "vendor") }))
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
