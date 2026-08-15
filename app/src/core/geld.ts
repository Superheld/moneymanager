// Geldbetrag — Value Object. Intern in ganzen Minor Units (Integer), nie Float-Major,
// damit keine Rundungsfehler durch binäre Gleitkommazahlen entstehen.
// Vorzeichen trägt die Richtung: negativ = Abfluss, positiv = Zufluss.
//
// Währungs-/locale-fähig (ADR-0004): die reinen Funktionen nehmen Währung + Locale
// als Argument, hartcodiert ist nichts. Die alten EUR-Helfer (euroZuCent etc.) bleiben
// als dünne Back-compat-Schicht erhalten, bis alle Screens auf die Haushaltswährung
// umgestellt sind.

import { STANDARD_WAEHRUNG, type Waehrung } from "./waehrung";

export type Cent = number; // Minor Units. Name historisch beibehalten.

/** Umrechnungsfaktor Major↔Minor: 10^Skala (EUR = 100, JPY = 1, KWD = 1000). */
function faktor(w: Waehrung): number {
  return 10 ** w.skala;
}

/** Major (z. B. 120.5) → Minor Units. Rundet kaufmännisch auf die kleinste Einheit. */
/**
 * Ist der Wert ein verwendbarer Geldbetrag in Minor Units?
 *
 * Die Invariante „Geld = Integer Cent, nie Float" (CLAUDE.md) hatte an der Anwendungs-
 * grenze keinen Wächter: die Use-Cases prüften nur `> 0`, womit sowohl 10.5 als auch
 * Infinity durchkamen. Ein Float im Ledger bricht danach jede Summe (10.1 + 20.2 =
 * 30.299999999999997), und Infinity vergiftet jeden Saldo, in den er eingeht.
 *
 * Deshalb hier zentral: endlich, ganzzahlig, innerhalb des sicheren Integer-Bereichs.
 */
export function istCent(wert: unknown): wert is Cent {
  return typeof wert === "number" && Number.isSafeInteger(wert);
}

export function majorZuMinor(value: number, w: Waehrung = STANDARD_WAEHRUNG): Cent {
  return Math.round(value * faktor(w));
}

/** Minor Units → Major als Zahl (z. B. 12050 → 120.5 bei Skala 2). */
export function minorZuMajor(cent: Cent, w: Waehrung = STANDARD_WAEHRUNG): number {
  return cent / faktor(w);
}

/**
 * Währungssymbol für Code + Locale (z. B. EUR/de-DE → „€", USD/en-US → „$").
 * Über Intl ermittelt; fällt auf den Code zurück, falls kein Symbol auflösbar ist.
 */
export function waehrungssymbol(w: Waehrung, locale = "de-DE"): string {
  const teile = new Intl.NumberFormat(locale, { style: "currency", currency: w.code })
    .formatToParts(0);
  return teile.find((p) => p.type === "currency")?.value ?? w.code;
}

export interface FormatOptionen {
  waehrung?: Waehrung;
  /** BCP-47, z. B. "de-DE" oder "en-US". Bestimmt Gruppierung und Dezimaltrenner. */
  locale?: string;
  /** Bei positiven Beträgen ein „+" voranstellen (für Saldo-Deltas). */
  mitVorzeichen?: boolean;
}

/**
 * Formatiert Minor Units als reinen Betrag (Gruppierung, „−" U+2212 statt Bindestrich),
 * OHNE Währungssymbol — das setzt die UI separat (formatBetragMitSymbol oder eigenes €).
 * Nachkommastellen richten sich nach der Skala der Währung.
 */
export function geldFormatieren(cent: Cent, opt: FormatOptionen = {}): string {
  const w = opt.waehrung ?? STANDARD_WAEHRUNG;
  const locale = opt.locale ?? "de-DE";
  const negativ = cent < 0;
  const betrag = Math.abs(cent) / faktor(w);
  const s = betrag.toLocaleString(locale, {
    minimumFractionDigits: w.skala,
    maximumFractionDigits: w.skala,
  });
  if (negativ) return "−" + s;
  return opt.mitVorzeichen ? "+" + s : s;
}

/**
 * Formatiert Minor Units MIT Währungssymbol über Intl (Symbol + Position je Locale).
 * Das „−" wird zu U+2212 normalisiert, konsistent mit geldFormatieren.
 */
export function geldFormatierenMitSymbol(cent: Cent, opt: FormatOptionen = {}): string {
  const w = opt.waehrung ?? STANDARD_WAEHRUNG;
  const locale = opt.locale ?? "de-DE";
  const betrag = Math.abs(cent) / faktor(w);
  const s = betrag.toLocaleString(locale, {
    style: "currency",
    currency: w.code,
    minimumFractionDigits: w.skala,
    maximumFractionDigits: w.skala,
  });
  if (cent < 0) return "−" + s;
  return opt.mitVorzeichen ? "+" + s : s;
}

/**
 * Parst eingetippten Text → Minor Units. Locale-unabhängig: der RECHTESTE Trenner
 * („." oder „,") gilt als Dezimaltrenner, alles davor ist Gruppierung. So funktionieren
 * „1.234,56", „1,234.56", „12,5" und „12.5" gleichermaßen.
 *
 * Erkannte Vorzeichen — alle vor dem Filtern ausgewertet, damit keines verloren geht:
 * führendes und NACHGESTELLTES Minus (Standard in Bank-, DATEV- und Excel-Exporten),
 * ASCII „-" wie typografisches „−" (U+2212, das Zeichen, das geldFormatieren selbst
 * ausgibt), sowie die buchhalterische Klammer-Notation „(1.234,56)".
 *
 * Bewusst STRENG statt nachsichtig: unplausible Zifferngruppen („12,34,56", „1.2.3"),
 * eingebettete Vorzeichen („1-2"), Exponentialschreibweise („1e3") und Ergebnisse
 * jenseits des sicheren Integer-Bereichs liefern null. Der Vertrag ist „null bei
 * unparsebarer Eingabe", und der Import wertet null als sichtbar übersprungene Zeile —
 * ein still danebenliegender Betrag ist schlimmer als eine gemeldete Lücke.
 *
 * Nicht angetastet: „1.234" bleibt 1,234 (= 123 Minor Units). Der rechteste Trenner
 * gewinnt auch dann; das ist der hier bewusst gewählte Tradeoff, kein Versehen.
 */
export function parseBetrag(text: string, w: Waehrung = STANDARD_WAEHRUNG): Cent | null {
  let rest = text.trim();
  if (!rest) return null;

  let negativ = false;

  // 1. Klammer-Notation: (1.234,56) === −1.234,56
  const klammer = /^\((.*)\)$/.exec(rest);
  if (klammer) {
    negativ = true;
    rest = klammer[1].trim();
  }

  // 2. Vorzeichen vorne ODER hinten, ASCII-Minus wie U+2212.
  const vorne = /^([-−+])\s*/.exec(rest);
  if (vorne) {
    negativ = negativ !== (vorne[1] !== "+");
    rest = rest.slice(vorne[0].length);
  }
  const hinten = /\s*([-−+])$/.exec(rest);
  if (hinten) {
    negativ = negativ !== (hinten[1] !== "+");
    rest = rest.slice(0, hinten.index);
  }

  // 3. Reine Darstellungszeichen entfernen: Leerraum, geschütztes Leerzeichen,
  //    Apostroph-Gruppierung (1'234'567), Währungssymbole.
  rest = rest.replace(/[\s '’]/g, "").replace(/[€$£¥]/g, "");
  if (!rest) return null;

  // 4. Ab hier sind nur noch Ziffern und Trenner zulässig — alles andere ist Müll
  //    und wird gemeldet statt weggefiltert (fängt „1-2", „1e3", „12,-").
  if (!/^\d+([.,]\d+)*$/.test(rest)) return null;

  // 5. Zifferngruppen prüfen: bei drei oder mehr Teilen muss jede mittlere Gruppe
  //    genau drei Ziffern haben, sonst ist es keine Gruppierung, sondern Müll
  //    („12,34,56", „1.2.3"). Bei genau zwei Teilen gilt der Tradeoff aus dem
  //    Funktionskopf: der rechte Teil ist die Nachkommastelle.
  const teile = rest.split(/[.,]/);
  if (teile.length > 2) {
    for (const gruppe of teile.slice(1, -1)) {
      if (gruppe.length !== 3) return null;
    }
  }

  const normalisiert =
    teile.length === 1 ? teile[0] : teile.slice(0, -1).join("") + "." + teile[teile.length - 1];

  const zahl = Number(normalisiert);
  if (!Number.isFinite(zahl)) return null;

  const minor = majorZuMinor(negativ ? -zahl : zahl, w);
  // 6. Jenseits des sicheren Integer-Bereichs ist jede spätere Summe unbrauchbar —
  //    lieber gar kein Wert als ein lautlos gerundeter.
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

// ── EUR-Back-compat (deprecated) ───────────────────────────────────────────────
// Bestehende Screens/Use-Cases, die noch nicht auf die Haushaltswährung umgestellt
// sind, nutzen diese EUR/de-DE-festen Helfer weiter. Bei der Migration eines Screens
// werden sie durch majorZuMinor/parseBetrag/geldFormatieren mit der Haushaltswährung
// ersetzt. Kein neuer Code soll sie verwenden.

/** @deprecated EUR-fest. Nutze majorZuMinor(value, haushaltsWaehrung). */
export function euroZuCent(euro: number): Cent {
  return majorZuMinor(euro, STANDARD_WAEHRUNG);
}

/** @deprecated EUR-fest. Nutze minorZuMajor(cent, haushaltsWaehrung). */
export function centZuEuro(cent: Cent): number {
  return minorZuMajor(cent, STANDARD_WAEHRUNG);
}

/** @deprecated EUR/de-DE-fest. Nutze geldFormatieren(cent, { waehrung, locale }). */
export function formatBetrag(cent: Cent, mitVorzeichen = false): string {
  return geldFormatieren(cent, { mitVorzeichen });
}
