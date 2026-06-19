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
 * Parst eingetippten Text → Minor Units. Locale-unabhängig und nachsichtig: der
 * RECHTESTE Trenner („." oder „,") gilt als Dezimaltrenner, alles davor ist
 * Gruppierung und fliegt raus. So funktionieren „1.234,56" und „1,234.56" und „12,5"
 * und „12.5" gleichermaßen. Gibt null bei leerer/unparsebarer Eingabe.
 */
export function parseBetrag(text: string, w: Waehrung = STANDARD_WAEHRUNG): Cent | null {
  const bereinigt = text.trim().replace(/[^0-9.,-]/g, "");
  if (!bereinigt) return null;
  const negativ = bereinigt.startsWith("-");
  const ziffern = bereinigt.replace(/-/g, "");
  const trenner = Math.max(ziffern.lastIndexOf(","), ziffern.lastIndexOf("."));
  let normalisiert: string;
  if (trenner === -1) {
    normalisiert = ziffern;
  } else {
    const vor = ziffern.slice(0, trenner).replace(/[.,]/g, "");
    const nach = ziffern.slice(trenner + 1);
    normalisiert = vor + "." + nach;
  }
  if (normalisiert === "" || normalisiert === ".") return null;
  const zahl = Number(normalisiert);
  if (!Number.isFinite(zahl)) return null;
  return majorZuMinor(negativ ? -zahl : zahl, w);
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
