// Minimaler XLSX-Leser — genug für Tabellen-Exporte, nicht mehr.
//
// Eine .xlsx ist ein ZIP mit XML darin. Gelesen wird ausschließlich das ERSTE Blatt und
// daraus nur der Zellinhalt als Text; Formeln, Formate, Farben, mehrere Blätter und
// alles Weitere interessieren hier nicht. Zahlen kommen als Rohtext heraus („46251",
// „-5.32") — was ein Datum und was ein Betrag ist, weiß der jeweilige Quellenadapter,
// nicht dieser Leser.
//
// Warum kein SheetJS: die letzte auf npm veröffentlichte Fassung (0.18.5) trägt zwei
// High-Advisories ohne Fix, neuere gibt es nur über ein eigenes CDN. Für einen Lesevorgang
// über ein bekanntes Format ist das ein schlechter Tausch. `fflate` übernimmt hier nur das
// Entpacken (Deflate ist nichts, was man selbst schreiben sollte).

import { unzipSync } from "fflate";

/** Erstes Arbeitsblatt als Zeilen von Zellen; Zeile 0 ist die Kopfzeile. */
export type XlsxZeilen = string[][];

const SHEET = "xl/worksheets/sheet1.xml";
const SHARED = "xl/sharedStrings.xml";

/**
 * Spaltenreferenz („A", „AB") → 0-basierter Index.
 *
 * Notwendig, weil Excel LEERE Zellen einfach weglässt: eine Zeile kann von A direkt nach
 * C springen. Wer die Zellen nur der Reihe nach abzählt, verschiebt ab da die ganze Zeile
 * und ordnet jeden Wert der falschen Spalte zu.
 */
function spaltenIndex(referenz: string): number {
  let index = 0;
  for (const zeichen of referenz) {
    const wert = zeichen.charCodeAt(0) - 64; // "A" → 1
    if (wert < 1 || wert > 26) break; // ab der Zeilennummer aufhören
    index = index * 26 + wert;
  }
  return index - 1;
}

/** Die fünf vordefinierten XML-Entities zurückübersetzen („Essen &amp; Trinken"). */
function entities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&"); // zuletzt, sonst würde „&amp;lt;" doppelt aufgelöst
}

/** Alle `<t>…</t>`-Inhalte eines Fragments, verkettet (Rich Text besteht aus mehreren). */
function textAus(fragment: string): string {
  let text = "";
  for (const m of fragment.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
  return entities(text);
}

/** Die geteilte Zeichenkettentabelle, sofern die Datei eine benutzt. */
function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textAus(m[1]));
}

/**
 * Liest das erste Blatt. Liefert `null`, wenn die Datei kein ZIP mit Arbeitsblatt ist —
 * damit kann der Aufrufer „ist nicht mein Format" von „ist kaputt" unterscheiden, ohne
 * eine Ausnahme zu fangen.
 */
export function xlsxLesen(datei: Uint8Array): XlsxZeilen | null {
  // ZIP-Signatur „PK\x03\x04" — billig, und erspart fflate das Werfen bei CSV & Co.
  if (datei.length < 4 || datei[0] !== 0x50 || datei[1] !== 0x4b) return null;

  let dateien: Record<string, Uint8Array>;
  try {
    dateien = unzipSync(datei, { filter: (f) => f.name === SHEET || f.name === SHARED });
  } catch {
    return null;
  }
  if (!dateien[SHEET]) return null;

  const dekodierer = new TextDecoder("utf-8");
  const blatt = dekodierer.decode(dateien[SHEET]);
  const geteilt = sharedStrings(dateien[SHARED] && dekodierer.decode(dateien[SHARED]));

  const zeilen: XlsxZeilen = [];
  for (const zeile of blatt.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const zellen: string[] = [];
    for (const zelle of zeile[1].matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, referenz, attribute, inhalt = ""] = zelle;
      const typ = /t="([^"]+)"/.exec(attribute)?.[1];
      const wert =
        typ === "inlineStr"
          ? textAus(inhalt)
          : typ === "s"
            ? geteilt[Number(/<v>(\d+)<\/v>/.exec(inhalt)?.[1] ?? -1)] ?? ""
            : entities(/<v>([\s\S]*?)<\/v>/.exec(inhalt)?.[1] ?? "");

      const index = spaltenIndex(referenz);
      while (zellen.length < index) zellen.push(""); // übersprungene Leerzellen auffüllen
      zellen[index] = wert;
    }
    zeilen.push(zellen);
  }
  return zeilen;
}

/**
 * Excel-Seriennummer → ISO-Datum. `null`, wenn die Zahl kein plausibles Datum ist.
 *
 * Tag 1 ist der 1900-01-01, aber Excel hält 1900 fälschlich für ein Schaltjahr — deshalb
 * ist der Bezugspunkt für alles ab März 1900 der 1899-12-30. Die Dateien tragen
 * `date1904="false"`; das alternative 1904-System wird hier NICHT unterstützt, ein
 * stillschweigend um vier Jahre verschobenes Datum wäre schlimmer als gar keins.
 */
export function serienDatum(wert: string): string | null {
  const zahl = Number(wert);
  // Untergrenze 60: davor liegt der Schaltjahr-Bug, und so alte Buchungen gibt es nicht.
  if (!Number.isFinite(zahl) || zahl < 60 || zahl > 2_958_465) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(zahl) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
