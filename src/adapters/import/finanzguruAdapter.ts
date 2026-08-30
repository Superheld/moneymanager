// Finanzguru-Adapter — die EINZIGE Stelle mit Wissen über das Finanzguru-Format.
// Übersetzt den Export („Alle Buchungen") in kanonische RohUmsätze. Reines Parsen,
// null Domänenlogik (TAKTIK-IMPORT §6).
//
// **Eine Übersetzung ist keine Domänenlogik**, und deshalb steht die Kategorien-Tabelle
// daneben (`finanzguruKategorien.ts`) und nicht in der Anwendungsschicht: sie entscheidet
// nichts über eine Buchung, sie überträgt Finanzgurus Vokabular in unseres. Was daraus
// wird, entscheidet die Kategorisierungskette — und die kennt Finanzguru nicht.
//
// **Seit 2026-08-16 xlsx statt CSV** — Finanzguru bietet nichts anderes mehr an. Die
// Spaltennamen sind dabei unverändert geblieben, die WERTE nicht:
//  - Datum als Excel-Seriennummer („46251"), nicht mehr „TT.MM.JJJJ"
//  - Beträge in englischer Notation („-5.3" = −5,30), nicht mehr „-5,30"
//  - keine Vorspannzeile mehr; Zeile 1 IST die Kopfzeile
// `parseFgDatum` bleibt als Rückfall für Textdaten stehen — Excel-Zellen können
// formatiert oder als Text abgelegt sein, und beides kostet hier nichts.
//
// Unverändert: reich an Zusatzspalten — Buchungs-ID (stabil), Analyse-Unterkategorie,
// Gläubiger-ID.

import { parseBetrag, tageImMonat, toIso, waehrungNachCode, type Cent } from "../../core";
import { serienDatum, xlsxLesen } from "./xlsx";
import { unsereKategorieFuer } from "./finanzguruKategorien";
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
  mandatsreferenz: "Mandatsreferenz",
  umsatzart: "Analyse-Umsatzart",
  unterkategorie: "Analyse-Unterkategorie",
  umbuchung: "Analyse-Umbuchung",
  buchungsId: "Buchungs-ID",
  splitTyp: "Split-Typ",
  originalId: "Referenz-Original-ID",
} as const;

/** Split-Typen, die TEILE einer anderen Buchung sind — nicht die Buchung selbst. */
const TEIL_TYPEN = new Set(["Teilbuchung", "Restbetrag"]);

type Reihe = Record<string, string>;

/** „TT.MM.JJJJ" → ISO „JJJJ-MM-TT". null bei unplausiblem Datum. */
function parseFgDatum(text: string): string | null {
  const m = text?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  // Monatslänge prüfen, nicht nur 1..31: „31.02.2026" ergab sonst den Buchungstag
  // „2026-02-31". In der Tagesarithmetik ist das der 3. März, in Sortierung und
  // Monatsgruppierung bleibt es Februar — dieselbe Buchung lag je nach Auswertung
  // in zwei verschiedenen Monaten.
  if (mo < 1 || mo > 12 || d < 1 || d > tageImMonat(y, mo)) return null;
  return toIso({ y, m: mo, d });
}

function leerZuUndefined(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function reiheZuRohUmsatz(r: Reihe): RohUmsatz | string {
  const roh = r[SP.buchungstag] ?? "";
  const buchungstag = serienDatum(roh) ?? parseFgDatum(roh);
  if (!buchungstag) return `Zeile übersprungen: ungültiges Datum „${roh}"`;

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
    // Zwei Spalten, die der Export von Anfang an mitbrachte und die wir bis 2026-08-18
    // weggeworfen haben. Die Mandatsreferenz ist der Grund für die Nachlese: zusammen
    // mit der Gläubiger-ID ist sie der einzige von der BANK vergebene Schlüssel, den
    // beide Quellen tragen — damit erkennt der Dublettenfinder dieselbe Lastschrift
    // ohne jede Textähnlichkeit. Die Umsatzart („Kartenzahlung") ist Anzeigewert;
    // sie wird bewusst NICHT zum Abgleich benutzt, weil die Bank ein anderes Vokabular
    // verwendet („KARTENVERFÜGUNG").
    //
    // Was der Export sonst noch führt, bleibt draußen: `E-Ref` ist in jeder geprüften
    // Zeile leer, `Kontostand` gehört an das Konto und nicht an die Buchung, und die
    // `Analyse-*`-Spalten sind Finanzgurus eigene Auswertung — die machen wir selbst.
    mandatsreferenz: leerZuUndefined(r[SP.mandatsreferenz]),
    umsatzart: leerZuUndefined(r[SP.umsatzart]),
    istUmbuchung: (r[SP.umbuchung] ?? "").trim().toLowerCase() === "ja",
    quelle: ID,
    nativeId: leerZuUndefined(r[SP.buchungsId]),
    kategorieHinweis: leerZuUndefined(r[SP.unterkategorie]),
    // Was Finanzguru sagt, bleibt oben stehen; hier steht, was es bei UNS heisst. Die
    // Tabelle liegt daneben (`finanzguruKategorien.ts`) und ist das einzige Stueck
    // Uebersetzung im Adapter — sie entscheidet nichts, sie traegt ein fremdes Vokabular
    // in unseres.
    kategorieVorschlag: unsereKategorieFuer(leerZuUndefined(r[SP.unterkategorie])),
  };
}

/**
 * Sucht die Kopfzeile und macht aus den Datenzeilen benannte Reihen.
 *
 * Gesucht wird nach den SPALTENNAMEN, nicht nach Position: die Kopfzeile ist zwar
 * inzwischen Zeile 1, aber der Adapter mappt überall nach Namen, und eine Datei mit
 * Vorspann soll daran nicht scheitern. Liefert `null`, wenn keine Kopfzeile zu finden ist.
 */
function reihen(zeilen: string[][]): Reihe[] | null {
  const kopfIndex = zeilen.findIndex(
    (z) => z.includes(SP.buchungstag) && z.includes(SP.betrag),
  );
  if (kopfIndex < 0) return null;

  const kopf = zeilen[kopfIndex];
  return zeilen
    .slice(kopfIndex + 1)
    .filter((z) => z.some((w) => w.trim() !== "")) // Leerzeilen am Blattende
    .map((z) => Object.fromEntries(kopf.map((name, i) => [name, z[i] ?? ""])));
}

export const finanzguruAdapter: Quellenadapter = {
  id: ID,
  name: "Finanzguru-Export (Excel)",

  erkennt(datei: Uint8Array): boolean {
    const zeilen = xlsxLesen(datei);
    if (!zeilen) return false;
    // Fingerabdruck über die Kopfzeile, wie zuvor bei CSV — nur ohne Trennzeichen.
    const kopf = zeilen.slice(0, 20).flat().join("|").toLowerCase();
    return kopf.includes("buchungstag") && kopf.includes("analyse-hauptkategorie");
  },

  lies(datei: Uint8Array): ImportErgebnis {
    const zeilen = xlsxLesen(datei);
    if (!zeilen) {
      return { quelle: ID, umsaetze: [], warnungen: ["Die Datei ist keine lesbare Excel-Datei."] };
    }
    const daten = reihen(zeilen);
    if (!daten) {
      return {
        quelle: ID,
        umsaetze: [],
        warnungen: [`Keine Kopfzeile gefunden — „${SP.buchungstag}" und „${SP.betrag}" fehlen.`],
      };
    }

    const umsaetze: RohUmsatz[] = [];
    const warnungen: string[] = [];

    // Split-Buchungen stehen DOPPELT in der Datei: die Originalbuchung mit dem vollen
    // Betrag UND ihre Teile („Teilbuchung", „Restbetrag"), die zusammen denselben Betrag
    // ergeben. Wer beides importiert, zählt jeden gesplitteten Umsatz zweimal.
    //
    // Verworfen werden die TEILE, nicht das Original: das Original trägt den Betrag, der
    // tatsächlich vom Konto ging, und ist der Anker für Saldo und Dedup. Verworfen wird
    // aber nur, wenn das Original wirklich in dieser Datei steht — bei einem Export mit
    // Zeitraumfilter kann es fehlen, und dann wäre ein stiller Verlust schlimmer als eine
    // doppelte Zeile.
    //
    // Die Kategorien der Teile gehen dabei verloren. Das Datenmodell trägt sie inzwischen
    // (S-7, `IstBuchung.aufteilungen`); sie durch die Import-Pipeline zu reichen, ist ein
    // eigener Schritt.
    const vorhandeneIds = new Set(daten.map((r) => r[SP.buchungsId]).filter(Boolean));
    let verworfen = 0;
    let ohneOriginal = 0;

    for (const r of daten) {
      const typ = leerZuUndefined(r[SP.splitTyp]);
      if (typ && TEIL_TYPEN.has(typ)) {
        const original = leerZuUndefined(r[SP.originalId]);
        if (original && vorhandeneIds.has(original)) {
          verworfen++;
          continue;
        }
        ohneOriginal++;
      }
      const ergebnis = reiheZuRohUmsatz(r);
      if (typeof ergebnis === "string") warnungen.push(ergebnis);
      else umsaetze.push(ergebnis);
    }

    if (verworfen > 0) {
      warnungen.push(
        `${verworfen} Teilbuchung(en) übersprungen — sie sind Aufteilungen bereits enthaltener Buchungen und würden doppelt zählen.`,
      );
    }
    if (ohneOriginal > 0) {
      warnungen.push(
        `${ohneOriginal} Teilbuchung(en) ohne zugehörige Originalbuchung übernommen — bitte prüfen.`,
      );
    }

    return { quelle: ID, umsaetze, warnungen };
  },
};

// Selbst-Registrierung: Import dieses Moduls macht den Adapter bekannt.
adapterRegistrieren(finanzguruAdapter);
