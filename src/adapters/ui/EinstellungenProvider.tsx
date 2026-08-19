// Haushaltseinstellungen als React-Kontext (ADR-0004). Lädt Währung/Locale/Sprache
// einmalig beim Start und stellt sie der UI bereit.
//
// Diese Datei exportiert AUSSCHLIESSLICH die Komponente — Kontext, Hooks und
// `fehlerNachricht` liegen in `einstellungenKontext.ts`. Nur so kann React Fast Refresh
// die Datei partiell austauschen, statt bei jeder Änderung die ganze Seite neu zu laden
// (siehe Kopfkommentar dort).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { STANDARD_EINSTELLUNGEN, type Haushaltseinstellungen } from "../../application";
// Umbenannt importiert: die Kontext-Eigenschaft heisst genauso, und `regionSetzen`
// im Rumpf sähe dann nach einem Aufruf ihrer selbst aus.
import { einstellungen as einstellungenHolen, regionSetzen as regionSpeichern } from "../dienste";
import i18n from "../../i18n/i18n";
import { EinstellungenContext, type ContextWert } from "./einstellungenKontext";

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
    einstellungenHolen().then(anwenden);
  }, []);

  const wert = useMemo<ContextWert>(
    () => ({
      einstellungen: einstellungen ?? STANDARD_EINSTELLUNGEN,
      regionSetzen: async (locale: string) => {
        await regionSpeichern(locale);
        await anwenden(await einstellungenHolen());
      },
    }),
    [einstellungen],
  );

  if (!einstellungen) return null;
  return <EinstellungenContext.Provider value={wert}>{children}</EinstellungenContext.Provider>;
}
