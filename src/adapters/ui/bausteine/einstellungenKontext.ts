// Kontext, Hooks und Helfer rund um die Haushaltseinstellungen (ADR-0004).
//
// Warum getrennt von `EinstellungenProvider.tsx`: React Fast Refresh kann eine Datei nur
// partiell austauschen, wenn sie ausschließlich Komponenten exportiert. Standen die Hooks
// und `fehlerNachricht` daneben, meldete Vite bei jeder Änderung
// „Could not Fast Refresh (\"fehlerNachricht\" export is incompatible)" und lud die Seite
// komplett neu — und weil praktisch jeder Screen hier importiert, hing der ganze UI-Baum
// mit drin. Die Trennung ist der Grund, nicht Ordnungsliebe.
//
// Die reine Geld-Logik bleibt im Kern (geld.ts) und kommt über die Anwendungsschicht
// herein — Formatieren und Parsen sind Vokabular, keine Entscheidung. `useGeld` bindet
// sie nur an die eine Haushaltswährung, damit die Screens nicht überall Währung + Locale
// durchreichen müssen.

import { createContext, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FachlicherFehler,
  EXPERIMENTE_AUS,
  STANDARD_EINSTELLUNGEN,
  geldFormatieren,
  geldFormatierenMitSymbol,
  parseBetrag,
  waehrungssymbol,
  type Cent,
  type Charakter,
  type FormatOptionen,
  type ExperimentId,
  type Experimente,
  type Haushaltseinstellungen,
} from "../../../application";

export interface ContextWert {
  einstellungen: Haushaltseinstellungen;
  /** Region wechseln (speichert die Locale, lädt neu, schaltet die UI-Sprache um). */
  regionSetzen: (locale: string) => Promise<void>;
  /**
   * Welche experimentellen Funktionen eingeschaltet sind.
   *
   * Steht hier und nicht in `einstellungen`, weil es zwei verschiedene Fragen sind: die
   * Einstellungen sagen, was der HAUSHALT ist, der Schalter, was das PROGRAMM anbietet.
   * Getragen wird beides vom selben Provider, weil beides denselben Anspruch hat — es
   * muss VOR dem ersten Rendern feststehen. Ein Experiment, das kurz aufblitzt und dann
   * verschwindet, ist schlimmer als eines, das gar nicht da ist.
   */
  experimente: Experimente;
  /** Ein Experiment ein- oder ausschalten (speichert und lädt den Stand neu). */
  experimentSetzen: (id: ExperimentId, an: boolean) => Promise<void>;
}

export const EinstellungenContext = createContext<ContextWert>({
  einstellungen: STANDARD_EINSTELLUNGEN,
  regionSetzen: async () => {},
  experimente: EXPERIMENTE_AUS,
  experimentSetzen: async () => {},
});

export function useEinstellungen(): Haushaltseinstellungen {
  return useContext(EinstellungenContext).einstellungen;
}

/**
 * Der Stand der Experimente — für jede Stelle, die etwas nur zeigen darf, wenn es
 * eingeschaltet ist.
 */
export function useExperimente(): Experimente {
  return useContext(EinstellungenContext).experimente;
}

/** Stand + Setter, für das Schalter-UI in den Einstellungen. */
export function useExperimentSchalter() {
  const { experimente, experimentSetzen } = useContext(EinstellungenContext);
  return { experimente, experimentSetzen };
}

/** Region-Umschalter: aktuelle Locale + Setter (für das Auswahl-UI in der Shell). */
export function useRegionUmschalter() {
  const { einstellungen, regionSetzen } = useContext(EinstellungenContext);
  return { aktuelleLocale: einstellungen.locale, regionSetzen };
}

/** Geld-Formatierung/-Parsing, an die Haushaltswährung + Locale gebunden. */
export function useGeld() {
  const { waehrung, locale } = useEinstellungen();
  return useMemo(
    () => ({
      waehrung,
      locale,
      symbol: waehrungssymbol(waehrung, locale),
      /** Betrag ohne Symbol (für Tabellen mit eigener €-Spalte/Überschrift). */
      format: (cent: Cent, opt: Omit<FormatOptionen, "waehrung" | "locale"> = {}) =>
        geldFormatieren(cent, { waehrung, locale, ...opt }),
      /** Betrag inkl. Währungssymbol (Position je Locale). */
      formatMitSymbol: (cent: Cent, opt: Omit<FormatOptionen, "waehrung" | "locale"> = {}) =>
        geldFormatierenMitSymbol(cent, { waehrung, locale, ...opt }),
      /** Eingetippten Text → Minor Units (null bei leer/unparsebar). */
      parse: (text: string) => parseBetrag(text, waehrung),
    }),
    [waehrung, locale],
  );
}

/**
 * Was `useGeld` liefert. Als Typ exportiert, damit Helfer ausserhalb einer Komponente
 * (Formular-Umrechnungen, Aufbereitung) das Geld-Werkzeug annehmen können, ohne Währung
 * und Locale einzeln durchzureichen.
 */
export type Geld = ReturnType<typeof useGeld>;

/**
 * Ein Anteil (0…1) als Prozentangabe in der Locale des Nutzers.
 *
 * Es gibt das aus demselben Grund wie `useGeld`: die Formatierung stand an sieben Stellen
 * in VIER Varianten — `toFixed(1)`, `toLocaleString` mit einer Nachkommastelle, dasselbe
 * mit keiner, und `Math.round`. Derselbe Wert sah damit je nach Bildschirm verschieden
 * genau aus.
 *
 * **`toFixed` war dabei nicht nur uneinheitlich, sondern falsch**: es kennt die Locale
 * nicht und schreibt im Deutschen „12.5 %" statt „12,5 %". Dieselbe Falle, wegen der
 * `CLAUDE.md` für Geld ausdrücklich „nie mit eigenem `toFixed`" verlangt.
 *
 * `stellen` ist die OBERgrenze und bleibt wählbar — eine Trefferquote will eine
 * Nachkommastelle, ein Anteil an einer Aufstellung meist keine. Eine glatte Zahl bleibt
 * dabei glatt („100 %", nicht „100,0 %"): eine erzwungene Nachkommastelle sähe nach
 * Messgenauigkeit aus, die nicht da ist. Was nicht wählbar ist, ist die Locale.
 */
export function useProzent(): (anteil: number, stellen?: number) => string {
  const { locale } = useEinstellungen();
  return useMemo(
    () =>
      (anteil: number, stellen = 0) =>
        `${(anteil * 100).toLocaleString(locale, { maximumFractionDigits: stellen })} %`,
    [locale],
  );
}

/**
 * Ein Datum aus der Datenbank (ISO) in der Schreibweise des Nutzers.
 *
 * Es gibt das aus demselben Grund wie `useProzent`, nur ist der Befund groesser: die
 * Formatierung stand an neun Stellen in vier Varianten — `datumKurz` (zweimal, mit
 * verschiedener Bedeutung), `datumLang` (zweimal, wortgleich kopiert), `ddmmyyyy`
 * (zweimal, wortgleich kopiert), `ddmm`, `datumOhneJahr` und einmal inline in der Analyse.
 * Dazu zwei Stellen, die das ISO-Datum ROH in die Oberflaeche gaben (die Karte
 * „Da ist etwas zu tun").
 *
 * **Und alle neun schrieben die deutsche Reihenfolge fest.** In einer englischen
 * Oberflaeche stand damit `28.09.2026`, wo `9/28/2026` hingehoert — dieselbe Falle wie bei
 * `toFixed`, nur eine Ebene sichtbarer: `05.03.` und `03/05/` sind dieselben Ziffern mit
 * anderer Bedeutung. `Datumsfeld` las die Reihenfolge laengst aus `Intl`; die Anzeige
 * daneben tat es nicht.
 *
 * Drei Formen, weil es drei Fragen gibt, und die Wahl gehoert dem Aufrufer:
 *
 * | | zeigt | wofuer |
 * |---|---|---|
 * | `mitJahr` | `28.09.2026` | eine Zeile ohne Zusammenhang, aus dem sich das Jahr ergaebe |
 * | `kurz` | `28.09.26` | Listen, in denen das Jahr zaehlt, aber die Spalte schmal ist |
 * | `ohneJahr` | `28.09.` | Fenster von hoechstens ein paar Monaten |
 *
 * **`ohneJahr` ist kein Sparformat, sondern eine Aussage:** wer es nimmt, behauptet, dass
 * das Jahr aus dem Zusammenhang folgt. In einem Kontoauszug ueber den Jahreswechsel tut es
 * das nicht, und dort steht deshalb `mitJahr`.
 *
 * Gerechnet wird in UTC (`Date.UTC` plus `timeZone: "UTC"`), wie im `Datumsfeld`: ein
 * ISO-Datum ist ein KALENDERTAG und keine Zeitangabe. Ohne die feste Zone zieht ein
 * Rechner westlich von Greenwich jeden Tag um einen zurueck.
 *
 * Ein Zeitstempel (`2026-08-11T09:00:00.000Z`) wird angenommen und auf seinen Tag
 * gekuerzt; was sich nicht als Datum lesen laesst, kommt unveraendert zurueck — eine
 * Anzeige ist kein Ort, an dem eine kaputte Zeile den Bildschirm leeren darf.
 */
export function useDatum(): {
  mitJahr: (iso: string) => string;
  kurz: (iso: string) => string;
  ohneJahr: (iso: string) => string;
} {
  const { locale } = useEinstellungen();
  return useMemo(() => {
    const formatierer = (jahr?: "numeric" | "2-digit") =>
      new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "2-digit", month: "2-digit", ...(jahr ? { year: jahr } : {}) });
    const voll = formatierer("numeric");
    const zweistellig = formatierer("2-digit");
    const ohne = formatierer();

    const anwenden = (f: Intl.DateTimeFormat) => (iso: string) => {
      const [j, m, d] = String(iso).slice(0, 10).split("-").map(Number);
      if (!j || !m || !d) return iso;
      return f.format(new Date(Date.UTC(j, m - 1, d)));
    };

    return { mitJahr: anwenden(voll), kurz: anwenden(zweistellig), ohneJahr: anwenden(ohne) };
  }, [locale]);
}

/**
 * Was `useDatum` liefert — aus demselben Grund exportiert wie `Geld`: damit Helfer
 * ausserhalb einer Komponente das Datums-Werkzeug annehmen koennen, statt die Locale
 * einzeln durchzureichen.
 */
export type Datum = ReturnType<typeof useDatum>;

/** Enum-Label-Schicht: Charakter (gespeicherter Code) → übersetztes Anzeige-Label. */
export function useCharakterLabel(): (c: Charakter) => string {
  const { t } = useTranslation();
  return (c: Charakter) => t(`charakter.${c}`);
}

/**
 * Übersetzt einen gefangenen Fehler in Anzeigetext: FachlicherFehler über seinen Code
 * (i18n-Namespace `fehler`), alles andere über die message (technische Fehler bleiben
 * unübersetzt — die sind ohnehin nicht für Endnutzer gedacht). Nimmt das `t` der
 * aufrufenden Komponente, damit es auch in Modal-Unterkomponenten ohne eigenen Hook geht.
 */
export function fehlerNachricht(
  t: (key: string, options?: Record<string, unknown>) => string,
  e: unknown,
): string {
  if (e instanceof FachlicherFehler) return t(`fehler.${e.code}`, e.werte);
  return e instanceof Error ? e.message : String(e);
}
