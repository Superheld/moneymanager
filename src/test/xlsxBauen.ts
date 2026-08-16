// Test-Werkzeug: baut aus Zeilen eine ECHTE .xlsx (ZIP + XML).
//
// Bewusst kein Attrappen-Leser: die Tests sollen denselben Weg nehmen wie die App —
// entpacken, XML lesen, Zellen zuordnen. Ein Fehler im Leser (falsche Spaltenzuordnung
// bei Leerzellen, verlorene Entities) soll hier auffallen und nicht erst an einer echten
// Datei, die im Repo nichts zu suchen hat.
//
// Diese Datei ist Test-Werkzeug und aus der Coverage ausgenommen.

import { zipSync, strToU8 } from "fflate";

/** 0-basierter Index → Spaltenreferenz („A", „Z", „AA"). */
function spalte(index: number): string {
  let ref = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    ref = String.fromCharCode(65 + ((n - 1) % 26)) + ref;
  }
  return ref;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Eine Zelle. Werte, die wie eine Zahl aussehen, werden als Zahl abgelegt (wie Excel es
 * täte) — nur so entstehen im Test dieselben Rohwerte wie in einer echten Datei
 * (Datum als Seriennummer, Betrag als „-5.3").
 *
 * `null` erzeugt GAR KEINE Zelle: Excel lässt leere Zellen weg, und genau daran scheitert
 * ein Leser, der Zellen nur abzählt statt ihre Referenz auszuwerten.
 */
function zelle(wert: string | null, ref: string): string {
  if (wert === null) return "";
  if (/^-?\d+(\.\d+)?$/.test(wert)) return `<c r="${ref}"><v>${wert}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(wert)}</t></is></c>`;
}

/** Baut eine minimale, aber gültige xlsx mit einem Blatt. */
export function xlsxAusZeilen(zeilen: (string | null)[][]): Uint8Array {
  const rows = zeilen
    .map((z, i) => `<row r="${i + 1}">${z.map((w, j) => zelle(w, `${spalte(j)}${i + 1}`)).join("")}</row>`)
    .join("");

  const sheet =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows}</sheetData></worksheet>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<workbookPr date1904="false"/><sheets><sheet name="Tabelle1" r:id="rId1" sheetId="1"/></sheets></workbook>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `</Types>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "xl/workbook.xml": strToU8(workbook),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}
