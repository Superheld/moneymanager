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
import { RANG_ALTLAST } from "./architektur.altlast";

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
  // BEIDE Trenner, und das ist kein Gürtel-und-Hosenträger. `relative` liefert auf
  // Windows Backslashes; ein `split("/")` ergibt dort genau ein Element, `teile[0]` ist
  // der ganze Pfad, und keine einzige Datei wird je „core" zugeordnet. Die Tests unten
  // liefen damit nicht rot, sondern GRÜN über eine leere Menge — der Wächter hätte auf
  // Windows nichts mehr geprüft und es nicht gesagt. Der Test „sieht überhaupt etwas"
  // weiter unten ist die zweite Hälfte derselben Absicherung.
  const teile = relative(WURZEL, datei).split(/[\\/]/);
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
  /**
   * Der Wächter über den Wächter: sieht er überhaupt Dateien?
   *
   * Jede Prüfung unten filtert `DATEIEN` auf eine Schicht und meldet die Verstösse darin.
   * Findet der Filter nichts, ist die Liste leer und der Test grün — er sagt dann „keine
   * Verstösse", meint aber „nicht hingesehen". Genau das ist auf Windows passiert, weil
   * `schicht()` den Pfad nicht mehr zerlegen konnte, und niemand hätte es gemerkt.
   */
  it("sieht überhaupt etwas — jede geprüfte Schicht trägt Dateien", () => {
    const leer = ["core", "application", "adapters/ui", "adapters/persistence"].filter(
      (s) => !DATEIEN.some((d) => schicht(d) === s),
    );
    expect(leer, "diese Schichten wurden von keiner Datei getroffen").toEqual([]);
  });

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

  // Der Einstieg (`App.tsx`, `main.tsx`) liegt in der Wurzel und gehört damit zu keiner
  // der Schichten oben — `schicht()` liefert für ihn seinen eigenen Dateinamen, und kein
  // Filter trifft ihn. Bis 2026-11-10 holte sich `App.tsx` dort unbemerkt ein Repository.
  // Für ihn gilt dieselbe Regel wie für die Oberfläche, deren Teil er ist.
  it("der Einstieg in der Wurzel greift weder auf core noch auf die Persistenz durch", () => {
    const verboten = new Set(["core", "adapters/persistence"]);
    const wurzel = DATEIEN.filter((d) => dirname(d) === WURZEL);
    expect(wurzel.map(kurz), "der Einstieg wurde nicht gefunden").toContain("App.tsx");
    const verstoesse = wurzel
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

// ---------------------------------------------------------------------------
// Modulgrenzen — welcher Bereich welchen anderen kennen darf
// ---------------------------------------------------------------------------
//
// Die Schichtgrenzen oben sagen, in welche RICHTUNG eine Schicht blickt. Innerhalb einer
// Schicht liegen die Bereiche nebeneinander (`core/budgets/`, `core/ruecklagen/` …), und
// zwischen ihnen gibt es Richtungen, die gelten sollen, ohne dass der Compiler sie kennt.
// Hier stehen sie als Daten, in zwei Formen:
//
// - die RANGFOLGE (`RANG`): jeder Bereich hat eine Stufe und kennt nur Bereiche UNTER sich.
//   Sie gilt für Code — Importe, Namen über die Fassaden, Aufrufe über `dienste`.
// - einzelne GRENZEN (`MODULGRENZEN`): ein Paar „A kennt B nicht", das zusätzlich die
//   Texte und die Bausteine einschliesst. Was dort steht, muss die Rangfolge schon sagen;
//   die Grenze ist die strengere Fassung desselben.
//
// Beides gilt in Kern, Anwendung und Oberfläche zugleich, mit denselben Bereichsnamen —
// sie heissen in allen drei Schichten gleich, und genau dafür (Wurzel-`CLAUDE.md`, „Wie die
// Schichten innen gegliedert sind").
//
// Was ZWEI Bereiche gegeneinander abwägt, gehört keinem von beiden, sondern in die Wurzel
// der Schicht (`core/zustaendigkeit.ts`). Die Wurzel ist deshalb von jeder Regel
// ausgenommen, in BEIDE Richtungen: sie kennt alle Bereiche, und ein Bereich darf benutzen,
// was sie abgewogen hat. Das ist eine bewusste Grenze dieser Prüfung — ein Weg Bereich →
// Wurzel → anderer Bereich bleibt unsichtbar. Er ist gewollt, solange die Wurzeldatei
// wirklich abwägt; eine Datei, die nur dorthin zieht, um der Regel zu entgehen, sieht der
// Test nicht, die Durchsicht schon.

interface Modulgrenze {
  /** Der Bereich, für den die Regel gilt. */
  readonly bereich: string;
  /** Der Bereich, den er nicht kennen darf — weder Code noch Texte. */
  readonly kenntNicht: string;
}

/**
 * Die Grenzen, die STRENGER gelten als die Rangfolge: auch für i18n-Schlüssel und für die
 * Bausteine, die der Bereich benutzt. Ob er den Code des anderen kennt, prüft die
 * Rangfolge; der Test „jede Grenze steht auch in der Rangfolge" hält beide beisammen.
 *
 * - **Rücklagen kennen keine Budgets** (2026-11-16). Ein Budget zählt „ohne die Rücklage
 *   auf seiner Unterkategorie" und muss deshalb von ihr wissen; eine Rücklage braucht für
 *   ihren Stand kein Budget. Wo das Budget doch mitspricht — am selben Knoten gewinnt es —,
 *   ist das eine Abwägung zwischen beiden und steht in der Zuständigkeit in der Wurzel.
 */
const MODULGRENZEN: readonly Modulgrenze[] = [{ bereich: "ruecklagen", kenntNicht: "budgets" }];

/**
 * Die Rangfolge der Fachbereiche, unten → oben (2026-11-17). Ein Bereich kennt nur Bereiche
 * mit KLEINERER Zahl; gleichrangige kennen sich nicht. Der Grund je Stufe steht in der
 * Wurzel-`CLAUDE.md`; hier nur, was beim Lesen der Tabelle sonst stolpern lässt.
 *
 * Jeder Ordner direkt unter `core/`, `application/` und `adapters/ui/` braucht hier einen
 * Eintrag (oder einen in `ABBILDUNG` bzw. `KEIN_BEREICH`) — ein unbekannter Ordner macht
 * den Test rot. Sonst liefe ein neuer Bereich still ohne Regel.
 */
const RANG: Readonly<Record<string, number>> = {
  stammdaten: 0,
  kategorien: 0, // der Baum; das Training darüber ist `klassifikator`
  zugang: 0,
  sicherung: 0, // nur die Rotation der Sicherungen, kennt nichts als `basis`
  konten: 1,
  import: 2, // der Beleg — die Buchung verweist auf ihn, nicht umgekehrt
  dubletten: 3,
  fints: 3,
  buchung: 4,
  depot: 4,
  vertraege: 5,
  // Das Training und die Kategorisierung. Im Kern gibt es den Ordner schon (Modell,
  // Merkmale, Messung); der Teil in `application/kategorien` und `ui/training` zieht erst
  // in einem späteren Paket hierher und zählt bis dahin als `kategorien` — daher ein guter
  // Teil der Altlast `kategorien → klassifikator`.
  klassifikator: 6,
  ruecklagen: 7,
  budgets: 8,
  vermoegen: 9,
  // Die Sichten: sie ziehen zusammen, was darunter liegt, und niemand braucht sie.
  analyse: 10,
  uebersicht: 10,
  einstellungen: 10,
  // Die Review-Inbox: Belege prüfen, zuordnen und verbuchen. Sie öffnet den Buchungsdialog
  // und fragt Dubletten, Umbuchungen und Verträge — eine Sicht über den Beleg, nicht der Beleg.
  // Nur in der Oberfläche; die Use-Cases dahinter gehören ihren Bereichen.
  review: 10,
};

/**
 * Ordner, die unter anderem Namen ein Bereich der Rangfolge SIND.
 *
 * - `training` heisst in der Oberfläche so, weil die Navigation den Bereich so nennt.
 * - `vorsorge` ist ein Teil von Vermögen: das Vorsorgevermögen ist das Nettovermögen, die
 *   Regeln stehen in `core/vermoegen/CLAUDE.md`, die Oberfläche im Vermögen-Screen. Die
 *   Ordner bleiben vorerst; für die Regel ist es ein Bereich, Bezüge untereinander sind frei.
 */
const ABBILDUNG: Readonly<Record<string, string>> = { training: "kategorien", vorsorge: "vermoegen" };

/** Ordner, die bewusst KEIN Bereich sind: Primitive quer durch alles, geteilte Bausteine. */
const KEIN_BEREICH: readonly string[] = ["basis", "bausteine"];

/** Die Schichten, die nach Bereichen gegliedert sind. */
const SCHICHTEN_MIT_BEREICHEN: readonly string[] = ["core", "application", "adapters/ui"];

/** Pfad relativ zu `src/`, immer mit `/` — damit die Altlast auf jeder Plattform gleich aussieht. */
const pfadname = (d: string) => kurz(d).split(/[\\/]/).join("/");

/** Der Bereich einer Datei innerhalb ihrer Schicht — `undefined` für die Wurzel der Schicht. */
function bereich(datei: string): string | undefined {
  const s = schicht(datei);
  if (!SCHICHTEN_MIT_BEREICHEN.includes(s)) return undefined;
  const teile = relative(join(WURZEL, s), datei).split(/[\\/]/);
  return teile.length > 1 ? teile[0] : undefined;
}

/** Ein relativer Importpfad als Datei — wie TypeScript ihn auflöst, soweit es hier vorkommt. */
function aufloesen(von: string, pfad: string): string | undefined {
  const basis = resolve(dirname(von), pfad);
  for (const k of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts"), join(basis, "index.tsx")]) {
    try {
      if (statSync(k).isFile()) return k;
    } catch {
      // gibt es nicht — nächster Kandidat
    }
  }
  return undefined;
}

/**
 * Der Quelltext ohne ganze Kommentarzeilen und ohne Blockkommentare am Zeilenanfang.
 * Nötig, weil die Fassaden ihre Listen kommentieren — ein „(`budgetStand`, …)" darin ist
 * kein Export. Kommentare HINTER Code bleiben stehen; sie kommen in Importlisten nicht vor.
 */
function ohneKommentare(quelle: string): string {
  return quelle.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Die Namen in einer Liste `{ a, type B, c as d }` — je Eintrag [Name dort, Name hier]. */
function namensliste(liste: string): [string, string][] {
  return liste
    .split(",")
    .map((t) => t.trim().replace(/^type\s+/, ""))
    .filter((t) => t.length > 0)
    .map((t) => {
      const [dort, hier] = t.split(/\s+as\s+/);
      return [dort.trim(), (hier ?? dort).trim()];
    });
}

const importeJeDatei = new Map<string, { ziel: string; namen: string[] }[]>();

/** Die relativen Importe einer Datei, je Ziel die benannten Namen (die Namen DORT). */
function importe(datei: string): { ziel: string; namen: string[] }[] {
  const gemerkt = importeJeDatei.get(datei);
  if (gemerkt) return gemerkt;
  const quelle = ohneKommentare(readFileSync(datei, "utf8"));
  const raus: { ziel: string; namen: string[] }[] = [];
  importeJeDatei.set(datei, raus);
  for (const [, klausel, pfad] of quelle.matchAll(/\bimport\s+([^;]*?)\s*from\s*"([^"]+)"/g)) {
    if (!pfad.startsWith(".")) continue;
    const ziel = aufloesen(datei, pfad);
    if (!ziel) continue;
    const liste = /\{([^}]*)\}/.exec(klausel)?.[1] ?? "";
    raus.push({ ziel, namen: namensliste(liste).map(([dort]) => dort) });
  }
  return raus;
}

const herkunftJeDatei = new Map<string, Map<string, string>>();

/**
 * Woher jeder Name kommt, den eine Datei exportiert: aus ihr selbst oder — über
 * `export … from` und `export * from` — aus der Datei, die ihn DEKLARIERT.
 *
 * Ohne das sähe die Regel nur die Hälfte: Anwendung und Oberfläche importieren nie aus
 * einzelnen Kerndateien, sondern aus den Fassaden (`core/index.ts`, `application/index.ts`).
 * Ein Typ aus `core/budgets/` käme dort als Import von „core" an und keinem Bereich
 * zu — und eine Rücklage, die ihn benutzt, liefe grün durch.
 */
function exportHerkunft(datei: string, unterwegs = new Set<string>()): Map<string, string> {
  const gemerkt = herkunftJeDatei.get(datei);
  if (gemerkt) return gemerkt;
  const raus = new Map<string, string>();
  if (unterwegs.has(datei)) return raus;
  unterwegs.add(datei);
  const quelle = ohneKommentare(readFileSync(datei, "utf8"));
  const deklariert =
    /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const [, name] of quelle.matchAll(deklariert)) raus.set(name, datei);
  for (const [, liste, pfad] of quelle.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const ziel = pfad.startsWith(".") ? aufloesen(datei, pfad) : undefined;
    if (!ziel) continue;
    const dort = exportHerkunft(ziel, unterwegs);
    for (const [name, hier] of namensliste(liste)) raus.set(hier, dort.get(name) ?? ziel);
  }
  for (const [, pfad] of quelle.matchAll(/\bexport\s+(?:type\s+)?\*\s+from\s*"([^"]+)"/g)) {
    const ziel = pfad.startsWith(".") ? aufloesen(datei, pfad) : undefined;
    if (!ziel) continue;
    for (const [name, herkunft] of exportHerkunft(ziel, unterwegs)) if (!raus.has(name)) raus.set(name, herkunft);
  }
  herkunftJeDatei.set(datei, raus);
  return raus;
}

const DIENSTE = join(WURZEL, "adapters", "dienste.ts");

/**
 * Was eine Funktion aus `adapters/dienste.ts` aufruft: die Dateien, aus denen die Namen in
 * ihrem Rumpf stammen. Die Oberfläche ruft Use-Cases nicht selbst, sondern über diese
 * Verdrahtung — ohne den Blick hinein wäre „ruft einen Use-Case der Budgets auf" für die
 * Regel nur „importiert aus dienste".
 *
 * Der Rumpf reicht bis zur nächsten Zeile, die am Rand mit `export`, `function`, `const`
 * oder einem Kommentar beginnt; so ist die Datei gebaut. Gezählt werden nur Namen, die
 * `dienste` selbst importiert — Repositories und Konstanten zählen nicht.
 */
function dienstHerkunft(name: string): string[] {
  const quelle = readFileSync(DIENSTE, "utf8");
  const zeilen = quelle.split("\n");
  const start = zeilen.findIndex((z) => new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(z));
  if (start < 0) return [DIENSTE];
  let ende = start + 1;
  while (ende < zeilen.length && !/^(export|function|async|const|let|\/\/|\/\*)/.test(zeilen[ende])) ende++;
  const rumpf = zeilen.slice(start, ende).join("\n");
  const raus = new Set<string>();
  for (const [, liste, pfad] of ohneKommentare(quelle).matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const ziel = pfad.startsWith(".") ? aufloesen(DIENSTE, pfad) : undefined;
    if (!ziel) continue;
    // Gesucht wird der Name, unter dem `dienste` ihn führt — bei `budgetLoeschen as
    // budgetLoeschenUseCase` der zweite —, zurückverfolgt wird der erste.
    for (const [dort, hier] of namensliste(liste)) {
      if (new RegExp(`\\b${hier}\\b`).test(rumpf)) raus.add(exportHerkunft(ziel).get(dort) ?? ziel);
    }
  }
  return [...raus];
}

/**
 * Jede Datei, aus der eine Datei etwas bezieht, bis zu ihrem Ursprung verfolgt: direkt,
 * über eine Fassade (`index.ts`) bis zur deklarierenden Datei, über `dienste` bis zu den
 * Use-Cases dahinter.
 */
function bezuege(datei: string): string[] {
  const raus = new Set<string>();
  for (const { ziel, namen } of importe(datei)) {
    if (ziel === DIENSTE) {
      for (const n of namen) for (const h of dienstHerkunft(n)) raus.add(h);
    } else if (/[\\/]index\.tsx?$/.test(ziel)) {
      const herkunft = exportHerkunft(ziel);
      for (const n of namen) raus.add(herkunft.get(n) ?? ziel);
      if (namen.length === 0) raus.add(ziel);
    } else {
      raus.add(ziel);
    }
  }
  return [...raus];
}

/** Steht in der Datei ein i18n-Schlüssel aus dem Namensraum `bereich.`? In jeder Form. */
function schluesselAus(datei: string, namensraum: string): string[] {
  const quelle = readFileSync(datei, "utf8");
  return [...quelle.matchAll(new RegExp(`["'\`](${namensraum}\\.[\\w.]+)`, "g"))].map((m) => m[1]);
}

const UI_BAUSTEINE = join(WURZEL, "adapters", "ui", "bausteine");

/** Die Bereiche der Oberfläche, die eine Datei aus `bausteine/` direkt importieren — gemessen. */
function nutzerBereiche(baustein: string): Set<string> {
  const raus = new Set<string>();
  for (const d of DATEIEN) {
    if (schicht(d) !== "adapters/ui") continue;
    const b = bereich(d);
    if (!b || b === "bausteine") continue;
    if (importe(d).some((i) => i.ziel === baustein)) raus.add(b);
  }
  return raus;
}

describe("Modulgrenzen", () => {
  // Wie oben: eine Regel, die nichts sieht, ist grün. Hier gibt es mehr Stellen, an denen
  // sie blind werden kann — die Bereichsordner, die Fassaden, `dienste`, die Bausteine,
  // das Suchmuster der Schlüssel —, und jede wird einzeln geprüft.
  it("sieht überhaupt etwas — Bereiche, Fassaden, dienste, Bausteine, Schlüssel", () => {
    const blind: string[] = [];
    for (const g of MODULGRENZEN) {
      for (const s of SCHICHTEN_MIT_BEREICHEN) {
        for (const b of [g.bereich, g.kenntNicht]) {
          if (!DATEIEN.some((d) => schicht(d) === s && bereich(d) === b)) blind.push(`keine Datei in ${s}/${b}`);
        }
      }
      for (const fassade of [join(WURZEL, "core", "index.ts"), join(WURZEL, "application", "index.ts")]) {
        if (![...exportHerkunft(fassade).values()].some((h) => bereich(h) === g.kenntNicht)) {
          blind.push(`${pfadname(fassade)} führt keinen Namen auf ${g.kenntNicht} zurück`);
        }
      }
      const dienstNamen = [...exportHerkunft(DIENSTE).keys()];
      if (!dienstNamen.some((n) => dienstHerkunft(n).some((h) => bereich(h) === g.kenntNicht))) {
        blind.push(`keine Funktion in dienste führt auf ${g.kenntNicht} zurück`);
      }
      const bausteine = DATEIEN.filter((d) => dirname(d) === UI_BAUSTEINE);
      if (!bausteine.some((b) => nutzerBereiche(b).has(g.bereich))) blind.push(`kein Baustein wird von ${g.bereich} benutzt`);
      const ui = DATEIEN.filter((d) => schicht(d) === "adapters/ui" && bereich(d) === g.kenntNicht);
      if (!ui.some((d) => schluesselAus(d, g.kenntNicht).length > 0)) blind.push(`kein Schlüssel ${g.kenntNicht}.… gefunden`);
    }
    expect(blind).toEqual([]);
  });

  // Die Oberfläche eines Bereichs benutzt keine Texte aus dem Namensraum des anderen —
  // auch nicht, wo sie gleich lauten. Ein geteilter Schlüssel ändert sich sonst im einen
  // Bereich und mit ihm still im anderen.
  it("die Oberfläche eines Bereichs benutzt keine Schlüssel des anderen", () => {
    const verstoesse = MODULGRENZEN.flatMap((g) =>
      DATEIEN.filter((d) => schicht(d) === "adapters/ui" && bereich(d) === g.bereich).flatMap((d) =>
        schluesselAus(d, g.kenntNicht).map((k) => `${pfadname(d)} → ${k}`),
      ),
    );
    expect(verstoesse).toEqual([]);
  });

  // Ein Baustein, den ein Bereich benutzt, ist für die Dauer dieser Nutzung ein Teil von
  // ihm: was er nicht kennen darf, darf der Baustein auch nicht — weder Code noch Texte.
  // Geprüft wird, wer ihn DIREKT importiert; ein Baustein in einem Baustein erbt das nicht.
  it("ein Baustein trägt keinen Bereich in einen anderen", () => {
    const verstoesse: string[] = [];
    for (const g of MODULGRENZEN) {
      for (const b of DATEIEN.filter((d) => dirname(d) === UI_BAUSTEINE)) {
        if (!nutzerBereiche(b).has(g.bereich)) continue;
        for (const k of schluesselAus(b, g.kenntNicht)) verstoesse.push(`${pfadname(b)} → ${k}`);
        for (const z of bezuege(b)) if (bereich(z) === g.kenntNicht) verstoesse.push(`${pfadname(b)} → ${pfadname(z)}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Die Rangfolge, ausführbar
// ---------------------------------------------------------------------------

/** Der Bereich einer Datei im Sinn der Rangfolge — nach `ABBILDUNG`; `undefined` ohne Rang. */
function rangBereich(datei: string): string | undefined {
  const b = bereich(datei);
  if (b === undefined) return undefined;
  const name = ABBILDUNG[b] ?? b;
  return name in RANG ? name : undefined;
}

interface Bereichsbezug {
  readonly von: string;
  readonly auf: string;
  /** `quelldatei → zieldatei`, Pfade relativ zu `src/` — die Einheit der Altlast. */
  readonly eintrag: string;
}

let bezuegeZwischenBereichen: Bereichsbezug[] | undefined;

/** Jeder Bezug einer Produktivdatei auf eine Datei eines ANDEREN Bereichs mit Rang. */
function bereichsbezuege(): Bereichsbezug[] {
  if (bezuegeZwischenBereichen) return bezuegeZwischenBereichen;
  const raus = new Map<string, Bereichsbezug>();
  for (const d of DATEIEN) {
    const von = rangBereich(d);
    if (von === undefined) continue;
    for (const z of bezuege(d)) {
      const auf = rangBereich(z);
      if (auf === undefined || auf === von) continue;
      const eintrag = `${pfadname(d)} → ${pfadname(z)}`;
      raus.set(eintrag, { von, auf, eintrag });
    }
  }
  bezuegeZwischenBereichen = [...raus.values()];
  return bezuegeZwischenBereichen;
}

/** Bezüge auf einen gleich- oder höherrangigen Bereich — die, die die Rangfolge verbietet. */
function rangverstoesse(): Bereichsbezug[] {
  return bereichsbezuege().filter((b) => RANG[b.auf] >= RANG[b.von]);
}

/** Die Ordner direkt unter den Schichten mit Bereichen, als `schicht/ordner`. */
function bereichsordner(): string[] {
  return SCHICHTEN_MIT_BEREICHEN.flatMap((s) =>
    readdirSync(join(WURZEL, s))
      .filter((e) => statSync(join(WURZEL, s, e)).isDirectory())
      .map((e) => `${s}/${e}`),
  );
}

describe("Rangfolge der Bereiche", () => {
  // Ein neuer Ordner ohne Rang wäre ein Bereich ohne Regel: `rangBereich` liefert für ihn
  // `undefined`, und jeder Bezug von ihm und auf ihn fiele lautlos aus der Prüfung.
  it("jeder Bereichsordner hat einen Rang oder ist ausdrücklich kein Bereich", () => {
    const unbekannt = bereichsordner().filter((o) => {
      const name = o.split("/").pop() ?? o;
      return !(name in RANG) && !(name in ABBILDUNG) && !KEIN_BEREICH.includes(name);
    });
    expect(unbekannt, "diese Ordner brauchen einen Eintrag in RANG, ABBILDUNG oder KEIN_BEREICH").toEqual([]);
    const ohneZiel = Object.entries(ABBILDUNG).filter(([, ziel]) => !(ziel in RANG));
    expect(ohneZiel, "ABBILDUNG zeigt auf einen Bereich ohne Rang").toEqual([]);
  });

  // Wie oben: eine Regel, die nichts sieht, ist grün. Drei Stellen, an denen sie blind
  // werden kann — die Zuordnung der Dateien zu Bereichen, das Sammeln der Bezüge, der
  // Vergleich der Ränge —, und jede hat hier ihren eigenen Beleg.
  it("sieht überhaupt etwas — Bereiche mit Dateien, Bezüge, erlaubte Abwärtsbezüge", () => {
    const ohneDateien = Object.keys(RANG).filter((b) => !DATEIEN.some((d) => rangBereich(d) === b));
    expect(ohneDateien, "diese Bereiche tragen keine einzige Produktivdatei").toEqual([]);
    const alle = bereichsbezuege();
    expect(alle.length, "kein einziger Bezug zwischen Bereichen gefunden").toBeGreaterThan(0);
    // Ein Bezug, der erlaubt sein MUSS und über die Fassade läuft: Rücklagen kennen Konten.
    // Fehlt er, ist die Erkennung blind — und „keine Verstösse" hiesse „nicht hingesehen".
    expect(alle.some((b) => b.von === "ruecklagen" && b.auf === "konten"), "ruecklagen → konten nicht erkannt").toBe(true);
    expect(alle.some((b) => RANG[b.auf] < RANG[b.von]), "kein erlaubter Abwärtsbezug erkannt").toBe(true);
  });

  // Die einzelnen Grenzen prüfen Texte und Bausteine, die Rangfolge den Code. Sagte eine
  // Grenze etwas, das die Rangfolge erlaubt, prüfte niemand mehr den Code dieses Paares.
  it("jede einzelne Grenze steht auch in der Rangfolge", () => {
    const fehlt = MODULGRENZEN.filter((g) => !(RANG[g.kenntNicht] >= RANG[g.bereich])).map(
      (g) => `${g.bereich} ↛ ${g.kenntNicht}`,
    );
    expect(fehlt).toEqual([]);
  });

  // Geprüft wird jeder Bezug einer Produktivdatei des Bereichs — über alle Schichten
  // hinweg: auch eine Rücklage der Anwendung, die einen Typ aus `core/budgets/` über die
  // Fassade holt, kennt Budgets.
  it("ein Bereich bezieht nichts aus einem gleich- oder höherrangigen", () => {
    const geduldet = new Set(RANG_ALTLAST.flatMap((g) => g.eintraege));
    const neu = rangverstoesse()
      .filter((v) => !geduldet.has(v.eintrag))
      .map((v) => `${v.von} (${RANG[v.von]}) → ${v.auf} (${RANG[v.auf]}): ${v.eintrag}`)
      .sort();
    expect(neu).toEqual([]);
  });

  // Die Altlast muss mit jedem Umzug kürzer werden. Ohne diese Prüfung bliebe ein
  // abgebauter Eintrag stehen, und derselbe Bezug könnte später unbemerkt zurückkommen.
  // Und jeder Eintrag steht in der Gruppe seines Paares — sonst stimmt der Satz zum Abbau
  // darüber nicht mehr.
  it("die Altlast der Rangfolge enthält nur, was wirklich noch verletzt, und jeden Eintrag einmal", () => {
    const jetzt = new Map(rangverstoesse().map((v) => [v.eintrag, v]));
    const falsch: string[] = [];
    const gesehen = new Set<string>();
    for (const g of RANG_ALTLAST) {
      for (const e of g.eintraege) {
        if (gesehen.has(e)) falsch.push(`doppelt: ${e}`);
        gesehen.add(e);
        const v = jetzt.get(e);
        if (!v) falsch.push(`verletzt nichts mehr: ${e}`);
        else if (v.von !== g.von || v.auf !== g.auf) falsch.push(`steht unter ${g.von} → ${g.auf}, ist ${v.von} → ${v.auf}: ${e}`);
      }
    }
    expect(falsch).toEqual([]);
  });
});
