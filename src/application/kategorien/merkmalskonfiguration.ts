// Use-Cases rund um die Frage „was geht ins Training?".
//
// Der Kern rechnet mit einer `Merkmalskonfiguration`; hier wird sie geladen, beim ersten
// Start angelegt und geändert. Dazu die Wirkungsmessung — der Grund, warum diese
// Steuerung überhaupt verantwortbar ist.
//
// Am echten Bestand gemessen (2026-08-17): das Weglassen einzelner Herkünfte bewegt
// zwischen ±0,00 (Vorzeichen, Gläubiger-ID) und −1,71 Punkten (Verwendungszweck), und
// automatisches Aussortieren „sinnloser" Merkmale bringt +0,19 — also nichts. Ausschlüsse
// verbessern die Genauigkeit nicht, sie machen das Modell LESBAR. Das ist ein legitimes
// Ziel, aber nur mit sichtbarer Wirkung: `wirkungMessen` ist die Zusage, dass eine
// Entscheidung hier eine gemessene bleibt und keine Geschmacksfrage wird.

import {
  aufteilen,
  bewerten,
  herkunftVon,
  MERKMALSHERKUENFTE,
  STANDARD_KONFIGURATION,
  klassifizieren,
  merkmalsbefund,
  trainieren,
  type Beispiel,
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
import { MESSBAR_AB } from "./klassifikatorTraining";
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
 * Wie viele Splits die Messung mittelt.
 *
 * Fünf, weil ein einzelner Split um bis zu 1,5 Punkte danebenliegt — bei Abständen, die
 * oft unter einem Punkt liegen, wäre eine Einzelmessung reines Rauschen und würde zu
 * genau den Fehlentscheidungen führen, die sie verhindern soll.
 */
const SPLITS = [11, 222, 3333, 44444, 555555];

const PRUEFANTEIL = 0.2;

/**
 * Misst, was jede Herkunft beiträgt: trainiert einmal mit allem und je einmal ohne eine
 * der Herkünfte, jeweils gemittelt über mehrere Splits.
 *
 * Das ist die teuerste Rechnung der App — sechs Varianten mal fünf Splits. Bei 137 ms je
 * Training sind das rund vier Sekunden; deshalb läuft sie auf Anforderung und nicht
 * nebenbei.
 */
export async function wirkungMessen(deps: {
  ledger: LedgerPort;
  umsatzRepo: UmsatzRepository;
  konfiguration: Merkmalskonfiguration;
}): Promise<{ basis: number; wirkungen: Wirkung[] } | null> {
  const spuren = await zahlungsspuren(deps.ledger, deps.umsatzRepo);
  const alle: Beispiel[] = materialBefund(spuren, deps.konfiguration).beispiele.map((b) => ({
    merkmale: b.merkmale,
    kategorieId: b.kategorieId,
  }));
  if (alle.length < MESSBAR_AB) return null;

  /** Mittlere Genauigkeit, wenn nur Merkmale gezählt werden, die `behalten` durchlässt. */
  const messe = (behalten: (merkmal: string) => boolean): number => {
    let summe = 0;
    for (const seed of SPLITS) {
      const gefiltert = alle.map((b) => ({ ...b, merkmale: b.merkmale.filter(behalten) }));
      const { training, pruefung } = aufteilen(gefiltert, PRUEFANTEIL, seed);
      summe += bewerten(trainieren(training), pruefung).genauigkeit;
    }
    return summe / SPLITS.length;
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
  readonly hatModell: boolean;
}

export async function merkmalsansicht(
  deps: {
    readonly ledger: LedgerPort;
    readonly umsatzRepo: UmsatzRepository;
    readonly klassifikatorRepo: KlassifikatorRepository;
    readonly merkmalRepo: MerkmalskonfigurationRepository;
  },
  quelle: { gegenpartei: string; verwendungszweck: string },
): Promise<Merkmalsansicht> {
  const konf = await konfigurationLaden(deps.merkmalRepo);
  const befund = merkmalsbefund(quelle, konf.konfiguration);

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
    hatModell: !!modellstand,
  };
}
