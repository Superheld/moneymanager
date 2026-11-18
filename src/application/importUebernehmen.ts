// Ein Dateiimport übernehmen — der Beleg samt Kategorie-Vorschlag.
//
// Zwei Bereiche, und darum liegt das direkt in `src/application/` und in keinem von beiden:
// das Übernehmen gehört zum Import (`import/umsaetzeUebernehmen`), der Vorschlag zur
// Kategorisierungskette (`klassifikator/vorschlag`), und die steht in der Rangfolge über
// dem Beleg. Der Import darf sie nicht kennen und bekommt sie deshalb hereingereicht;
// zusammengesteckt wird hier. Für den Bankabruf tut dasselbe `abrufAusfuehren.ts`.
//
// Der Ablauf ist der, den die Verdrahtung vorher selbst hatte: erst die Quellen der Kette
// laden, dann übernehmen. Einmal vor dem Lauf, nicht je Zeile — der Bestand ändert sich
// währenddessen nicht.

import { kategorisierungsquellen, type QuellenDeps } from "./kategorien/kategorisierungsquellen";
import {
  umsaetzeUebernehmen,
  type UebernahmeDeps,
  type UebernahmeEingabe,
  type UebernahmeErgebnis,
} from "./import/umsaetzeUebernehmen";
import { vorschlagMitKatalog } from "./klassifikator/vorschlag";

export async function importUebernehmen(
  eingabe: UebernahmeEingabe,
  deps: Omit<UebernahmeDeps, "vorschlag"> & QuellenDeps,
): Promise<UebernahmeErgebnis> {
  const kontext = await kategorisierungsquellen(deps);
  return umsaetzeUebernehmen(eingabe, { ...deps, vorschlag: vorschlagMitKatalog(kontext) });
}
