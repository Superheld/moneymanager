// Finanzguru-CSV-Adapter — die EINZIGE Stelle mit Wissen über das Finanzguru-Format.
// Übersetzt den Export („Alle Buchungen") in kanonische RohUmsätze. Reines Parsen,
// null Domänenlogik (TAKTIK-IMPORT §6). CSV-Robustheit kommt von papaparse.
//
// Eigenheiten der Datei:
//  - erste Zeile ist Müll („Tabelle 1"), die echte Kopfzeile kommt danach
//  - Trenner „;", deutsche Beträge („-6,55"), Datum „TT.MM.JJJJ"
//  - reich an Zusatzspalten: Buchungs-ID (stabil), Analyse-Unterkategorie, Gläubiger-ID

import Papa from "papaparse";
import { parseBetrag, toIso, type Cent } from "../../core";
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
  betrag: "Betrag",
  waehrung: "Waehrung",
  gegenpartei: "Beguenstigter/Auftraggeber",
  gegenparteiIban: "IBAN Beguenstigter/Auftraggeber",
  zweck: "Verwendungszweck",
  glaeubigerId: "Glaeubiger-ID",
  unterkategorie: "Analyse-Unterkategorie",
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

  const betrag = parseBetrag(r[SP.betrag] ?? "") as Cent | null;
  if (betrag === null) return `Zeile übersprungen: ungültiger Betrag „${r[SP.betrag] ?? ""}"`;

  return {
    buchungstag,
    betrag,
    waehrung: leerZuUndefined(r[SP.waehrung]) ?? "EUR",
    gegenpartei: (r[SP.gegenpartei] ?? "").trim(),
    gegenparteiIban: leerZuUndefined(r[SP.gegenparteiIban]),
    verwendungszweck: (r[SP.zweck] ?? "").trim(),
    kontoIban: leerZuUndefined(r[SP.referenzkonto]),
    glaeubigerId: leerZuUndefined(r[SP.glaeubigerId]),
    quelle: ID,
    nativeId: leerZuUndefined(r[SP.buchungsId]),
    kategorieHinweis: leerZuUndefined(r[SP.unterkategorie]),
  };
}

export const finanzguruAdapter: Quellenadapter = {
  id: ID,
  name: "Finanzguru-Export (CSV)",

  erkennt(inhalt: string): boolean {
    const kopf = inhalt.slice(0, 4000).toLowerCase();
    return kopf.includes("buchungstag;") && kopf.includes("analyse-hauptkategorie");
  },

  lies(inhalt: string): ImportErgebnis {
    const parsed = Papa.parse<Reihe>(abKopfzeile(inhalt), {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });

    const umsaetze: RohUmsatz[] = [];
    const warnungen: string[] = [];
    let splits = 0;

    for (const r of parsed.data) {
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
