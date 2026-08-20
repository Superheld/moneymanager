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
  STANDARD_EINSTELLUNGEN,
  geldFormatieren,
  geldFormatierenMitSymbol,
  parseBetrag,
  waehrungssymbol,
  type Cent,
  type Charakter,
  type FormatOptionen,
  type Haushaltseinstellungen,
} from "../../../application";

export interface ContextWert {
  einstellungen: Haushaltseinstellungen;
  /** Region wechseln (speichert die Locale, lädt neu, schaltet die UI-Sprache um). */
  regionSetzen: (locale: string) => Promise<void>;
}

export const EinstellungenContext = createContext<ContextWert>({
  einstellungen: STANDARD_EINSTELLUNGEN,
  regionSetzen: async () => {},
});

export function useEinstellungen(): Haushaltseinstellungen {
  return useContext(EinstellungenContext).einstellungen;
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
