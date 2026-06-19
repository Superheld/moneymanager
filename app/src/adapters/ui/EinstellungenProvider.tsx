// Haushaltseinstellungen als React-Kontext (ADR-0004). Lädt Währung/Locale/Sprache
// einmalig beim Start und stellt sie der UI bereit. Die reine Geld-Logik bleibt im
// Kern (geld.ts); dieser Hook bindet sie nur an die eine Haushaltswährung, damit die
// Screens nicht jedes Mal Währung + Locale durchreichen müssen.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FachlicherFehler,
  geldFormatieren,
  geldFormatierenMitSymbol,
  parseBetrag,
  waehrungssymbol,
  type Cent,
  type Charakter,
  type FormatOptionen,
} from "../../core";
import {
  einstellungenLaden,
  regionWaehlen,
  STANDARD_EINSTELLUNGEN,
  type Haushaltseinstellungen,
} from "../../application/einstellungen";
import { sqliteEinstellungenRepository } from "../persistence/sqliteEinstellungenRepository";
import i18n from "../../i18n/i18n";

interface ContextWert {
  einstellungen: Haushaltseinstellungen;
  /** Region wechseln (speichert die Locale, lädt neu, schaltet die UI-Sprache um). */
  regionSetzen: (locale: string) => Promise<void>;
}

const EinstellungenContext = createContext<ContextWert>({
  einstellungen: STANDARD_EINSTELLUNGEN,
  regionSetzen: async () => {},
});

/**
 * Lädt die Einstellungen, setzt die UI-Sprache und rendert die Kinder erst danach —
 * so sieht kein Screen je einen falschen (Default-)Währungs-/Sprachzustand kurz aufblitzen.
 */
export function EinstellungenProvider({ children }: { children: ReactNode }) {
  const [einstellungen, setEinstellungen] = useState<Haushaltseinstellungen | null>(null);

  async function anwenden(e: Haushaltseinstellungen) {
    if (e.sprache !== i18n.language) await i18n.changeLanguage(e.sprache);
    setEinstellungen(e);
  }

  useEffect(() => {
    einstellungenLaden(sqliteEinstellungenRepository).then(anwenden);
  }, []);

  const wert = useMemo<ContextWert>(
    () => ({
      einstellungen: einstellungen ?? STANDARD_EINSTELLUNGEN,
      regionSetzen: async (locale: string) => {
        await regionWaehlen(sqliteEinstellungenRepository, locale);
        await anwenden(await einstellungenLaden(sqliteEinstellungenRepository));
      },
    }),
    [einstellungen],
  );

  if (!einstellungen) return null;
  return <EinstellungenContext.Provider value={wert}>{children}</EinstellungenContext.Provider>;
}

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
