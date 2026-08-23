// Haushaltseinstellungen als React-Kontext (ADR-0004). Lädt Währung/Locale/Sprache
// einmalig beim Start und stellt sie der UI bereit.
//
// Diese Datei exportiert AUSSCHLIESSLICH die Komponente — Kontext, Hooks und
// `fehlerNachricht` liegen in `einstellungenKontext.ts`. Nur so kann React Fast Refresh
// die Datei partiell austauschen, statt bei jeder Änderung die ganze Seite neu zu laden
// (siehe Kopfkommentar dort).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  EXPERIMENTE_AUS,
  STANDARD_EINSTELLUNGEN,
  type ExperimentId,
  type Experimente,
  type Haushaltseinstellungen,
} from "../../../application";
// Umbenannt importiert: die Kontext-Eigenschaft heisst genauso, und `regionSetzen`
// im Rumpf sähe dann nach einem Aufruf ihrer selbst aus.
import {
  einstellungen as einstellungenHolen,
  experimente as experimenteHolen,
  experimentSetzen as experimentSpeichern,
  regionSetzen as regionSpeichern,
} from "../../dienste";
import i18n from "../../../i18n/i18n";
import { EinstellungenContext, type ContextWert } from "./einstellungenKontext";

/**
 * Lädt die Einstellungen, setzt die UI-Sprache und rendert die Kinder erst danach —
 * so sieht kein Screen je einen falschen (Default-)Währungs-/Sprachzustand kurz aufblitzen.
 */
export function EinstellungenProvider({ children }: { children: ReactNode }) {
  const [einstellungen, setEinstellungen] = useState<Haushaltseinstellungen | null>(null);
  const [experimente, setExperimente] = useState<Experimente | null>(null);

  async function anwenden(e: Haushaltseinstellungen) {
    if (e.sprache !== i18n.language) await i18n.changeLanguage(e.sprache);
    setEinstellungen(e);
  }

  // Beides in EINEM Effekt und zusammen gesetzt. Gestaffelt gerendert stuende einen
  // Durchgang lang "alles aus" da — ein Experiment, das aufblitzt und wieder
  // verschwindet, sieht aus wie ein Fehler und nicht wie eine Voreinstellung.
  useEffect(() => {
    Promise.all([einstellungenHolen(), experimenteHolen()]).then(async ([e, x]) => {
      await anwenden(e);
      setExperimente(x);
    });
  }, []);

  const wert = useMemo<ContextWert>(
    () => ({
      einstellungen: einstellungen ?? STANDARD_EINSTELLUNGEN,
      regionSetzen: async (locale: string) => {
        await regionSpeichern(locale);
        await anwenden(await einstellungenHolen());
      },
      experimente: experimente ?? EXPERIMENTE_AUS,
      experimentSetzen: async (id: ExperimentId, an: boolean) => {
        await experimentSpeichern(id, an);
        setExperimente(await experimenteHolen());
      },
    }),
    [einstellungen, experimente],
  );

  if (!einstellungen || !experimente) return null;
  return <EinstellungenContext.Provider value={wert}>{children}</EinstellungenContext.Provider>;
}
