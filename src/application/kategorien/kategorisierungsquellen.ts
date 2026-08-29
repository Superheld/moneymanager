// Lädt zusammen, woraus ein Kategorie-Vorschlag entstehen kann.
//
// Die Kette selbst (`import/vorschlag`) ist rein und kennt keine Repositories; hier
// werden ihre Zutaten geholt. Eine eigene Stelle dafür, weil sie an zwei Wegen gebraucht
// werden: beim Import und bei der Vorschau in der Review-Inbox — und zwei Ladefunktionen
// wären zwei Gelegenheiten, eine Quelle zu vergessen.
//
// Fehlt eine Quelle (kein Modell trainiert, keine Verträge erfasst), bleibt ihr Feld leer
// und die Kette überspringt sie. Das ist kein Fehler, sondern der normale Zustand einer
// frisch aufgesetzten App.

import { STANDARD_KONFIGURATION, type Kategorie } from "../../core";
import { katalogNachId, type Vorschlagskontext } from "../import/vorschlag";
import { konfigurationLaden } from "./merkmalskonfiguration";
import type {
  KategorieRepository,
  KlassifikatorRepository,
  MerkmalskonfigurationRepository,
  VertragRepository,
  VertragserkennungRepository,
} from "../ports";

export interface QuellenDeps {
  readonly kategorieRepo: KategorieRepository;
  readonly vertragRepo?: VertragRepository;
  readonly erkennungRepo?: VertragserkennungRepository;
  readonly klassifikatorRepo?: KlassifikatorRepository;
  readonly merkmalRepo?: MerkmalskonfigurationRepository;
}

/**
 * Holt alle Quellen der Kategorisierungs-Kette.
 *
 * Die Erkennungsregeln kommen nur mit, wenn es auch Verträge MIT Kategorie gibt: eine
 * Regel ohne Kategorie kann nichts vorschlagen, und sie mitzuführen hieße, den Abgleich
 * über den ganzen Regelsatz für ein Ergebnis laufen zu lassen, das feststeht.
 */
export async function kategorisierungsquellen(deps: QuellenDeps): Promise<Vorschlagskontext> {
  const [kategorien, vertraege, erkennungen, modellstand, konfiguration] = await Promise.all([
    deps.kategorieRepo.alle(),
    deps.vertragRepo?.alle() ?? Promise.resolve([]),
    deps.erkennungRepo?.alle() ?? Promise.resolve([]),
    deps.klassifikatorRepo?.laden() ?? Promise.resolve(null),
    deps.merkmalRepo
      ? konfigurationLaden(deps.merkmalRepo).then((s) => s.konfiguration)
      : Promise.resolve(STANDARD_KONFIGURATION),
  ]);

  const vertragsKategorie = new Map<string, string>();
  for (const v of vertraege) {
    if (v.kategorieId) vertragsKategorie.set(v.id, v.kategorieId);
  }

  return {
    kategorieNachId: katalogNachId(kategorien as Kategorie[]),
    erkennungen: vertragsKategorie.size > 0 ? erkennungen : undefined,
    vertragsKategorie: vertragsKategorie.size > 0 ? vertragsKategorie : undefined,
    // Ein leeres Modell (nie trainiert oder ohne Material) würde nichts liefern und die
    // Kette nur unnötig durchlaufen.
    modell: modellstand?.modell.kategorien.length ? modellstand.modell : undefined,
    merkmale: konfiguration,
  };
}
