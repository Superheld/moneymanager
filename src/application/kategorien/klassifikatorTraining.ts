// Use-Case „Klassifikator trainieren" — lädt das Material, trainiert, misst, speichert.
//
// Warum ein Neutraining und kein Nachjustieren einzelner Korrekturen: Das Modell ist
// linear und über den ganzen Bestand in Millisekunden neu gerechnet — auch über einen
// mehrjährigen. Inkrementelles Lernen brächte dafür alles mit, was man
// sich damit einhandelt — Abhängigkeit von der Reihenfolge, Abdriften über die Zeit, und
// die Frage, wie schwer eine einzelne Korrektur wiegen darf. Die Wahrheit ist ohnehin der
// Bestand: jede Korrektur verändert ihn, und ein Training daraus ist die ehrlichere
// Antwort als eine Kette von Anpassungen.
//
// Ausgelöst wird es von Hand (Knopf in den Einstellungen). Ein Modell, das sich
// unbemerkt ändert, ist eines, dessen Verhalten sich niemand erklären kann.

import {
  bewerten,
  empfaengerLinie,
  STANDARD_KONFIGURATION,
  grundlinie,
  kalibrierung,
  klassenwerte,
  laeufeVergleichen,
  pruefmengeWaehlen,
  trainieren,
  zeitlichAufteilen,
  type Beispiel,
  type Bewertung,
  type GekippteZeile,
  type Kalibrierung,
  type Laufvergleich,
  type Klassenkennzahlen,
  type Merkmalskonfiguration,
  type Pruefmenge,
  type Trainingslauf,
} from "../../core";
import type {
  KlassifikatorRepository,
  LedgerPort,
  Modellstand,
  TrainingslaufRepository,
  UmsatzRepository,
} from "../ports";
import { trainingsmaterial, type Materialbefund } from "./trainingsmaterial";

/**
 * Unter so vielen Beispielen lohnt kein Holdout: die Prüfmenge wäre so klein, dass ihre
 * Genauigkeit mehr über den Zufall des Splits aussagt als über das Modell. Dann wird auf
 * allem trainiert und keine Zahl behauptet — lieber keine Angabe als eine erfundene.
 */
export const MESSBAR_AB = 50;

/** Anteil, der für die Messung zurückgehalten wird. */
const PRUEFANTEIL = 0.2;

export interface TrainingsErgebnis {
  readonly stand: Modellstand;
  /** Woraus trainiert wurde — dieselbe Auswertung, die die Einstellungen zeigen. */
  readonly material: Materialbefund;
  /** Messung an zurückgehaltenen Beispielen; fehlt bei zu wenig Material. */
  readonly bewertung?: Bewertung;
  /**
   * Was das dümmste denkbare Modell auf derselben Prüfmenge träfe — immer die häufigste
   * Kategorie raten.
   *
   * Sie steht neben der Genauigkeit, weil die für sich genommen nichts sagt: erst der
   * Abstand zwischen beiden ist eine Aussage über das Modell. Fehlt aus demselben Grund
   * wie `bewertung` — ohne Prüfmenge gibt es nichts zu vergleichen.
   */
  readonly grundlinie?: { kategorieId: string; genauigkeit: number };
  /** Wie gemessen wurde und was daneben steht — fehlt aus demselben Grund wie `bewertung`. */
  readonly protokoll?: Messprotokoll;
  /** Gegenüber dem vorigen Lauf — fehlt beim ersten. */
  readonly vergleich?: Laufvergleichsicht;
}

/** Ein Laufvergleich, dessen gekippte Zeilen ihre Merkmale tragen — sonst wären es Ids. */
export interface Laufvergleichsicht extends Omit<Laufvergleich, "gekippt"> {
  readonly gekippt: readonly (GekippteZeile & { readonly merkmale: readonly string[] })[];
  /** Wann der Lauf war, mit dem verglichen wird. */
  readonly vorherAm: string;
}

/** Wie viele Läufe aufgehoben werden. Genug für eine Versuchsreihe, nicht für ein Archiv. */
export const LAEUFE_BEHALTEN = 30;

/**
 * Alles, was eine Messung ausser der Trefferquote braucht, um etwas zu bedeuten.
 *
 * Die Felder beantworten je eine Frage, die man an eine Zahl stellen muss, bevor man ihr
 * glaubt: Woran wurde geprüft (Zeitraum, Labels)? Woran muss sie sich messen lassen
 * (Empfängerlinie)? Trägt sie auch die seltenen Kategorien (Macro-F1)? Und taugt die
 * Sicherheit daneben etwas (Kalibrierung)? Siehe `core/klassifikator/messung.ts`.
 */
export interface Messprotokoll {
  /** Ab diesem Datum wurde geprüft; alles davor war Training. */
  readonly stichtag?: string;
  readonly trainingAnzahl: number;
  readonly pruefAnzahl: number;
  /** Nur handverlesene Labels — oder alle, weil es zu wenige gab. */
  readonly pruefmenge: Pruefmenge;
  /** „Dieselbe Kategorie wie bei diesem Empfänger üblich" — die Linie ohne Modell. */
  readonly empfaenger: { genauigkeit: number; abdeckung: number } | null;
  readonly kennzahlen: Klassenkennzahlen;
  readonly kalibrierung: Kalibrierung | null;
}

/**
 * Misst ein Modell nach dem Protokoll aus `messung.ts`: auf dem Älteren trainieren, an den
 * jüngsten — wenn möglich handverlesenen — Buchungen prüfen, beide Vergleichslinien auf
 * derselben Aufteilung.
 *
 * Exportiert, weil die Wirkungsmessung dasselbe Protokoll braucht: eine Wirkung, die
 * anders gemessen wird als die Zahl daneben, vergleicht zwei verschiedene Dinge.
 */
export function messen(
  beispiele: readonly Beispiel[],
  pruefanteil = PRUEFANTEIL,
  abschnittEnde = 0,
): { bewertung: Bewertung; grundlinie?: { kategorieId: string; genauigkeit: number }; protokoll: Messprotokoll } | null {
  const { training, pruefung, stichtag } = zeitlichAufteilen(beispiele, pruefanteil, abschnittEnde);
  const gewaehlt = pruefmengeWaehlen(pruefung);
  if (training.length === 0 || gewaehlt.beispiele.length === 0) return null;

  const bewertung = bewerten(trainieren(training), gewaehlt.beispiele);
  return {
    bewertung,
    // Auf DERSELBEN Aufteilung — eine Vergleichslinie, die an anderen Beispielen
    // gemessen wird, vergleicht nichts.
    grundlinie: grundlinie(training, gewaehlt.beispiele) ?? undefined,
    protokoll: {
      stichtag,
      trainingAnzahl: training.length,
      pruefAnzahl: gewaehlt.beispiele.length,
      pruefmenge: gewaehlt.art,
      empfaenger: empfaengerLinie(training, gewaehlt.beispiele),
      kennzahlen: klassenwerte(bewertung),
      kalibrierung: kalibrierung(bewertung),
    },
  };
}

export interface TrainingsDeps {
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly klassifikatorRepo: KlassifikatorRepository;
  readonly laufRepo: TrainingslaufRepository;
  /** Erzeugt die Id eines Laufs — hereingereicht wie die Zeit, damit Tests sie festlegen. */
  readonly neueId: () => string;
  /**
   * Was ins Training geht. Hereingereicht statt hier geladen: sonst hinge dieser
   * Use-Case an `merkmalskonfiguration`, das seinerseits die Messschwelle von hier
   * bezieht — ein Zyklus für einen Wert, den die Oberfläche ohnehin schon hat.
   * Fehlt sie, gilt die Grundausstattung.
   */
  readonly konfiguration?: Merkmalskonfiguration;
  /** Zeitquelle — hereingereicht, damit der Ablauf testbar bleibt. */
  readonly jetzt: () => string;
}

/**
 * Lernbeispiele in die Form des Kerns. Id, Datum und Herkunft des Labels wandern mit:
 * fürs Training bedeutungslos, für die Messung der Unterschied zwischen „siebenmal
 * verwechselt" und „diese sieben Zeilen", zwischen Vergangenheit und Zukunft und
 * zwischen einem Label, das ein Mensch gesetzt hat, und einem, das das Modell riet.
 */
export function alsBeispiele(
  material: readonly { merkmale: readonly string[]; kategorieId: string; istbuchungId: string; datum: string; handverlesen: boolean }[],
): Beispiel[] {
  return material.map((b) => ({
    merkmale: b.merkmale,
    kategorieId: b.kategorieId,
    id: b.istbuchungId,
    datum: b.datum,
    handverlesen: b.handverlesen,
  }));
}

/**
 * Trainiert neu und speichert das Ergebnis.
 *
 * Zwei Durchgänge, und das ist Absicht: einer auf dem Älteren, um an den jüngsten
 * Buchungen zu MESSEN (`messen`), und einer auf allem, um das Modell zu BEKOMMEN. Nur den ersten zu behalten hieße, ein Fünftel der Daten wegzuwerfen; nur den
 * zweiten zu messen hieße, auf den eigenen Trainingsdaten zu prüfen — das ergibt keine
 * Genauigkeit, sondern eine Selbstbestätigung.
 */
export async function klassifikatorTrainieren(deps: TrainingsDeps): Promise<TrainingsErgebnis> {
  const material = await trainingsmaterial(deps.ledger, deps.umsatzRepo, deps.konfiguration);
  const beispiele: Beispiel[] = alsBeispiele(material.beispiele);

  const messung = beispiele.length >= MESSBAR_AB ? messen(beispiele) : null;

  const stand: Modellstand = {
    modell: trainieren(beispiele),
    trainiertAm: deps.jetzt(),
    genauigkeit: messung?.bewertung.genauigkeit,
  };
  await deps.klassifikatorRepo.speichern(stand);

  // Der Lauf wird aufgezeichnet — samt Konfiguration und der Vorhersage je Prüfzeile,
  // damit der nächste Lauf sagen kann, welche Zeilen er gewonnen und verloren hat.
  const konfiguration = deps.konfiguration ?? STANDARD_KONFIGURATION;
  const lauf: Trainingslauf = {
    id: deps.neueId(),
    zeitpunkt: stand.trainiertAm,
    beispiele: beispiele.length,
    konfiguration: { herkuenfte: konfiguration.herkuenfte, ausschluesse: konfiguration.ausschluesse },
    kennzahlen: messung
      ? {
          genauigkeit: messung.bewertung.genauigkeit,
          grundlinie: messung.grundlinie?.genauigkeit,
          empfaenger: messung.protokoll.empfaenger?.genauigkeit,
          macroF1: messung.protokoll.kennzahlen.macroF1 ?? undefined,
          ece: messung.protokoll.kalibrierung?.ece,
          pruefAnzahl: messung.protokoll.pruefAnzahl,
          pruefmenge: messung.protokoll.pruefmenge,
          stichtag: messung.protokoll.stichtag,
        }
      : undefined,
    vorhersagen: (messung?.bewertung.vorhersagen ?? []).map((v) => ({
      id: v.id,
      tatsaechlich: v.tatsaechlich,
      vorhergesagt: v.vorhergesagt,
    })),
  };
  const [vorher] = await deps.laufRepo.juengste(1);
  await deps.laufRepo.anlegen(lauf);
  await deps.laufRepo.ausduennen(LAEUFE_BEHALTEN);

  let vergleich: Laufvergleichsicht | undefined;
  if (vorher) {
    const v = laeufeVergleichen(vorher, lauf);
    const merkmaleVon = new Map(material.beispiele.map((b) => [b.istbuchungId, b.merkmale]));
    vergleich = {
      ...v,
      vorherAm: vorher.zeitpunkt,
      gekippt: v.gekippt.map((g) => ({ ...g, merkmale: merkmaleVon.get(g.id) ?? [] })),
    };
  }

  return {
    stand,
    material,
    bewertung: messung?.bewertung,
    grundlinie: messung?.grundlinie,
    protokoll: messung?.protokoll,
    vergleich,
  };
}

export interface Modellzustand {
  readonly stand: Modellstand | null;
  /** Beispiele, die es JETZT gäbe — gegen die Zahl beim letzten Training zu lesen. */
  readonly beispieleJetzt: number;
  /**
   * Wie viele Beispiele seit dem letzten Training dazugekommen sind. Negativ ist möglich
   * (Buchungen gelöscht) und heißt genauso: der Stand passt nicht mehr zu den Daten.
   */
  readonly zuwachs: number;
  /** Lohnt ein neues Training? */
  readonly veraltet: boolean;
}

/**
 * Ab wie vielen neuen Beispielen ein Training sich lohnt.
 *
 * Bewusst keine Automatik, sondern ein Hinweis: das Modell soll sich nicht hinter dem
 * Rücken ändern. Die Schwelle ist grob — bei einem gewachsenen Bestand ändern fünfzig
 * neue Zeilen wenig, aber sie sind ein sichtbares Zeichen, dass sich etwas getan hat.
 */
export const ZUWACHS_SCHWELLE = 50;

/** Wie aktuell ist das gespeicherte Modell gegenüber dem heutigen Bestand? */
export async function modellzustand(deps: {
  ledger: LedgerPort;
  umsatzRepo: UmsatzRepository;
  klassifikatorRepo: KlassifikatorRepository;
  konfiguration?: Merkmalskonfiguration;
}): Promise<Modellzustand> {
  const [stand, material] = await Promise.all([
    deps.klassifikatorRepo.laden(),
    trainingsmaterial(deps.ledger, deps.umsatzRepo, deps.konfiguration),
  ]);

  const beispieleJetzt = material.beispiele.length;
  const zuwachs = beispieleJetzt - (stand?.modell.beispiele ?? 0);
  return {
    stand,
    beispieleJetzt,
    zuwachs,
    // Ohne Modell ist jedes Material Anlass genug; mit Modell erst ab der Schwelle.
    veraltet: stand ? Math.abs(zuwachs) >= ZUWACHS_SCHWELLE : beispieleJetzt > 0,
  };
}

/** Die aufgezeichneten Läufe, neuester zuerst — für die Tabelle im Training. */
export function trainingslaeufe(deps: { laufRepo: TrainingslaufRepository }): Promise<Trainingslauf[]> {
  return deps.laufRepo.juengste(LAEUFE_BEHALTEN);
}
