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
  aufteilen,
  bewerten,
  trainieren,
  type Beispiel,
  type Bewertung,
  type Merkmalskonfiguration,
} from "../../core";
import type { KlassifikatorRepository, LedgerPort, Modellstand, UmsatzRepository } from "../ports";
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
}

export interface TrainingsDeps {
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly klassifikatorRepo: KlassifikatorRepository;
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
 * Trainiert neu und speichert das Ergebnis.
 *
 * Zwei Durchgänge, und das ist Absicht: einer auf der Trainingsmenge, um an den
 * zurückgehaltenen Beispielen zu MESSEN, und einer auf allem, um das Modell zu
 * BEKOMMEN. Nur den ersten zu behalten hieße, ein Fünftel der Daten wegzuwerfen; nur den
 * zweiten zu messen hieße, auf den eigenen Trainingsdaten zu prüfen — das ergibt keine
 * Genauigkeit, sondern eine Selbstbestätigung.
 */
export async function klassifikatorTrainieren(deps: TrainingsDeps): Promise<TrainingsErgebnis> {
  const material = await trainingsmaterial(deps.ledger, deps.umsatzRepo, deps.konfiguration);
  const beispiele: Beispiel[] = material.beispiele.map((b) => ({
    merkmale: b.merkmale,
    kategorieId: b.kategorieId,
  }));

  let bewertung: Bewertung | undefined;
  if (beispiele.length >= MESSBAR_AB) {
    const { training, pruefung } = aufteilen(beispiele, PRUEFANTEIL);
    bewertung = bewerten(trainieren(training), pruefung);
  }

  const stand: Modellstand = {
    modell: trainieren(beispiele),
    trainiertAm: deps.jetzt(),
    genauigkeit: bewertung?.genauigkeit,
  };
  await deps.klassifikatorRepo.speichern(stand);

  return { stand, material, bewertung };
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
