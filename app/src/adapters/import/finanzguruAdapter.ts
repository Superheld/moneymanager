// Finanzguru-CSV-Adapter — die EINZIGE Stelle mit Wissen über das Finanzguru-Format.
// Übersetzt den Export („Alle Buchungen") in kanonische RohUmsätze. Reines Parsen,
// null Domänenlogik (TAKTIK-IMPORT §6). CSV-Robustheit kommt von papaparse.
//
// Eigenheiten der Datei:
//  - erste Zeile ist Müll („Tabelle 1"), die echte Kopfzeile kommt danach
//  - Trenner „;", deutsche Beträge („-6,55"), Datum „TT.MM.JJJJ"
//  - reich an Zusatzspalten: Buchungs-ID (stabil), Analyse-Unterkategorie, Gläubiger-ID

import Papa from "papaparse";
import { parseBetrag, toIso, waehrungNachCode, type Cent } from "../../core";
import {
  adapterRegistrieren,
  type ImportErgebnis,
  type Quellenadapter,
  type RohUmsatz,
} from "../../application/import";

const ID = "finanzguru";

// Exakte Spaltennamen aus dem Finanzguru-Export.
const SP = {
  buchungstag: "Buchungstag",
  referenzkonto: "Referenzkonto",
  kontoName: "Name Referenzkonto",
  betrag: "Betrag",
  waehrung: "Waehrung",
  gegenpartei: "Beguenstigter/Auftraggeber",
  gegenparteiIban: "IBAN Beguenstigter/Auftraggeber",
  zweck: "Verwendungszweck",
  glaeubigerId: "Glaeubiger-ID",
  unterkategorie: "Analyse-Unterkategorie",
  umbuchung: "Analyse-Umbuchung",
  buchungsId: "Buchungs-ID",
  splitTyp: "Split-Typ",
} as const;

type Reihe = Record<string, string>;

/** „TT.MM.JJJJ" → ISO „JJJJ-MM-TT". null bei unplausiblem Datum. */
function parseFgDatum(text: string): string | null {
  const m = text?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return toIso({ y, m: mo, d });
}

function leerZuUndefined(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** Entfernt führende Nicht-Kopf-Zeilen (z. B. „Tabelle 1"), startet bei der echten Kopfzeile. */
function abKopfzeile(inhalt: string): string {
  const ohneBom = inhalt.replace(/^﻿/, "");
  const zeilen = ohneBom.split(/\r?\n/);
  const start = zeilen.findIndex((z) => z.startsWith(SP.buchungstag + ";"));
  return start <= 0 ? ohneBom : zeilen.slice(start).join("\n");
}

function reiheZuRohUmsatz(r: Reihe): RohUmsatz | string {
  const buchungstag = parseFgDatum(r[SP.buchungstag] ?? "");
  if (!buchungstag) return `Zeile übersprungen: ungültiges Datum „${r[SP.buchungstag] ?? ""}"`;

  // Mit der Währung DER ZEILE parsen, nicht mit der EUR-Vorgabe: bei einer Skala-0-
  // Währung (JPY, KWD) läse die Vorgabe "1200" als 120000 Minor Units.
  const waehrung = leerZuUndefined(r[SP.waehrung]) ?? "EUR";
  const betrag = parseBetrag(r[SP.betrag] ?? "", waehrungNachCode(waehrung)) as Cent | null;
  if (betrag === null) return `Zeile übersprungen: ungültiger Betrag „${r[SP.betrag] ?? ""}"`;

  return {
    buchungstag,
    betrag,
    waehrung,
    gegenpartei: (r[SP.gegenpartei] ?? "").trim(),
    gegenparteiIban: leerZuUndefined(r[SP.gegenparteiIban]),
    verwendungszweck: (r[SP.zweck] ?? "").trim(),
    kontoIban: leerZuUndefined(r[SP.referenzkonto]),
    kontoName: leerZuUndefined(r[SP.kontoName]),
    glaeubigerId: leerZuUndefined(r[SP.glaeubigerId]),
    istUmbuchung: (r[SP.umbuchung] ?? "").trim().toLowerCase() === "ja",
    quelle: ID,
    nativeId: leerZuUndefined(r[SP.buchungsId]),
    kategorieHinweis: leerZuUndefined(r[SP.unterkategorie]),
  };
}

/**
 * Übersetzt strukturelle Parser-Schäden in Warnungen für den Nutzer.
 *
 * Wichtigster Fall: ein nicht geschlossenes Anführungszeichen („MissingQuotes"). Papaparse
 * liest den gesamten Rest der Datei dann als EIN Feld — ohne diese Auswertung meldet der
 * Import „1 Umsatz, 0 Warnungen", während der Rest der Datei verschwunden ist.
 *
 * Bewusst wird NICHT versucht, die Datei zu retten (etwa durch erneutes Parsen ohne
 * Quoting): Dateien mit legitim gequoteten Feldern — ein Semikolon im Verwendungszweck
 * genügt — würden dabei zerrissen, und aus einem sichtbaren Schaden würde ein stiller.
 * Lieber laut scheitern und den Nutzer die Datei reparieren lassen.
 */
function parserWarnungen(nutzteil: string, parsed: Papa.ParseResult<Reihe>): string[] {
  const warnungen: string[] = [];
  const gemeldet = new Set<string>();

  for (const f of parsed.errors) {
    if (gemeldet.has(f.code)) continue;
    gemeldet.add(f.code);
    warnungen.push(
      f.type === "Quotes"
        ? "Datei beschädigt: ein Anführungszeichen wird nicht geschlossen — alles danach konnte nicht gelesen werden."
        : `Datei-Warnung: ${f.message}`,
    );
  }

  // Zweiter, unabhängiger Wächter: Datenzeilen zählen. Fängt auch Verluste ab, die
  // papaparse nicht als Fehler meldet.
  const datenzeilen = nutzteil
    .split(/\r?\n/)
    .slice(1)
    .filter((z) => z.trim() !== "").length;
  if (datenzeilen > parsed.data.length) {
    warnungen.push(
      `${datenzeilen - parsed.data.length} von ${datenzeilen} Datenzeilen konnten nicht gelesen werden.`,
    );
  }

  return warnungen;
}

export const finanzguruAdapter: Quellenadapter = {
  id: ID,
  name: "Finanzguru-Export (CSV)",

  erkennt(inhalt: string): boolean {
    const kopf = inhalt.slice(0, 4000).toLowerCase();
    return kopf.includes("buchungstag;") && kopf.includes("analyse-hauptkategorie");
  },

  lies(inhalt: string): ImportErgebnis {
    const nutzteil = abKopfzeile(inhalt);
    const parsed = Papa.parse<Reihe>(nutzteil, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });

    const umsaetze: RohUmsatz[] = [];
    const warnungen: string[] = [...parserWarnungen(nutzteil, parsed)];
    let splits = 0;

    // Nur strukturell zerstörte Zeilen werden übersprungen — das sind die Quoting-Fehler:
    // dort trägt die Zeile den verschluckten Rest der Datei im Feldinhalt und würde den
    // rohHash vergiften. Ein FieldMismatch (z. B. ein Semikolon im Verwendungszweck)
    // ist dagegen lesbar und wird nur gemeldet, nicht verworfen.
    //
    // Erkannt wird die betroffene Zeile am eingeschluckten Zeilenumbruch, nicht über
    // `error.row`: papaparse zählt dort Quellzeilen, nicht den Index in `data` — die
    // beiden laufen auseinander, sobald eine Zeile mehrere verschluckt.
    const quotingKaputt = parsed.errors.some((f) => f.type === "Quotes");

    for (const r of parsed.data) {
      if (quotingKaputt && Object.values(r).some((w) => typeof w === "string" && w.includes("\n"))) {
        continue;
      }
      if (leerZuUndefined(r[SP.splitTyp])) splits++;
      const ergebnis = reiheZuRohUmsatz(r);
      if (typeof ergebnis === "string") warnungen.push(ergebnis);
      else umsaetze.push(ergebnis);
    }

    if (splits > 0) {
      warnungen.push(`${splits} Split-Buchung(en) erkannt — Mehrfachzählung wird in Slice 2 behandelt.`);
    }

    return { quelle: ID, umsaetze, warnungen };
  },
};

// Selbst-Registrierung: Import dieses Moduls macht den Adapter bekannt.
adapterRegistrieren(finanzguruAdapter);
