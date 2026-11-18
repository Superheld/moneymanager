// Use-Cases rund um die Frage „was geht ins Training?".
//
// Der Kern rechnet mit einer `Merkmalskonfiguration`; hier wird sie geladen, beim ersten
// Start angelegt und geändert. Dazu die Wirkungsmessung — der Grund, warum diese
// Steuerung überhaupt verantwortbar ist.
//
// Gemessen (2026-08-17): das Weglassen einzelner Herkünfte bewegte die Genauigkeit
// zwischen gar nicht (Vorzeichen, Gläubiger-ID) und spürbar (Verwendungszweck), und
// automatisches Aussortieren „sinnloser" Merkmale brachte nichts Messbares. Ausschlüsse
// verbessern die Genauigkeit nicht zwingend, sie machen das Modell LESBAR. Das ist ein legitimes
// Ziel, aber nur mit sichtbarer Wirkung: `wirkungMessen` ist die Zusage, dass eine
// Entscheidung hier eine gemessene bleibt und keine Geschmacksfrage wird.

import {
  herkunftVon,
  MERKMALSHERKUENFTE,
  STANDARD_KONFIGURATION,
  klassifizieren,
  merkmalsbefund,
  erklaeren,
  type Beispiel,
  type Erklaerung,
  type Klassifikation,
  type Merkmalsherkunft,
  type Merkmalskonfiguration,
  type VerworfenesWort,
} from "../../core";
import type {
  GespeicherterAusschluss,
  KlassifikatorRepository,
  LedgerPort,
  MerkmalskonfigurationRepository,
  UmsatzRepository,
} from "../ports";
import { alsBeispiele, MESSBAR_AB, messen } from "./klassifikatorTraining";
import { materialBefund, trainingsmaterial, type Merkmalswert } from "./trainingsmaterial";
import { zahlungsspuren } from "../buchung/zahlungsspuren";

/** Die Konfiguration samt der Angabe, woher jeder Ausschluss stammt. */
export interface Konfigurationsstand {
  readonly konfiguration: Merkmalskonfiguration;
  readonly ausschluesse: readonly GespeicherterAusschluss[];
}

/**
 * Lädt die Konfiguration und legt beim ersten Mal die Grundausstattung an.
 *
 * Die mitgelieferten Stoppwörter wandern dabei in die Datenbank, statt im Code zu bleiben.
 * Nur so ist ein einzelner davon löschbar — läge die Liste weiter im Code und die
 * Datenbank enthielte nur die Ergänzungen, bräuchte es zusätzlich eine Liste der
 * Ausnahmen von der Liste.
 */
export async function konfigurationLaden(
  repo: MerkmalskonfigurationRepository,
): Promise<Konfigurationsstand> {
  const [herkuenfte, vorhandene] = await Promise.all([
    repo.herkuenfteLesen(),
    repo.ausschluesseLesen(),
  ]);

  let ausschluesse = vorhandene;
  if (ausschluesse.length === 0) {
    for (const a of STANDARD_KONFIGURATION.ausschluesse) {
      await repo.ausschlussSetzen({ ...a, quelle: "standard" });
    }
    ausschluesse = await repo.ausschluesseLesen();
  }

  return {
    konfiguration: {
      herkuenfte: herkuenfte ?? STANDARD_KONFIGURATION.herkuenfte,
      ausschluesse,
    },
    ausschluesse,
  };
}

/** Schaltet eine Herkunft an oder aus. */
export async function herkunftSchalten(
  repo: MerkmalskonfigurationRepository,
  herkunft: Merkmalsherkunft,
  aktiv: boolean,
): Promise<Merkmalsherkunft[]> {
  const bisher = (await repo.herkuenfteLesen()) ?? [...STANDARD_KONFIGURATION.herkuenfte];
  const menge = new Set(bisher);
  if (aktiv) menge.add(herkunft);
  else menge.delete(herkunft);
  // In der festgelegten Reihenfolge speichern, nicht in Einfügereihenfolge — sonst
  // springt die Anzeige, je nachdem in welcher Folge geklickt wurde.
  const neu = MERKMALSHERKUENFTE.filter((h) => menge.has(h));
  await repo.herkuenfteSetzen(neu);
  return neu;
}

/**
 * Nimmt ein Wort in die Ausschlussliste auf oder ändert seine Einschränkung.
 * Leere `herkuenfte` heißen „überall".
 */
export async function wortAusschliessen(
  repo: MerkmalskonfigurationRepository,
  wort: string,
  herkuenfte?: readonly Merkmalsherkunft[],
): Promise<void> {
  const sauber = wort.trim().toLowerCase();
  if (!sauber) return;
  await repo.ausschlussSetzen({
    wort: sauber,
    herkuenfte: herkuenfte?.length ? [...herkuenfte] : undefined,
    quelle: "manuell",
  });
}

/**
 * Legt die mitgelieferte Grundausstattung neu an — ohne anzufassen, was schon dasteht.
 *
 * Sie ist loeschbar, und das soll sie sein: jeder Eintrag ist eine Behauptung darueber,
 * was nichts bedeutet, und die kann falsch sein. Nur war der Weg bisher einbahnig — wer
 * `sepa` einmal zugelassen hatte, bekam es nie wieder, ausser ueber Tippen. Ein Schalter,
 * der etwas wegnimmt, braucht einen, der es zurueckholt; sonst raeumt niemand auf.
 *
 * `ausschlussSetzen` waere hier falsch: es ist ein Upsert und wuerde die QUELLE
 * mitschreiben — ein Wort, das der Nutzer selbst gesetzt hat und das zufaellig auch in
 * der Grundausstattung steht, faellt damit auf „mitgeliefert" zurueck und verschwindet
 * beim naechsten Ausblenden aus seiner Liste. Deshalb wird nur angelegt, was fehlt.
 */
export async function grundausstattungHerstellen(
  repo: MerkmalskonfigurationRepository,
): Promise<number> {
  const vorhanden = new Set((await repo.ausschluesseLesen()).map((a) => a.wort));
  let neu = 0;
  for (const a of STANDARD_KONFIGURATION.ausschluesse) {
    if (vorhanden.has(a.wort)) continue;
    await repo.ausschlussSetzen({ ...a, quelle: "standard" });
    neu++;
  }
  return neu;
}

/** Nimmt ein Wort wieder ins Training auf. */
export async function wortZulassen(
  repo: MerkmalskonfigurationRepository,
  wort: string,
): Promise<void> {
  await repo.ausschlussEntfernen(wort);
}

export interface Wirkung {
  /** Was weggelassen wurde — null für die Basis (alles an). */
  readonly herkunft: Merkmalsherkunft | null;
  readonly genauigkeit: number;
  /** Abstand zur Basis in Prozentpunkten. Negativ heißt: das Weglassen kostet. */
  readonly abstand: number;
}

/**
 * Die Prüffenster der Wirkungsmessung, als Abstand vom Ende des Bestands.
 *
 * Bis 2026-11-09 mittelte die Messung über fünf ZUFÄLLIGE Aufteilungen. Seitdem misst sie
 * nach demselben Protokoll wie das Training (`core/klassifikator/messung.ts`): auf dem
 * Älteren trainieren, an Jüngerem prüfen. Weil eine einzelne zeitliche Aufteilung keinen
 * Zufall hat, über den man mitteln könnte, rollt der Prüfzeitraum zurück — drei Fenster
 * zu je einem Zehntel, das jüngste zuerst, und jedes wird mit allem trainiert, was davor
 * liegt („rolling origin", die übliche Kreuzvalidierung für Daten mit Zeitachse).
 *
 * Gemittelt wird weiterhin, und aus demselben Grund wie früher: die Abstände zwischen
 * Varianten liegen oft unter einem Punkt, und ein einzelnes Fenster schwankt mehr.
 */
const FENSTER = [0, 0.1, 0.2];
const FENSTERANTEIL = 0.1;

/**
 * Misst, was jede Herkunft beiträgt: trainiert einmal mit allem und je einmal ohne eine
 * der Herkünfte, jeweils gemittelt über die Prüffenster.
 *
 * Die teuerste Rechnung der App — Varianten mal Fenster, je ein Training. Deshalb läuft
 * sie auf Anforderung und nicht nebenbei.
 */
export async function wirkungMessen(deps: {
  ledger: LedgerPort;
  umsatzRepo: UmsatzRepository;
  konfiguration: Merkmalskonfiguration;
}): Promise<{ basis: number; wirkungen: Wirkung[] } | null> {
  const spuren = await zahlungsspuren(deps.ledger, deps.umsatzRepo);
  const alle: Beispiel[] = alsBeispiele(materialBefund(spuren, deps.konfiguration).beispiele);
  if (alle.length < MESSBAR_AB) return null;

  /** Mittlere Genauigkeit, wenn nur Merkmale gezählt werden, die `behalten` durchlässt. */
  const messe = (behalten: (merkmal: string) => boolean): number => {
    const gefiltert = alle.map((b) => ({ ...b, merkmale: b.merkmale.filter(behalten) }));
    const werte = FENSTER.map((ende) => messen(gefiltert, FENSTERANTEIL, ende)?.bewertung.genauigkeit).filter(
      (g): g is number => g !== undefined,
    );
    return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;
  };

  const basis = messe(() => true);
  const wirkungen: Wirkung[] = [];
  for (const h of deps.konfiguration.herkuenfte) {
    // Merkmale dieser Herkunft weglassen — der Rest bleibt, wie er ist.
    const ohne = messe((m) => herkunftVon(m) !== h);
    wirkungen.push({ herkunft: h, genauigkeit: ohne, abstand: (ohne - basis) * 100 });
  }

  // Am meisten kostend zuerst: was am stärksten fehlt, ist am wichtigsten.
  wirkungen.sort((a, b) => a.abstand - b.abstand);
  return { basis, wirkungen };
}

/**
 * Was das Modell an EINER Buchung sieht: welche Merkmale entstehen, welche Wörter
 * verworfen wurden, was das Modell daraus vorschlagen würde.
 *
 * Es ist die Antwort auf „warum diese Kategorie?", und sie muss aus denselben Quellen
 * kommen wie der Vorschlag selbst — Konfiguration, Trainingsmaterial und Modell. Stand
 * das im Screen, hätte eine geänderte Ausschlussliste dort anders gewirkt als beim
 * Import.
 */
export interface Merkmalsansicht {
  /** Die Merkmale dieser Buchung, mit ihrer Statistik über den Bestand. */
  readonly verwendet: readonly { merkmal: string; wert?: Merkmalswert }[];
  readonly verworfen: readonly VerworfenesWort[];
  /** Wörter, die auf der Ausschlussliste stehen — nur die lassen sich zurückholen. */
  readonly ausgeschlossen: ReadonlySet<string>;
  readonly vorschlag: Klassifikation | null;
  /**
   * Warum diese Kategorie und nicht die gebuchte — oder, wenn beide übereinstimmen, nicht
   * die Zweitbeste. Das ist die Frage, mit der man eine falsch einsortierte Buchung
   * öffnet (siehe `core/klassifikator/erklaerung.ts`).
   */
  readonly erklaerung: Erklaerung | null;
  readonly hatModell: boolean;
}

export async function merkmalsansicht(
  deps: {
    readonly ledger: LedgerPort;
    readonly umsatzRepo: UmsatzRepository;
    readonly klassifikatorRepo: KlassifikatorRepository;
    readonly merkmalRepo: MerkmalskonfigurationRepository;
  },
  quelle: {
    gegenpartei: string;
    verwendungszweck: string;
    /**
     * Der Betrag muss mit, sonst sähe die Zahlung hier anders aus als beim Training und
     * beim Import — bei zugeschaltetem Betragsmerkmal fehlte ihr genau ein Merkmal, und
     * die Erklärung erklärte einen Vektor, den das Modell nie bekommt.
     */
    betrag?: number;
    /** Die gebuchte Kategorie — wogegen die Erklärung rechnet. */
    kategorieId?: string;
  },
): Promise<Merkmalsansicht> {
  const konf = await konfigurationLaden(deps.merkmalRepo);
  const befund = merkmalsbefund(
    { gegenpartei: quelle.gegenpartei, verwendungszweck: quelle.verwendungszweck, betrag: quelle.betrag },
    konf.konfiguration,
  );

  // Statistik und Modell parallel — beide lesen nur.
  const [material, modellstand] = await Promise.all([
    trainingsmaterial(deps.ledger, deps.umsatzRepo, konf.konfiguration),
    deps.klassifikatorRepo.laden(),
  ]);

  // Vollständig, seit das Vokabular nicht mehr gekappt wird: ein Eintrag fehlt jetzt nur
  // noch, wenn das Merkmal im LERNMATERIAL nicht vorkommt — etwa weil es allein in dieser
  // Buchung steht und die keine Kategorie trägt. Vorher fehlte er auch dann, wenn das
  // Merkmal bloss nicht zu den häufigsten gehörte, und beides sah gleich aus.
  const statistik = new Map(material.vokabular.merkmale.map((m) => [m.merkmal, m]));

  return {
    verwendet: befund.merkmale.map((merkmal) => ({ merkmal, wert: statistik.get(merkmal) })),
    verworfen: befund.verworfen,
    ausgeschlossen: new Set(konf.ausschluesse.map((a) => a.wort)),
    vorschlag: modellstand ? klassifizieren(modellstand.modell, befund.merkmale) : null,
    erklaerung: modellstand ? erklaeren(modellstand.modell, befund.merkmale, quelle.kategorieId) : null,
    hatModell: !!modellstand,
  };
}
